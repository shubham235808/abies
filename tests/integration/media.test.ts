// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@abies/domain/lib/errors';
import { getObjectBytes } from '@abies/domain/lib/storage';
import {
  activeTestimonials,
  createTestimonial,
  getTestimonial,
  publicTestimonialPhoto,
  publicTestimonialVideo,
  removeTestimonial,
  updateTestimonial,
  type UploadedImage,
} from '@abies/domain/modules/content/testimonials.service';
import { MEDIA_VIDEO_MAX_BYTES } from '@abies/domain/modules/media/media.schemas';
import {
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  mediaFileResponse,
  uploadMediaAsset,
  type UploadedMediaFile,
} from '@abies/domain/modules/media/media.service';

const tag = `TEST_MEDIA_${randomInt(100000, 999999)}`;
const createdAssetIds: string[] = [];
const createdTestimonialIds: string[] = [];

afterAll(async () => {
  for (const id of createdTestimonialIds) await removeTestimonial(id, {}).catch(() => {});
  for (const id of createdAssetIds) await deleteMediaAsset(id, {}).catch(() => {});
  await prisma.$disconnect();
});

// A PNG signature plus a real IHDR chunk header — enough for both the
// magic-byte check and the dimension probe.
function pngFile(name: string, width: number, height: number): UploadedMediaFile {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  const buffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
  return { originalName: name, mimeType: 'image/png', size: buffer.length, buffer };
}

function box(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}

// ftyp + moov/mvhd (version 0) declaring `seconds` at a 1000 Hz timescale.
function mp4File(name: string, seconds: number): UploadedMediaFile {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  const buffer = Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('moov', box('mvhd', mvhd))]);
  return { originalName: name, mimeType: 'video/mp4', size: buffer.length, buffer };
}

function webmFile(name: string): UploadedMediaFile {
  const buffer = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('fake-webm-body-bytes')]);
  return { originalName: name, mimeType: 'video/webm', size: buffer.length, buffer };
}

async function upload(file: UploadedMediaFile) {
  const asset = await uploadMediaAsset(file, 'admin-user-id', {});
  createdAssetIds.push(asset.id);
  return asset;
}

function forget(list: string[], id: string) {
  list.splice(list.indexOf(id), 1);
}

describe('Media library uploads', () => {
  it('stores an image with its pixel size and serves it through the admin file URL', async () => {
    const file = pngFile(`${tag}-banner.png`, 640, 480);
    const asset = await upload(file);

    expect(asset.kind).toBe('IMAGE');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.sizeBytes).toBe(file.size);
    expect(asset.width).toBe(640);
    expect(asset.height).toBe(480);
    expect(asset.durationSeconds).toBeNull();
    expect(asset.storageKey).toMatch(new RegExp(`^media/${asset.id}/.+-${tag}-banner\\.png$`));
    expect(asset.fileUrl).toBe(`/api/v1/admin/media/${asset.id}/file`);

    const stored = await getObjectBytes(asset.storageKey);
    expect(Buffer.from(stored.body).equals(file.buffer)).toBe(true);
  });

  it('stores an MP4 with its duration read from the container header', async () => {
    const asset = await upload(mp4File(`${tag}-clip.mp4`, 12.5));
    expect(asset.kind).toBe('VIDEO');
    expect(asset.durationSeconds).toBe(12.5);
    expect(asset.width).toBeNull();
  });

  it('stores a WebM with no duration (not probed)', async () => {
    const asset = await upload(webmFile(`${tag}-clip.webm`));
    expect(asset.kind).toBe('VIDEO');
    expect(asset.mimeType).toBe('video/webm');
    expect(asset.durationSeconds).toBeNull();
  });

  it('rejects unsupported types, mismatched content and oversize files as bad requests', async () => {
    const pdf = Buffer.from('%PDF-1.7 fake');
    await expect(
      uploadMediaAsset({ originalName: 'doc.pdf', mimeType: 'application/pdf', size: pdf.length, buffer: pdf }, 'admin-user-id', {}),
    ).rejects.toThrow(BadRequestError);

    const notReallyMp4 = Buffer.from('this is not a video at all');
    await expect(
      uploadMediaAsset({ originalName: 'x.mp4', mimeType: 'video/mp4', size: notReallyMp4.length, buffer: notReallyMp4 }, 'admin-user-id', {}),
    ).rejects.toThrow(/does not match declared type/);

    const tooBigVideo = mp4File('big.mp4', 1);
    await expect(uploadMediaAsset({ ...tooBigVideo, size: MEDIA_VIDEO_MAX_BYTES + 1 }, 'admin-user-id', {})).rejects.toThrow(
      BadRequestError,
    );

    // Images keep the shared UPLOAD_MAX_BYTES cap, well under the video one.
    const bigImage = pngFile('big.png', 10, 10);
    await expect(uploadMediaAsset({ ...bigImage, size: 20 * 1024 * 1024 }, 'admin-user-id', {})).rejects.toThrow(BadRequestError);
  });
});

