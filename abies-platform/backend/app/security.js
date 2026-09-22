import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function checkPassword(password, encoded) {
  const [salt, hash] = encoded.split(":");
  return timingSafeEqual(
    await scrypt(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export const sessionKey = (token) =>
  `session:${createHash("sha256").update(token).digest("hex")}`;
export const cookieName = "abies_session";
export function getToken(req) {
  return req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
