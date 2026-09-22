export const config = {
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  origin: process.env.APP_ORIGIN || "http://localhost:3000",
  secureCookie: process.env.COOKIE_SECURE !== "false",
};
