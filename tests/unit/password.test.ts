import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@abies/domain/lib/password';

describe('password hashing (argon2id)', () => {
  it('round-trips a passphrase with spaces', async () => {
    const plain = 'correct horse battery staple';
    const hash = await hashPassword(plain);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('the correct password, twelve chars plus');
    expect(await verifyPassword('not the correct password', hash)).toBe(false);
  });

  it('produces a different hash each time for the same input (random salt)', async () => {
    const plain = 'same password every time 123';
    const [a, b] = await Promise.all([hashPassword(plain), hashPassword(plain)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(plain, a)).toBe(true);
    expect(await verifyPassword(plain, b)).toBe(true);
  });

  it('treats a malformed/foreign hash as a failed verification, not a thrown error', async () => {
    await expect(verifyPassword('anything', 'not-a-real-argon2-hash')).resolves.toBe(false);
  });
});
