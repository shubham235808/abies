import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, checkPassword, sessionKey } from "../app/security.js";
import { validSlot } from "../app/validation.js";
test("password hashes are salted, verifiable and reject incorrect passwords", async () => {
  const first = await hashPassword("test password 123!"),
    second = await hashPassword("test password 123!");
  assert.notEqual(first, second);
  assert.equal(await checkPassword("test password 123!", first), true);
  assert.equal(await checkPassword("not the right password", first), false);
  assert.equal(sessionKey("secret").includes("secret"), false);
});
test("booking policy rejects past, off-hour and out-of-window slots", () => {
  const d = new Date(Date.now() + 86400000);
  d.setUTCHours(10, 0, 0, 0);
  assert.equal(validSlot(d.toISOString()), true);
  d.setUTCMinutes(30);
  assert.equal(validSlot(d.toISOString()), false);
  assert.equal(validSlot(new Date(Date.now() - 86400000).toISOString()), false);
  assert.equal(
    validSlot(new Date(Date.now() + 61 * 86400000).toISOString()),
    false,
  );
});
