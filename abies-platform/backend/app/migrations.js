import { readFile, readdir } from "node:fs/promises";
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(827411)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL("../../db/", import.meta.url);
    const files = (await readdir(directory))
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();
    for (const name of files) {
      if (
        (
          await client.query(
            "SELECT name FROM schema_migrations WHERE name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      // Adopt databases created by the original initializer without reseeding their catalogs.
      const existing =
        name === "001_init.sql" &&
        (await client.query("SELECT to_regclass('public.users') AS name"))
          .rows[0].name;
      if (!existing)
        await client.query(await readFile(new URL(name, directory), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
