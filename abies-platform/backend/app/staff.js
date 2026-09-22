import { z } from "zod";
import { randomUUID } from "node:crypto";
import { uuid, registration } from "./validation.js";
import {
  hashPassword,
  checkPassword,
  getToken,
  sessionKey,
} from "./security.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (min, max) => z.string().trim().min(min).max(max);
const category = z.enum(["doctor", "panchkarma", "diagnostics", "physio"]);
const schemas = {
  products: z.object({
    name: text(2, 120),
    subtitle: text(2, 180),
    category: text(2, 80),
    price: z.number().int().min(1).max(100000000),
    stock: z.number().int().min(0).max(1000000),
    prescription_required: z.boolean(),
    color: z.enum(["purple", "pink", "blue", "orange"]),
    active: z.boolean(),
  }),
  services: z.object({
    name: text(2, 120),
    description: text(10, 1000),
    category,
    price: z.number().int().min(0).max(100000000),
    duration: z.union([z.literal(30), z.literal(60)]),
    modes: z
      .array(z.enum(["video", "clinic", "home"]))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    active: z.boolean(),
  }),
  practitioners: z.object({
    name: text(2, 120),
    specialty: text(2, 180),
    category,
    user_id: uuid.nullable(),
    active: z.boolean(),
  }),
};
export function registerStaff(app, { pool, redis, auth, limit }) {
  const role = (name) => (req, res, next) => {
    if (req.user.role !== name) throw fail(403, `${name} access required`);
    next();
  };
  const admin = [auth, role("admin")],
    doctor = [auth, role("clinician")],
    delivery = [auth, role("delivery")];
  const audit = (c, u, event, id) =>
    c.query(
      "INSERT INTO audit_events(actor_id,action,resource_key) VALUES($1,$2,$3)",
      [u, event, id],
    );
  async function transaction(fn) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const value = await fn(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  const invalidate = () => redis.del("catalog:v2").catch(() => {});
  const orderEvent = (c, u, id, event, note = "") =>
    c.query(
      "INSERT INTO order_events(id,order_id,actor_id,event,note) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, u, event, note],
    );
  async function lockedOrder(c, id, version) {
    const {
      rows: [o],
    } = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      uuid.parse(id),
    ]);
    if (!o) throw fail(404, "Order not found");
    if (o.version !== version)
      throw fail(409, "Order changed. Refresh before continuing.");
    return o;
  }
  app.get("/api/profile", auth, async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT name,email,phone,birth_date,role FROM users WHERE id=$1",
          [req.user.id],
        )
      ).rows[0],
    );
  });
  app.put("/api/profile", auth, async (req, res) => {
    const d = z
      .object({
        name: text(2, 100),
        phone: z
          .string()
          .trim()
          .max(30)
          .regex(/^[+0-9 ()-]*$/),
        birth_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(req.body);
    if (
      d.birth_date &&
      (Number.isNaN(Date.parse(d.birth_date)) ||
        new Date(d.birth_date).toISOString().slice(0, 10) !== d.birth_date ||
        d.birth_date > new Date().toISOString().slice(0, 10) ||
        d.birth_date < "1900-01-01")
    )
      throw fail(400, "Enter a valid birth date in the past");
    const {
      rows: [u],
    } = await pool.query(
      "UPDATE users SET name=$1,phone=$2,birth_date=$3,version=version+1 WHERE id=$4 RETURNING name,email,phone,birth_date,role",
      [d.name, d.phone, d.birth_date, req.user.id],
    );
    res.json(u);
  });
  app.post(
    "/api/auth/password",
    auth,
    limit("password", 10),
    async (req, res) => {
      const d = z
        .object({
          currentPassword: z.string().max(128),
          newPassword: registration.shape.password,
        })
        .parse(req.body);
      const {
        rows: [u],
      } = await pool.query("SELECT password_hash FROM users WHERE id=$1", [
        req.user.id,
      ]);
      if (!(await checkPassword(d.currentPassword, u.password_hash)))
        throw fail(400, "Current password is incorrect");
      await pool.query(
        "UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2",
        [await hashPassword(d.newPassword), req.user.id],
      );
      await redis.del(sessionKey(getToken(req)));
      res.json({ ok: true });
    },
  );
  app.get("/api/admin/overview", ...admin, async (req, res) => {
    const queries = {
      products: "SELECT count(*)::int AS n FROM products WHERE active",
      practitioners:
        "SELECT count(*)::int AS n FROM practitioners WHERE active",
      bookings:
        "SELECT count(*)::int AS n FROM bookings WHERE status='confirmed' AND starts_at>now()",
      orders:
        "SELECT count(*)::int AS n FROM orders WHERE fulfillment_status NOT IN ('delivered','cancelled')",
      reviews:
        "SELECT count(*)::int AS n FROM orders WHERE review_status='pending'",
    };
    const entries = await Promise.all(
      Object.entries(queries).map(async ([k, q]) => [
        k,
        (await pool.query(q)).rows[0].n,
      ]),
    );
    res.json(Object.fromEntries(entries));
  });
  app.get("/api/admin/catalog", ...admin, async (req, res) => {
    const entries = await Promise.all(
      Object.keys(schemas).map(async (k) => [
        k,
        (await pool.query(`SELECT * FROM ${k} ORDER BY name`)).rows,
      ]),
    );
    res.json(Object.fromEntries(entries));
  });
  for (const [kind, schema] of Object.entries(schemas)) {
    for (const method of ["post", "put"])
      app[method](
        `/api/admin/${kind}${method === "put" ? "/:id" : ""}`,
        ...admin,
        async (req, res) => {
          const d = (
            method === "put"
              ? schema.extend({ version: z.number().int().positive() })
              : schema
          ).parse(req.body);
          const id =
            method === "put" ? text(1, 80).parse(req.params.id) : randomUUID();
          const value = await transaction(async (c) => {
            let previous;
            if (method === "put") {
              previous = (
                await c.query(`SELECT * FROM ${kind} WHERE id=$1 FOR UPDATE`, [
                  id,
                ])
              ).rows[0];
              if (!previous) throw fail(404, "Record not found");
              if (previous.version !== d.version)
                throw fail(409, "Record changed. Refresh before saving.");
              if (kind !== "products" && previous.category !== d.category)
                throw fail(
                  409,
                  "Create a new record to change its care category.",
                );
            }
            if (
              kind === "services" &&
              d.category !== "doctor" &&
              d.modes.includes("video")
            )
              throw fail(
                400,
                "Video mode is only available for doctor consultations",
              );
            if (kind === "practitioners" && d.user_id) {
              const u = (
                await c.query(
                  "SELECT role,active FROM users WHERE id=$1 FOR SHARE",
                  [d.user_id],
                )
              ).rows[0];
              if (!u || !u.active || u.role !== "clinician")
                throw fail(400, "Choose an active doctor account");
            }
            if (
              kind === "practitioners" &&
              previous?.user_id &&
              previous.user_id !== d.user_id
            ) {
              const active = (
                await c.query(
                  "SELECT id FROM bookings WHERE practitioner_id=$1 AND status='confirmed' LIMIT 1",
                  [id],
                )
              ).rowCount;
              if (active)
                throw fail(
                  409,
                  "This practitioner has confirmed appointments. Complete or cancel them before changing its doctor account.",
                );
            }
            const keys = Object.keys(schema.shape),
              values = keys.map((k) => d[k]);
            const q =
              method === "post"
                ? `INSERT INTO ${kind}(id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => "$" + (i + 2)).join(",")}) RETURNING *`
                : `UPDATE ${kind} SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")},version=version+1 WHERE id=$1 RETURNING *`;
            const {
              rows: [row],
            } = await c.query(q, [id, ...values]);
            if (kind === "practitioners" && d.user_id)
              await c.query(
                "UPDATE bookings SET assigned_clinician_id=$1 WHERE practitioner_id=$2 AND assigned_clinician_id IS NULL",
                [d.user_id, id],
              );
            await audit(
              c,
              req.user.id,
              `${kind}.${method === "post" ? "create" : "update"}`,
              id,
            );
            return row;
          });
          await invalidate();
          res.status(method === "post" ? 201 : 200).json(value);
        },
      );
  }
  app.get("/api/admin/users", ...admin, async (req, res) => {
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || "");
    const { rows } = await pool.query(
      "SELECT id,name,email,role,active,version FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 200",
      ["%" + q + "%"],
    );
    res.json(rows);
  });
  app.put("/api/admin/users/:id", ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id),
      d = z
        .object({
          role: z.enum(["patient", "clinician", "admin", "delivery"]),
          active: z.boolean(),
          version: z.number().int().positive(),
        })
        .parse(req.body);
    if (id === req.user.id)
      throw fail(
        400,
        "You cannot change your own role or disable your own account",
      );
    const value = await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(827412)");
      const {
        rows: [u],
      } = await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id]);
      if (!u) throw fail(404, "Account not found");
      if (u.version !== d.version)
        throw fail(409, "Account changed. Refresh before saving.");
      if (u.role === "admin" && (!d.active || d.role !== "admin")) {
        const admins = (
          await c.query(
            "SELECT id FROM users WHERE role='admin' AND active AND id<>$1",
            [id],
          )
        ).rows;
        if (!admins.length)
          throw fail(409, "At least one active administrator is required");
      }
      if (u.role === "clinician" && (!d.active || d.role !== "clinician")) {
        if (
          (await c.query("SELECT id FROM practitioners WHERE user_id=$1", [id]))
            .rowCount
        )
          throw fail(
            409,
            "Unlink this account from its practitioner profile before changing its role or access",
          );
      }
      if (u.role === "delivery" && (!d.active || d.role !== "delivery")) {
        if (
          (
            await c.query(
              "SELECT id FROM orders WHERE delivery_user_id=$1 AND fulfillment_status IN ('assigned','out_for_delivery')",
              [id],
            )
          ).rowCount
        )
          throw fail(
            409,
            "Reassign active deliveries before changing this account",
          );
      }
      const {
        rows: [updated],
      } = await c.query(
        "UPDATE users SET role=$1,active=$2,version=version+1,session_version=session_version+CASE WHEN active AND NOT $2 THEN 1 ELSE 0 END WHERE id=$3 RETURNING id,name,email,role,active,version",
        [d.role, d.active, id],
      );
      await audit(c, req.user.id, "user.access", id);
      return updated;
    });
    res.json(value);
  });
  app.get("/api/admin/bookings", ...admin, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT b.id,b.starts_at,b.mode,b.status,b.price,u.name AS patient_name,p.name AS practitioner_name,s.name AS service_name FROM bookings b JOIN users u ON u.id=b.user_id JOIN practitioners p ON p.id=b.practitioner_id JOIN services s ON s.id=b.service_id ORDER BY starts_at DESC LIMIT 200",
    );
    res.json(rows);
  });
  app.get("/api/admin/orders", ...admin, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT o.*,u.name AS customer_name,u.phone AS customer_phone,d.name AS delivery_name FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN users d ON d.id=o.delivery_user_id ORDER BY o.created_at DESC LIMIT 200",
    );
    for (const o of rows) {
      o.items = (
        await pool.query(
          "SELECT product_id,name,quantity,unit_price FROM order_items WHERE order_id=$1",
          [o.id],
        )
      ).rows;
      o.events = (
        await pool.query(
          "SELECT event,note,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at",
          [o.id],
        )
      ).rows;
    }
    res.json(rows);
  });
  function fileResponse(res, p) {
    res
      .set({
        "Content-Type": p.mime,
        "Content-Disposition": `attachment; filename="${p.filename}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
      })
      .send(p.file_data);
  }
  app.get("/api/admin/orders/:id/prescription", ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const {
      rows: [p],
    } = await pool.query(
      "SELECT p.* FROM prescriptions p JOIN orders o ON o.prescription_id=p.id WHERE o.id=$1",
      [id],
    );
    if (!p) throw fail(404, "Order prescription not found");
    await audit(pool, req.user.id, "order.prescription.read", id);
    if (p.file_data) return fileResponse(res, p);
    res.json({ notes: p.notes });
  });
  app.post("/api/admin/orders/:id/review", ...admin, async (req, res) => {
    const d = z
      .object({
        decision: z.enum(["approved", "rejected"]),
        note: text(5, 500),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    const o = await transaction(async (c) => {
      const o = await lockedOrder(c, req.params.id, d.version);
      if (
        o.review_status !== "pending" ||
        o.fulfillment_status !== "pending_review"
      )
        throw fail(409, "This order is not waiting for review");
      const status = d.decision === "approved" ? "ready" : "cancelled";
      if (status === "cancelled")
        for (const line of (
          await c.query(
            "SELECT product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY product_id",
            [o.id],
          )
        ).rows)
          await c.query(
            "UPDATE products SET stock=stock+$1,version=version+1 WHERE id=$2",
            [line.quantity, line.product_id],
          );
      const {
        rows: [updated],
      } = await c.query(
        "UPDATE orders SET review_status=$1,fulfillment_status=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *",
        [d.decision, status, o.id],
      );
      await orderEvent(c, req.user.id, o.id, "review_" + d.decision, d.note);
      await audit(c, req.user.id, "order.review", o.id);
      return updated;
    });
    await invalidate();
    res.json(o);
  });
  app.post("/api/admin/orders/:id/assign", ...admin, async (req, res) => {
    const d = z
      .object({ deliveryUserId: uuid, version: z.number().int().positive() })
      .parse(req.body);
    const result = await transaction(async (c) => {
      const u = (
        await c.query("SELECT role,active FROM users WHERE id=$1 FOR SHARE", [
          d.deliveryUserId,
        ])
      ).rows[0];
      if (!u?.active || u.role !== "delivery")
        throw fail(400, "Choose an active delivery account");
      const o = await lockedOrder(c, req.params.id, d.version);
      if (
        !["ready", "assigned", "failed"].includes(o.fulfillment_status) ||
        o.review_status === "pending" ||
        o.review_status === "rejected"
      )
        throw fail(409, "Only reviewed, ready orders can be assigned");
      const {
        rows: [updated],
      } = await c.query(
        "UPDATE orders SET delivery_user_id=$1,fulfillment_status='assigned',delivery_note='',version=version+1,updated_at=now() WHERE id=$2 RETURNING *",
        [d.deliveryUserId, o.id],
      );
      await orderEvent(c, req.user.id, o.id, "assigned");
      await audit(c, req.user.id, "order.assign", o.id);
      return updated;
    });
    res.json(result);
  });
  app.get("/api/delivery/orders", ...delivery, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT o.id,o.address,o.fulfillment_status,o.delivery_note,o.version,o.created_at,o.updated_at,u.name AS recipient_name,u.phone AS recipient_phone,(SELECT COALESCE(SUM(quantity),0)::int FROM order_items i WHERE i.order_id=o.id) AS item_count FROM orders o JOIN users u ON u.id=o.user_id WHERE o.delivery_user_id=$1 ORDER BY o.created_at DESC LIMIT 200",
      [req.user.id],
    );
    res.json(rows);
  });
  app.post("/api/delivery/orders/:id/status", ...delivery, async (req, res) => {
    const d = z
      .object({
        status: z.enum(["out_for_delivery", "delivered", "failed"]),
        note: z.string().trim().max(500).default(""),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    const id = uuid.parse(req.params.id);
    const result = await transaction(async (c) => {
      const {
        rows: [o],
      } = await c.query(
        "SELECT * FROM orders WHERE id=$1 AND delivery_user_id=$2 FOR UPDATE",
        [id, req.user.id],
      );
      if (!o) throw fail(404, "Assigned delivery not found");
      if (o.version !== d.version)
        throw fail(409, "Delivery changed. Refresh before continuing.");
      const allowed = {
        assigned: ["out_for_delivery", "failed"],
        out_for_delivery: ["delivered", "failed"],
      };
      if (!allowed[o.fulfillment_status]?.includes(d.status))
        throw fail(409, "This delivery status transition is not allowed");
      if (d.status === "failed" && d.note.length < 5)
        throw fail(400, "Describe why the delivery failed");
      const {
        rows: [updated],
      } = await c.query(
        "UPDATE orders SET fulfillment_status=$1,delivery_note=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING id,fulfillment_status,version",
        [d.status, d.note, id],
      );
      await orderEvent(c, req.user.id, id, d.status, d.note);
      await audit(c, req.user.id, "delivery.status", id);
      return updated;
    });
    res.json(result);
  });
  async function assigned(c, id, user) {
    const {
      rows: [b],
    } = await c.query(
      "SELECT b.id,b.user_id,b.starts_at,b.status,b.mode,b.address,b.reason,b.prescription_id,u.name AS patient_name,u.email AS patient_email,u.phone AS patient_phone,u.birth_date,s.name AS service_name FROM bookings b JOIN practitioners p ON p.id=b.practitioner_id JOIN users u ON u.id=b.user_id JOIN services s ON s.id=b.service_id WHERE b.id=$1 AND COALESCE(b.assigned_clinician_id,p.user_id)=$2 AND b.status IN ('confirmed','completed')",
      [uuid.parse(id), user],
    );
    if (!b) throw fail(404, "Assigned patient appointment not found");
    return b;
  }
  app.get("/api/clinician/bookings/:id", ...doctor, async (req, res) => {
    const b = await assigned(pool, req.params.id, req.user.id);
    b.prescriptions = (
      await pool.query(
        "SELECT id,notes,created_at FROM prescriptions WHERE booking_id=$1 ORDER BY created_at DESC",
        [b.id],
      )
    ).rows;
    if (b.prescription_id) {
      const {
        rows: [p],
      } = await pool.query(
        "SELECT filename,notes FROM prescriptions WHERE id=$1",
        [b.prescription_id],
      );
      b.shared_prescription = p;
    }
    await audit(pool, req.user.id, "patient.appointment.read", b.id);
    res.json(b);
  });
  app.get(
    "/api/clinician/bookings/:id/attachment",
    ...doctor,
    async (req, res) => {
      const b = await assigned(pool, req.params.id, req.user.id);
      if (!b.prescription_id)
        throw fail(404, "No prescription shared for this appointment");
      const {
        rows: [p],
      } = await pool.query("SELECT * FROM prescriptions WHERE id=$1", [
        b.prescription_id,
      ]);
      if (!p?.file_data) throw fail(404, "No file attachment");
      await audit(pool, req.user.id, "patient.attachment.read", b.id);
      fileResponse(res, p);
    },
  );
  app.post(
    "/api/clinician/bookings/:id/complete",
    ...doctor,
    async (req, res) => {
      const b = await assigned(pool, req.params.id, req.user.id);
      const {
        rows: [row],
      } = await pool.query(
        "UPDATE bookings SET status='completed' WHERE id=$1 AND status='confirmed' AND starts_at<=now() RETURNING id,status",
        [b.id],
      );
      if (!row)
        throw fail(
          409,
          "Only a confirmed appointment that has started can be completed",
        );
      await audit(pool, req.user.id, "booking.complete", b.id);
      res.json(row);
    },
  );
}
