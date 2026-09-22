import pg from "pg";
import { migrate } from "./migrations.js";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(pool);
  console.log("Versioned database migrations complete");
} finally {
  await pool.end();
}
