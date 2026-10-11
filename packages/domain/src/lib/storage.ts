import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from './env';
import { BadRequestError } from './errors';

// S3-compatible object storage adapter (MinIO for self-hosted dev/prod).
// Every file in the system — doctor credentials, diagnostic reports,
// prescriptions, partner documents — goes through this module.
//
// getSignedDownloadUrl() exists but its URL is signed against
// STORAGE_ENDPOINT, an in-cluster-only host (e.g. "http://minio:9000") no
// browser outside the cluster can reach — confirmed broken for every real
// external user (2026-10-11). Every caller that serves a URL to a browser
// must proxy bytes through this app instead, via getObjectStream/
// objectResponse (route handlers streaming the response themselves) —
// never hand a getSignedDownloadUrl() result to a client directly. The
// function is kept only for any genuinely server-to-server use.

let client: S3Client | undefined;

function s3() {
  if (client) return client;
  const env = getEnv();
  client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export async function putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
  const env = getEnv();
  await s3().send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const env = getEnv();
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

// Reads an object's bytes for the few routes that stream a file through the
// app (e.g. public catalogue images). Callers must restrict the key themselves.
export async function getObjectBytes(key: string): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const env = getEnv();
  const res = await s3().send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  const body = await res.Body!.transformToByteArray();
  return { body, contentType: res.ContentType };
}

export interface ObjectStream {
  body: ReadableStream;
  contentType: string | undefined;
  contentLength: number | undefined;
  // Set only when a range was requested, e.g. "bytes 0-1023/52428800".
  contentRange: string | undefined;
}

// Streams an object (or one byte range of it) without buffering it in
// memory — getObjectBytes is fine for a 2 MB catalogue image, not for a
// video, and browsers (Safari in particular) refuse to play a <video>
// whose source can't answer Range requests. Callers must restrict the key
// themselves and pass only a syntactically valid single range.
export async function getObjectStream(key: string, range?: string): Promise<ObjectStream> {
  const env = getEnv();
  const res = await s3().send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Range: range }));
  return {
    body: res.Body!.transformToWebStream(),
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
  };
}

// Simple whole-object response for images/documents that don't need Range
// support (that's `getObjectStream`'s job, for video/large-file seeking) —
// most callers here are small images or PDFs a browser just loads once.
// Content-Type comes from whatever was set on PutObject, not guessed.
export async function objectResponse(
  key: string,
  opts: { cacheControl: string; contentDisposition?: string },
): Promise<Response> {
  const object = await getObjectStream(key);
  const headers = new Headers({
    'content-type': object.contentType ?? 'application/octet-stream',
    'cache-control': opts.cacheControl,
  });
  if (object.contentLength !== undefined) headers.set('content-length', String(object.contentLength));
  if (opts.contentDisposition) headers.set('content-disposition', opts.contentDisposition);
  return new Response(object.body, { status: 200, headers });
}

export async function deleteObject(key: string): Promise<void> {
  const env = getEnv();
  await s3().send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
}

// Cheap, side-effect-free connectivity check for /api/ready — confirms the
// endpoint is reachable, credentials are valid, and the bucket exists,
// without reading or writing any object.
export async function checkStorageHealth(): Promise<boolean> {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: getEnv().STORAGE_BUCKET }));
    return true;
  } catch {
    return false;
  }
}

// Upload validation shared by every module that accepts a file (doctor
// documents, reports, support attachments). Ported from the Sprint 3
// doctor-document allowlist (docs/DECISIONS.md D3) and generalized.
const DEFAULT_ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// Magic-byte check per declared MIME type — the declared type alone is
// just the uploader's Content-Type claim, not evidence of what the file
// actually is. Only covers the types this app ever allows (docs/platform/
// SECURITY-GAP-ANALYSIS.md §3); add a signature here before adding a new
// type to DEFAULT_ALLOWED_MIME_TYPES or any call site's own allow-list.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EBML_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const MAGIC_BYTE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  'application/pdf': (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE),
  'image/webp': (buf) =>
    buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  // ISO-BMFF: every MP4 opens with a box whose type, at offset 4, is 'ftyp'.
  'video/mp4': (buf) => buf.length >= 8 && buf.subarray(4, 8).toString('latin1') === 'ftyp',
  // WebM is Matroska, which opens with the EBML header element ID.
  'video/webm': (buf) => buf.length >= 4 && buf.subarray(0, 4).equals(EBML_SIGNATURE),
};

export function assertUploadAllowed(
  file: { mimetype: string; size: number; buffer: Buffer },
  opts: { allowedMimeTypes?: Set<string>; maxBytes?: number } = {},
): void {
  const allowed = opts.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  const maxBytes = opts.maxBytes ?? getEnv().UPLOAD_MAX_BYTES;
  if (!allowed.has(file.mimetype)) {
    throw new BadRequestError(`Unsupported file type: ${file.mimetype}`);
  }
  if (file.size > maxBytes) {
    throw new BadRequestError(`File exceeds maximum allowed size of ${maxBytes} bytes`);
  }
  const matchesContent = MAGIC_BYTE_CHECKS[file.mimetype];
  if (matchesContent && !matchesContent(file.buffer)) {
    throw new BadRequestError(`File content does not match declared type: ${file.mimetype}`);
  }
}
