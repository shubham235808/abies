import { describe, expect, it, vi } from 'vitest';

describe('download-token.ts', () => {
  it('round-trips a storage key', async () => {
    const { createDownloadToken, verifyDownloadToken } = await import('../../packages/domain/src/lib/download-token');
    const token = createDownloadToken('doctors/abc/cert.pdf');
    expect(verifyDownloadToken(token)).toBe('doctors/abc/cert.pdf');
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    const { createDownloadToken, verifyDownloadToken } = await import('../../packages/domain/src/lib/download-token');
    const token = createDownloadToken('x', 1);
    vi.advanceTimersByTime(2_000);
    expect(() => verifyDownloadToken(token)).toThrow(/expired/i);
    vi.useRealTimers();
  });

  it('rejects a tampered key with a stale-but-matching signature', async () => {
    const { createDownloadToken, verifyDownloadToken } = await import('../../packages/domain/src/lib/download-token');
    const token = createDownloadToken('real-key');
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const tampered = Buffer.from(JSON.stringify({ ...decoded, k: 'other-key' })).toString('base64url');
    expect(() => verifyDownloadToken(tampered)).toThrow(/invalid/i);
  });

  it('rejects a malformed token outright', async () => {
    const { verifyDownloadToken } = await import('../../packages/domain/src/lib/download-token');
    expect(() => verifyDownloadToken('not-a-real-token')).toThrow();
    expect(() => verifyDownloadToken(Buffer.from('{}').toString('base64url'))).toThrow();
  });
});