describe('Media library browsing', () => {
  it('searches by file name (case-insensitive), filters by kind, and paginates newest first', async () => {
    const searchTag = `${tag}-SEARCH`;
    const first = await upload(pngFile(`${searchTag}-a.png`, 1, 1));
    const second = await upload(mp4File(`${searchTag}-b.mp4`, 3));
    const third = await upload(pngFile(`${searchTag}-c.png`, 2, 2));

    const all = await listMediaAssets({ q: searchTag.toLowerCase(), page: 1, pageSize: 24 });
    expect(all.total).toBe(3);
    expect(all.items.map((a) => a.id)).toEqual([third.id, second.id, first.id]);

    const videos = await listMediaAssets({ q: searchTag, kind: 'VIDEO', page: 1, pageSize: 24 });
    expect(videos.items.map((a) => a.id)).toEqual([second.id]);

    const page2 = await listMediaAssets({ q: searchTag, page: 2, pageSize: 2 });
    expect(page2.total).toBe(3);
    expect(page2.items.map((a) => a.id)).toEqual([first.id]);

    const none = await listMediaAssets({ q: `${tag}-nothing-matches-this`, page: 1, pageSize: 24 });
    expect(none.total).toBe(0);
  });

  it('streams a byte range with 206, and answers an unsatisfiable range with 416', async () => {
    const file = mp4File(`${tag}-range.mp4`, 2);
    const asset = await upload(file);

    const full = await mediaFileResponse(asset, null, 'private');
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(Buffer.from(await full.arrayBuffer()).equals(file.buffer)).toBe(true);

    const partial = await mediaFileResponse(asset, 'bytes=4-7', 'private');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes 4-7/${file.size}`);
    expect(Buffer.from(await partial.arrayBuffer()).toString('latin1')).toBe('ftyp');

    const unsatisfiable = await mediaFileResponse(asset, `bytes=${file.size}-`, 'private');
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe(`bytes */${file.size}`);
  });
});

describe('Media library deletion', () => {
  it('deletes an unreferenced asset together with its stored object', async () => {
    const asset = await upload(pngFile(`${tag}-delete-me.png`, 4, 4));
    await deleteMediaAsset(asset.id, {});
    forget(createdAssetIds, asset.id);

    await expect(getMediaAsset(asset.id)).rejects.toThrow(NotFoundError);
    await expect(getObjectBytes(asset.storageKey)).rejects.toThrow();
  });
});

const fakeUploadedPhoto: UploadedImage = {
  originalName: 'author.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fake-jpeg-bytes')]),
};

describe('Testimonials reusing media-library assets', () => {
  it('creates a testimonial from a library photo and video, serves both, and blocks deleting the assets while in use', async () => {
    const photo = await upload(pngFile(`${tag}-author.png`, 200, 200));
    const video = await upload(mp4File(`${tag}-story.mp4`, 30));

    const testimonial = await createTestimonial(
      {
        authorName: `${tag} library author`,
        quote: `${tag} quote`,
        priority: 1000,
        active: true,
        photoAssetId: photo.id,
        videoAssetId: video.id,
      },
      null,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(testimonial.id);
    expect(testimonial.photoKey).toBeNull();
    expect(testimonial.photoAssetId).toBe(photo.id);
    expect(testimonial.videoAssetId).toBe(video.id);

    const served = (await activeTestimonials(50)).find((t) => t.id === testimonial.id);
    // Same-origin proxy routes, never a direct signed storage URL —
    // STORAGE_ENDPOINT is in-cluster-only (lib/storage.ts).
    expect(served?.photoUrl).toBe(`/api/v1/public/testimonials/${testimonial.id}/photo`);
    expect(served?.videoUrl).toBe(`/api/v1/public/testimonials/${testimonial.id}/video`);
    expect((await publicTestimonialPhoto(testimonial.id)).storageKey).toBe(photo.storageKey);
    expect((await publicTestimonialVideo(testimonial.id)).storageKey).toBe(video.storageKey);

    await expect(deleteMediaAsset(photo.id, {})).rejects.toThrow(ConflictError);
    await expect(deleteMediaAsset(video.id, {})).rejects.toThrow(ConflictError);

    // Removing the testimonial must not take the shared library objects with it.
    await removeTestimonial(testimonial.id, {});
    forget(createdTestimonialIds, testimonial.id);
    await expect(getObjectBytes(photo.storageKey)).resolves.toBeDefined();
    await expect(getObjectBytes(video.storageKey)).resolves.toBeDefined();

    await deleteMediaAsset(photo.id, {});
    forget(createdAssetIds, photo.id);
  });

  it('swaps an uploaded photo for a library one (deleting only the old upload) and back again', async () => {
    const libraryPhoto = await upload(pngFile(`${tag}-swap.png`, 50, 50));
    const testimonial = await createTestimonial(
      { authorName: `${tag} swap author`, quote: `${tag} swap quote`, priority: 0, active: true },
      fakeUploadedPhoto,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(testimonial.id);
    const uploadedKey = testimonial.photoKey!;
    expect(uploadedKey).toContain(`testimonials/${testimonial.id}/`);

    const picked = await updateTestimonial(testimonial.id, { photoAssetId: libraryPhoto.id }, null, {});
    expect(picked.photoAssetId).toBe(libraryPhoto.id);
    expect(picked.photoKey).toBeNull();
    await expect(getObjectBytes(uploadedKey)).rejects.toThrow();

    const reuploaded = await updateTestimonial(testimonial.id, {}, fakeUploadedPhoto, {});
    expect(reuploaded.photoKey).toContain(`testimonials/${testimonial.id}/`);
    expect(reuploaded.photoAssetId).toBeNull();
    await expect(getObjectBytes(libraryPhoto.storageKey)).resolves.toBeDefined();
  });

  it('rejects contradictory or mismatched library references', async () => {
    const image = await upload(pngFile(`${tag}-kind.png`, 8, 8));
    const video = await upload(webmFile(`${tag}-kind.webm`));
    const base = { authorName: `${tag} bad refs`, quote: `${tag} q`, priority: 0, active: true };

    await expect(createTestimonial({ ...base, photoAssetId: image.id }, fakeUploadedPhoto, 'admin-user-id', {})).rejects.toThrow(
      BadRequestError,
    );
    await expect(createTestimonial({ ...base, photoAssetId: video.id }, null, 'admin-user-id', {})).rejects.toThrow(/not an image/);
    await expect(createTestimonial({ ...base, videoAssetId: image.id }, null, 'admin-user-id', {})).rejects.toThrow(/not a video/);
    await expect(createTestimonial({ ...base, videoAssetId: 'no-such-asset' }, null, 'admin-user-id', {})).rejects.toThrow(
      /no longer exists/,
    );
  });

  it('clears a video reference with null and hides an inactive testimonial’s video', async () => {
    const video = await upload(mp4File(`${tag}-hide.mp4`, 5));
    const testimonial = await createTestimonial(
      { authorName: `${tag} hidden`, quote: `${tag} hidden quote`, priority: 0, active: false, videoAssetId: video.id },
      null,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(testimonial.id);
    await expect(publicTestimonialVideo(testimonial.id)).rejects.toThrow(NotFoundError);

    await updateTestimonial(testimonial.id, { videoAssetId: null }, null, {});
    expect((await getTestimonial(testimonial.id)).videoAssetId).toBeNull();
    await deleteMediaAsset(video.id, {});
    forget(createdAssetIds, video.id);
  });
});
