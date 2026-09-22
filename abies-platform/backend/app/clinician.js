// Run from backend: node app/clinician.js <registered-email> <practitioner-id>
import pg from "pg";
const [email, practitioner] = process.argv.slice(2);
if (!email || !practitioner)
  throw new Error(
    "Usage: node app/clinician.js <registered-email> <practitioner-id>",
  );
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  const {
    rows: [u],
  } = await c.query("SELECT id FROM users WHERE email=$1", [
    email.toLowerCase(),
  ]);
  if (!u) throw new Error("Register the account first");
  const { rows } = await c.query(
    "UPDATE practitioners SET user_id=$1 WHERE id=$2 AND (user_id IS NULL OR user_id=$1) RETURNING id",
    [u.id, practitioner],
  );
  if (!rows.length) throw new Error("Practitioner missing or already assigned");
  await c.query("UPDATE users SET role='clinician' WHERE id=$1", [u.id]);
  await c.query("COMMIT");
  console.log(
    "Clinician role and practitioner assignment saved. Sign in again.",
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
