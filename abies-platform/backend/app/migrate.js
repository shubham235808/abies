import pg from "pg";
import { readFile } from "node:fs/promises";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(827411)");
  await client.query(
    await readFile(new URL("../../db/001_init.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  console.log("Database schema and sample catalog ready");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
