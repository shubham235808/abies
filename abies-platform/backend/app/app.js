import express from "express";
import helmet from "helmet";
import multer from "multer";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  hashPassword,
  checkPassword,
  sessionKey,
  cookieName,
  getToken,
} from "./security.js";
import {
  registration,
  login,
  booking,
  checkout,
  uuid,
  validSlot,
} from "./validation.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export function createApp({ pool, redis, config }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    res.set("X-Request-ID", randomUUID());
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== config.origin
    )
      return next(fail(403, "Request origin is not allowed"));
    next();
  });
  const limit = (prefix, max) => async (req, res, next) => {
    const key = `limit:${prefix}:${req.ip}`;
    // Atomic counter + expiry; raw forwarded headers are deliberately not trusted.
    const count = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      { keys: [key], arguments: [] },
    );
    if (count > max)
      throw fail(429, "Too many requests. Please try again in a minute.");
    next();
  };
  const auth = async (req, res, next) => {
    const token = getToken(req),
      id = token && (await redis.get(sessionKey(token)));
    if (!id) throw fail(401, "Please sign in to continue");
    const { rows } = await pool.query(
      "SELECT id,name,email,role FROM users WHERE id=$1",
      [id],
    );
    if (!rows[0]) throw fail(401, "Session expired");
    req.user = rows[0];
    next();
  };
  const clinician = (req, res, next) => {
    if (req.user.role !== "clinician")
      throw fail(403, "Clinician access required");
    next();
  };
  const audit = (db, user, action, id) =>
    db.query(
      "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,$2,$3)",
      [user, action, id],
    );
  async function session(req, res, user) {
    const old = getToken(req);
    if (old) await redis.del(sessionKey(old));
    const token = randomBytes(32).toString("hex");
    await redis.set(sessionKey(token), user.id, { EX: 86400 });
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 86400000,
    });
    res.json(publicUser(user));
  }
  app.get("/api/health/live", (req, res) => res.json({ status: "ok" }));
  app.get("/api/health/ready", async (req, res) => {
    await pool.query("SELECT 1");
    await redis.ping();
    res.json({ status: "ready" });
  });
  app.post("/api/auth/register", limit("auth", 20), async (req, res) => {
    const data = registration.parse(req.body),
      id = randomUUID();
    const { rows } = await pool.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
      [id, data.name, data.email, await hashPassword(data.password)],
    );
    await session(req, res, rows[0]);
  });
  app.post("/api/auth/login", limit("auth", 20), async (req, res) => {
    const data = login.parse(req.body);
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
      data.email,
    ]);
    if (
      !rows[0] ||
      !(await checkPassword(data.password, rows[0].password_hash))
    )
      throw fail(401, "Invalid email or password");
    await session(req, res, rows[0]);
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = getToken(req);
    if (token) await redis.del(sessionKey(token));
    res.clearCookie(cookieName, {
      path: "/",
      secure: config.secureCookie,
      sameSite: "lax",
      httpOnly: true,
    });
    res.json({ ok: true });
  });
  app.get("/api/auth/me", auth, (req, res) => res.json(publicUser(req.user)));
  app.get("/api/catalog", async (req, res) => {
    const cached = await redis.get("catalog:v1");
    if (cached) return res.json(JSON.parse(cached));
    const [services, practitioners, products] = await Promise.all(
      ["services", "practitioners", "products"].map((t) =>
        pool.query(`SELECT * FROM ${t} ORDER BY id`),
      ),
    );
    const catalog = {
      services: services.rows,
      practitioners: practitioners.rows.map(({ user_id, ...p }) => p),
      products: products.rows,
    };
    await redis.set("catalog:v1", JSON.stringify(catalog), { EX: 60 });
    res.json(catalog);
  });
  app.get("/api/slots", async (req, res) => {
    const p = z.string().min(1).max(80).parse(req.query.practitionerId),
      day = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.query.date);
    if (Number.isNaN(Date.parse(day))) throw fail(400, "Invalid date");
    const { rows } = await pool.query(
      "SELECT starts_at FROM bookings WHERE practitioner_id=$1 AND status='confirmed' AND starts_at >= $2 AND starts_at < $2::timestamptz + interval '1 day'",
      [p, day + "T00:00:00Z"],
    );
    const taken = new Set(rows.map((x) => new Date(x.starts_at).toISOString()));
    res.json(
      Array.from(
        { length: 8 },
        (_, i) => `${day}T${String(i + 9).padStart(2, "0")}:00:00.000Z`,
      ).filter((d) => validSlot(d) && !taken.has(d)),
    );
  });
  app.post("/api/bookings", auth, limit("booking", 60), async (req, res) => {
    const b = booking.parse(req.body);
    if (!validSlot(b.startsAt))
      throw fail(
        400,
        "Choose an available hourly slot within the next 60 days (09:00–17:00 UTC)",
      );
    const {
      rows: [s],
    } = await pool.query("SELECT * FROM services WHERE id=$1", [b.serviceId]);
    const {
      rows: [p],
    } = await pool.query("SELECT * FROM practitioners WHERE id=$1", [
      b.practitionerId,
    ]);
    if (!s || !p || s.category !== p.category || !s.modes.includes(b.mode))
      throw fail(400, "Invalid service, practitioner or session mode");
    if (b.mode === "home" && (!b.address || b.address.trim().length < 10))
      throw fail(400, "Enter a full home visit address");
    const id = randomUUID();
    const { rows } = await pool.query(
      "INSERT INTO bookings(id,user_id,service_id,practitioner_id,starts_at,mode,address,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        id,
        req.user.id,
        s.id,
        p.id,
        b.startsAt,
        b.mode,
        b.address || null,
        s.price,
      ],
    );
    res.status(201).json(rows[0]);
  });
  app.get("/api/bookings", auth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT b.*,s.name AS service_name,p.name AS practitioner_name FROM bookings b JOIN services s ON s.id=b.service_id JOIN practitioners p ON p.id=b.practitioner_id WHERE b.user_id=$1 ORDER BY b.starts_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  });
  app.post("/api/bookings/:id/cancel", auth, async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE bookings SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status='confirmed' AND starts_at>now() RETURNING *",
      [uuid.parse(req.params.id), req.user.id],
    );
    if (!rows[0]) throw fail(404, "Upcoming booking not found");
    res.json(rows[0]);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post(
    "/api/prescriptions/upload",
    auth,
    limit("upload", 10),
    upload.single("file"),
    async (req, res) => {
      const f = req.file;
      if (!f) throw fail(400, "Choose a PDF, PNG or JPEG file");
      const b = f.buffer;
      const mime =
        b.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : b[0] === 255 && b[1] === 216 && b[2] === 255
              ? "image/jpeg"
              : null;
      if (!mime || mime !== f.mimetype)
        throw fail(400, "Only valid PDF, PNG and JPEG files are accepted");
      const id = randomUUID();
      const name = f.originalname
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .slice(0, 120);
      await pool.query(
        "INSERT INTO prescriptions(id,user_id,filename,mime,file_data) VALUES($1,$2,$3,$4,$5)",
        [id, req.user.id, name, mime, b],
      );
      await audit(pool, req.user.id, "prescription.upload", id);
      res.status(201).json({ id, filename: name });
    },
  );
  app.get("/api/prescriptions", auth, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,booking_id,filename,notes,created_at FROM prescriptions WHERE user_id=$1 ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json(rows);
  });
  app.get("/api/prescriptions/:id/file", auth, async (req, res) => {
    const {
      rows: [p],
    } = await pool.query(
      "SELECT * FROM prescriptions WHERE id=$1 AND user_id=$2",
      [uuid.parse(req.params.id), req.user.id],
    );
    if (!p?.file_data) throw fail(404, "File not found");
    await audit(pool, req.user.id, "prescription.download", p.id);
    res
      .set({
        "Content-Type": p.mime,
        "Content-Disposition": `attachment; filename="${p.filename}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
      })
      .send(p.file_data);
  });
  app.get("/api/clinician/bookings", auth, clinician, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT b.*,u.name AS patient_name,s.name AS service_name FROM bookings b JOIN practitioners p ON p.id=b.practitioner_id JOIN users u ON u.id=b.user_id JOIN services s ON s.id=b.service_id WHERE p.user_id=$1 ORDER BY starts_at DESC",
      [req.user.id],
    );
    res.json(rows);
  });
  app.post(
    "/api/clinician/prescriptions",
    auth,
    clinician,
    async (req, res) => {
      const data = z
        .object({
          bookingId: uuid,
          notes: z.string().trim().min(10).max(10000),
        })
        .parse(req.body);
      const {
        rows: [b],
      } = await pool.query(
        "SELECT b.* FROM bookings b JOIN practitioners p ON p.id=b.practitioner_id WHERE b.id=$1 AND p.user_id=$2 AND b.status='confirmed'",
        [data.bookingId, req.user.id],
      );
      if (!b) throw fail(404, "Assigned booking not found");
      const id = randomUUID();
      await pool.query(
        "INSERT INTO prescriptions(id,user_id,booking_id,author_id,notes) VALUES($1,$2,$3,$4,$5)",
        [id, b.user_id, b.id, req.user.id, data.notes],
      );
      await audit(pool, req.user.id, "prescription.issue", id);
      res.status(201).json({ id });
    },
  );
  app.post("/api/orders", auth, limit("checkout", 30), async (req, res) => {
    const data = checkout.parse(req.body);
    if (new Set(data.items.map((x) => x.productId)).size !== data.items.length)
      throw fail(400, "Duplicate cart items");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise checkout per user, including idempotent retries.
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      const {
        rows: [existing],
      } = await client.query(
        "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
        [req.user.id, data.idempotencyKey],
      );
      if (existing) {
        await client.query("COMMIT");
        return res.json(existing);
      }
      let total = 0,
        rx = false;
      const lines = [];
      for (const item of [...data.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        const {
          rows: [p],
        } = await client.query(
          "SELECT * FROM products WHERE id=$1 FOR UPDATE",
          [item.productId],
        );
        if (!p || p.stock < item.quantity)
          throw fail(409, "A product is unavailable or has insufficient stock");
        total += p.price * item.quantity;
        rx ||= p.prescription_required;
        lines.push({ ...item, name: p.name, price: p.price });
      }
      if (rx && !data.prescriptionId)
        throw fail(400, "This order requires a prescription");
      if (data.prescriptionId) {
        const { rows } = await client.query(
          "SELECT id FROM prescriptions WHERE id=$1 AND user_id=$2",
          [data.prescriptionId, req.user.id],
        );
        if (!rows.length) throw fail(400, "Choose one of your prescriptions");
      }
      const id = randomUUID();
      const {
        rows: [order],
      } = await client.query(
        "INSERT INTO orders(id,user_id,total,address,prescription_id,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          id,
          req.user.id,
          total,
          data.address,
          data.prescriptionId || null,
          rx ? "demo_awaiting_prescription_review" : "demo_order_placed",
          data.idempotencyKey,
        ],
      );
      for (const l of lines) {
        await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
          l.quantity,
          l.productId,
        ]);
        await client.query("INSERT INTO order_items VALUES($1,$2,$3,$4,$5)", [
          id,
          l.productId,
          l.name,
          l.quantity,
          l.price,
        ]);
      }
      await audit(client, req.user.id, "order.create", id);
      await client.query("COMMIT");
      res.status(201).json(order);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  app.get("/api/orders", auth, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC",
      [req.user.id],
    );
    for (const o of rows)
      o.items = (
        await pool.query("SELECT * FROM order_items WHERE order_id=$1", [o.id])
      ).rows;
    res.json(rows);
  });
  app.use("/api", (req, res, next) => next(fail(404, "Endpoint not found")));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
    if (err.code === "23505")
      return res
        .status(409)
        .json({
          error:
            "That email or appointment slot is already in use. Refresh and try again.",
        });
    if (err instanceof multer.MulterError)
      return res
        .status(400)
        .json({ error: "Upload one file, no larger than 5 MB" });
    const status = err.status || 503;
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "request.failed",
          requestId: res.get("X-Request-ID"),
          code: err.code || "INTERNAL",
        }),
      );
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "Service temporarily unavailable. Please try again."
            : err.message,
      });
  });
  return app;
}
