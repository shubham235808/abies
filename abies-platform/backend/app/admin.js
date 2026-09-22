// Create a separate first administrator. Existing emails require explicit promotion.
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "./security.js";
import { registration } from "./validation.js";
const [email, name = "Abies Administrator", option] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(827412)");
  const data = registration.parse({
    email,
    name,
    password: randomBytes(24).toString("base64url"),
  });
  const {
    rows: [existing],
  } = await c.query("SELECT id FROM users WHERE email=$1 FOR UPDATE", [
    data.email,
  ]);
  if (existing && option !== "--promote-existing")
    throw new Error(
      "Account already exists. Review its ownership before explicitly using --promote-existing.",
    );
  if (existing)
    await c.query(
      "UPDATE users SET role='admin',active=true,version=version+1 WHERE id=$1",
      [existing.id],
    );
  else
    await c.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')",
      [randomUUID(), data.name, data.email, await hashPassword(data.password)],
    );
  await c.query("COMMIT");
  console.log(
    JSON.stringify({
      email: data.email,
      ...(!existing ? { password: data.password } : { promoted: true }),
    }),
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
