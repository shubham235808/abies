import { staffCases } from "./staff-cases.js";
import { migrate } from "../app/migrations.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "redis";
import request from "supertest";
import { createApp } from "../app/app.js";
const enabled = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_REDIS_URL;
test("PostgreSQL + Redis API integration", { skip: !enabled }, async (t) => {
  if (new URL(process.env.TEST_DATABASE_URL).pathname !== "/abies_test")
    throw new Error(
      "Integration tests require an isolated database named abies_test",
    );
  if (new URL(process.env.TEST_REDIS_URL).pathname !== "/15")
    throw new Error("Integration tests require isolated Redis database 15");
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const redis = createClient({ url: process.env.TEST_REDIS_URL });
  await redis.connect();
  t.after(async () => {
    await pool.end();
    await redis.quit();
  });
  await migrate(pool);
  // Reset only the explicitly named test database. Never use application credentials here.
  await pool.query(
    "TRUNCATE audit_events,order_items,orders,prescriptions,bookings,practitioners,users,products,services RESTART IDENTITY CASCADE",
  );
  await pool.query(
    await readFile(new URL("../../db/001_init.sql", import.meta.url), "utf8"),
  );
  await redis.flushDb();
  const origin = "http://localhost:3000";
  const app = createApp({
    pool,
    redis,
    config: { origin, secureCookie: false },
  });
  const alice = request.agent(app),
    bob = request.agent(app),
    doctor = request.agent(app);
  const post = (agent, path, body) =>
    agent
      .post("/api" + path)
      .set("Origin", origin)
      .send(body);
  let aliceId, bobId, doctorId, bookingId, prescriptionId;
  await t.test("health verifies both dependencies", async () => {
    await request(app).get("/api/health/ready").expect(200);
  });
  await t.test(
    "writes reject untrusted origins and anonymous requests",
    async () => {
      await request(app).post("/api/auth/register").send({}).expect(403);
      await post(request(app), "/bookings", {}).expect(401);
    },
  );
  await t.test(
    "registration, cookie session and duplicate account handling",
    async () => {
      const a = await post(alice, "/auth/register", {
        name: "Alice Patient",
        email: "alice@example.test",
        password: "test-password-123",
      }).expect(200);
      aliceId = a.body.id;
      assert.match(a.headers["set-cookie"][0], /HttpOnly/);
      assert.match(a.headers["set-cookie"][0], /SameSite=Lax/);
      assert.equal(a.body.password_hash, undefined);
      bobId = (
        await post(bob, "/auth/register", {
          name: "Bob Patient",
          email: "bob@example.test",
          password: "test-password-123",
        }).expect(200)
      ).body.id;
      doctorId = (
        await post(doctor, "/auth/register", {
          name: "Demo Clinician",
          email: "doctor@example.test",
          password: "test-password-123",
        }).expect(200)
      ).body.id;
      await post(alice, "/auth/register", {
        name: "Alice",
        email: "alice@example.test",
        password: "test-password-123",
      }).expect(409);
      await post(request(app), "/auth/login", {
        email: "alice@example.test",
        password: "invalid-password",
      }).expect(401);
      assert.equal(
        (await alice.get("/api/auth/me").expect(200)).body.id,
        aliceId,
      );
    },
  );
  await t.test(
    "catalog has all five care areas including the medicine store",
    async () => {
      const c = (await alice.get("/api/catalog").expect(200)).body;
      assert.equal(new Set(c.services.map((s) => s.category)).size, 4);
      assert.equal(c.products.length, 5);
      assert.ok(await redis.get("catalog:v2"));
    },
  );
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const payload = {
    serviceId: "doctor",
    practitionerId: "ananya",
    startsAt: `${day}T10:00:00.000Z`,
    mode: "video",
  };
  await t.test(
    "concurrent bookings reserve only one practitioner slot",
    async () => {
      const responses = await Promise.all([
        post(alice, "/bookings", payload),
        post(bob, "/bookings", payload),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const winner = responses.find((r) => r.status === 201).body;
      // Other tests use Alice's separately reserved slot.
      bookingId = (
        await post(alice, "/bookings", {
          ...payload,
          startsAt: `${day}T11:00:00.000Z`,
        }).expect(201)
      ).body.id;
      const slots = (
        await alice
          .get(`/api/slots?practitionerId=ananya&date=${day}`)
          .expect(200)
      ).body;
      assert.ok(!slots.includes(winner.starts_at));
      assert.ok(!slots.includes(`${day}T11:00:00.000Z`));
    },
  );
  await t.test(
    "booking rejects mismatched practitioner, invalid mode and missing address",
    async () => {
      await post(alice, "/bookings", {
        ...payload,
        practitionerId: "meera",
      }).expect(400);
      await post(alice, "/bookings", { ...payload, mode: "home" }).expect(400);
      await post(alice, "/bookings", {
        ...payload,
        serviceId: "physio",
        practitionerId: "rohan",
        mode: "home",
      }).expect(400);
    },
  );
  await t.test(
    "all consultation categories can book valid sessions",
    async () => {
      for (const [serviceId, practitionerId, mode] of [
        ["abhyanga", "meera", "clinic"],
        ["wellness", "collection", "home"],
        ["physio", "rohan", "home"],
      ]) {
        await post(alice, "/bookings", {
          ...payload,
          serviceId,
          practitionerId,
          mode,
          address: "12 Test Road, Test City 100001",
        }).expect(201);
      }
    },
  );
  await t.test(
    "booking ownership prevents cross-account cancellation",
    async () => {
      await post(bob, `/bookings/${bookingId}/cancel`, {}).expect(404);
      const rows = (await bob.get("/api/bookings").expect(200)).body;
      assert.ok(rows.every((r) => r.user_id === bobId));
    },
  );
  await t.test(
    "uploads validate type and enforce private downloads",
    async () => {
      await alice
        .post("/api/prescriptions/upload")
        .set("Origin", origin)
        .attach("file", Buffer.from("<script>bad</script>"), {
          filename: "fake.pdf",
          contentType: "application/pdf",
        })
        .expect(400);
      const r = await alice
        .post("/api/prescriptions/upload")
        .set("Origin", origin)
        .attach("file", Buffer.from("%PDF-1.4\nTest fixture only"), {
          filename: "sample.pdf",
          contentType: "application/pdf",
        })
        .expect(201);
      prescriptionId = r.body.id;
      await alice.get(`/api/prescriptions/${prescriptionId}/file`).expect(200);
      await bob.get(`/api/prescriptions/${prescriptionId}/file`).expect(404);
      await request(app)
        .get(`/api/prescriptions/${prescriptionId}/file`)
        .expect(401);
    },
  );
  await t.test(
    "only assigned clinicians can issue patient prescriptions",
    async () => {
      await post(alice, "/clinician/prescriptions", {
        bookingId,
        notes: "Sample instructions for test only.",
      }).expect(403);
      await pool.query("UPDATE users SET role='clinician' WHERE id=$1", [
        doctorId,
      ]);
      await post(doctor, "/clinician/prescriptions", {
        bookingId,
        notes: "Sample instructions for test only.",
      }).expect(404);
      await pool.query("UPDATE practitioners SET user_id=$1 WHERE id=$2", [
        doctorId,
        "ananya",
      ]);
      await post(doctor, "/clinician/prescriptions", {
        bookingId,
        notes: "Sample instructions for test only.",
      }).expect(201);
      const records = (await alice.get("/api/prescriptions").expect(200)).body;
      assert.ok(
        records.some((p) => p.notes === "Sample instructions for test only."),
      );
    },
  );
  const order = (items, extra = {}) => ({
    items,
    address: "12 Test Road, Test City 100001",
    idempotencyKey: randomUUID(),
    ...extra,
  });
  await t.test(
    "checkout computes trusted totals and idempotent retries do not decrement stock twice",
    async () => {
      const body = order([{ productId: "ashwagandha", quantity: 2 }]);
      const results = await Promise.all([
        post(alice, "/orders", body),
        post(alice, "/orders", body),
      ]);
      assert.ok(results.every((r) => [200, 201].includes(r.status)));
      assert.equal(results[0].body.id, results[1].body.id);
      assert.equal(results[0].body.total, 69800);
      assert.equal(
        (await pool.query("SELECT stock FROM products WHERE id='ashwagandha'"))
          .rows[0].stock,
        78,
      );
    },
  );
  await t.test(
    "prescription checkout validates ownership and stays pending review",
    async () => {
      const body = order([{ productId: "clinical", quantity: 1 }]);
      await post(alice, "/orders", body).expect(400);
      await post(bob, "/orders", { ...body, prescriptionId }).expect(400);
      const placed = await post(alice, "/orders", {
        ...body,
        prescriptionId,
      }).expect(201);
      assert.equal(placed.body.status, "demo_awaiting_prescription_review");
    },
  );
  await t.test(
    "failed checkout rolls back stock and order creation",
    async () => {
      const before = (
        await pool.query("SELECT stock FROM products WHERE id='ashwagandha'")
      ).rows[0].stock;
      await post(
        alice,
        "/orders",
        order([
          { productId: "ashwagandha", quantity: 1 },
          { productId: "zz-missing", quantity: 1 },
        ]),
      ).expect(409);
      assert.equal(
        (await pool.query("SELECT stock FROM products WHERE id='ashwagandha'"))
          .rows[0].stock,
        before,
      );
      await post(
        alice,
        "/orders",
        order([{ productId: "ashwagandha", quantity: -1 }]),
      ).expect(400);
    },
  );
  await t.test("parallel checkout cannot oversell stock", async () => {
    await pool.query("UPDATE products SET stock=1 WHERE id='brahmi'");
    const results = await Promise.all([
      post(alice, "/orders", order([{ productId: "brahmi", quantity: 1 }])),
      post(bob, "/orders", order([{ productId: "brahmi", quantity: 1 }])),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  });
  await t.test(
    "cancellation releases a slot and logout invalidates the session",
    async () => {
      await post(alice, `/bookings/${bookingId}/cancel`, {}).expect(200);
      const slots = (
        await alice
          .get(`/api/slots?practitionerId=ananya&date=${day}`)
          .expect(200)
      ).body;
      assert.ok(slots.includes(`${day}T11:00:00.000Z`));
      await post(alice, "/auth/logout", {}).expect(200);
      await alice.get("/api/auth/me").expect(401);
    },
  );
  await staffCases(t, { app, pool, redis, origin });
});
