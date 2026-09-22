import pg from "pg";
import { createClient } from "redis";
import { config } from "./config.js";
import { createApp } from "./app.js";
if (!config.databaseUrl || !config.redisUrl)
  throw new Error("DATABASE_URL and REDIS_URL are required");
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});
const redis = createClient({ url: config.redisUrl });
redis.on("error", () => console.error("Redis connection error"));
await redis.connect();
const app = createApp({ pool, redis, config });
const server = app.listen(config.port, "0.0.0.0", () =>
  console.log(`Abies API listening on ${config.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      await redis.quit();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
