import argon2 from 'argon2';

// Password hashing for the password-auth backend (docs/password-auth-backend.md).
//
// Argon2id (the hybrid variant OWASP/RFC 9106 recommend as the general
// default) with the library's own tuned cost parameters. Minimum length
// (12 characters, enforced one layer up via zod in auth.schemas.ts — NOT
// in this module) plus a memory-hard KDF is what current guidance (NIST
// SP 800-63B §5.1.1, OWASP ASVS V2.1) actually calls for. There is
// deliberately no uppercase/digit/special-character "complexity" check
// here: that class of rule is old (pre-2017) guidance that research since
// has shown mostly pushes people toward shorter, more predictable
// passwords built around a required special character, and it would
// actively break this app's passphrase support (a 20+ character phrase
// with spaces and no digits must be accepted). Length + a slow, salted,
// memory-hard hash is the actual defense.
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed or foreign-format hash (shouldn't happen for our own
    // rows, but argon2.verify throws rather than returning false for
    // one) is treated as "doesn't match" rather than propagating — every
    // caller just awaits a boolean.
    return false;
  }
}
