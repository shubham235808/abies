// Header-only metadata readers for the media library. Hand-rolled rather
// than pulling in sharp/ffprobe: the library only needs an image's pixel
// size and an MP4's duration, both of which sit at fixed, well-documented
// offsets. Every reader is best-effort — a file that parses oddly gets
// null metadata, never a rejected upload (assertUploadAllowed has already
// decided whether the upload itself is acceptable).

export interface ImageDimensions {
  width: number;
  height: number;
}

function pngDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24 || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// SOFn markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share
// the 0xC_ range but aren't frame headers.
const JPEG_NON_SOF = new Set([0xc4, 0xc8, 0xcc]);

function jpegDimensions(buf: Buffer): ImageDimensions | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf.readUInt8(i + 1);
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && !JPEG_NON_SOF.has(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function webpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null;
  const chunk = buf.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

export function probeImageDimensions(mimeType: string, buf: Buffer): ImageDimensions | null {
  try {
    if (mimeType === 'image/png') return pngDimensions(buf);
    if (mimeType === 'image/jpeg') return jpegDimensions(buf);
    if (mimeType === 'image/webp') return webpDimensions(buf);
  } catch {
    // Truncated or malformed header — metadata is optional.
  }
  return null;
}

interface Box {
  bodyStart: number;
  end: number;
}

function findBox(buf: Buffer, start: number, end: number, type: string): Box | null {
  let i = start;
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(i + 8));
      header = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < header) return null;
    if (buf.subarray(i + 4, i + 8).toString('latin1') === type) return { bodyStart: i + header, end: Math.min(i + size, end) };
    i += size;
  }
  return null;
}

// moov/mvhd holds the whole presentation's timescale and duration. WebM is
// deliberately not covered: its Duration element is optional (browser
// MediaRecorder output usually omits it) and reading it means walking
// EBML variable-length integers — not worth it for a display-only field.
export function probeVideoDurationSeconds(mimeType: string, buf: Buffer): number | null {
  if (mimeType !== 'video/mp4') return null;
  try {
    const moov = findBox(buf, 0, buf.length, 'moov');
    if (!moov) return null;
    const mvhd = findBox(buf, moov.bodyStart, moov.end, 'mvhd');
    if (!mvhd) return null;
    const p = mvhd.bodyStart;
    const version = buf[p];
    const timescale = version === 1 ? buf.readUInt32BE(p + 20) : buf.readUInt32BE(p + 12);
    const duration = version === 1 ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16);
    if (!timescale) return null;
    return Math.round((duration / timescale) * 100) / 100;
  } catch {
    return null;
  }
}
