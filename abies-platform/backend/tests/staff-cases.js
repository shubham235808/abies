import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { migrate } from "../app/migrations.js";
export async function staffCases(t, { app, pool, redis, origin }) {
  const admin = request.agent(app),
    patient = request.agent(app),
    doctor = request.agent(app),
    otherDoctor = request.agent(app),
    courier = request.agent(app),
    otherCourier = request.agent(app);
  const post = (a, path, d) =>
    a
      .post("/api" + path)
      .set("Origin", origin)
      .send(d);
  const put = (a, path, d) =>
    a
      .put("/api" + path)
      .set("Origin", origin)
      .send(d);
  const register = async (a, name, role) => {
    const { body: u } = await post(a, "/auth/register", {
      name,
      email: name + "@staff.test",
      password: "staff-password-123",
      role,
    }).expect(200);
    assert.equal(u.role, "patient");
    if (role !== "patient")
      await pool.query("UPDATE users SET role=$1 WHERE id=$2", [role, u.id]);
    return u;
  };
  const a = await register(admin, "Administrator", "admin"),
    p = await register(patient, "Patient", "patient"),
    d = await register(doctor, "Doctor", "clinician"),
    od = await register(otherDoctor, "OtherDoctor", "clinician"),
    c = await register(courier, "Courier", "delivery");
  await register(otherCourier, "OtherCourier", "delivery");
  let medicine, provider, service, booking, rx, order;
  const product = {
    name: "Staff test medicine",
    subtitle: "60 tablets",
    category: "Wellness",
    price: 12500,
    stock: 10,
    prescription_required: false,
    color: "purple",
    active: true,
  };
  await t.test(
    "staff APIs reject anonymous and wrong-role access, including self-promotion",
    async () => {
      for (const path of [
        "/admin/catalog",
        "/admin/users",
        "/admin/orders",
        "/admin/bookings",
        "/admin/overview",
        "/delivery/orders",
        "/clinician/bookings",
      ])
        await request(app)
          .get("/api" + path)
          .expect(401);
      for (const agent of [patient, doctor, courier]) {
        await agent.get("/api/admin/catalog").expect(403);
        await post(agent, "/admin/products", product).expect(403);
        await put(agent, "/admin/users/" + p.id, {
          role: "admin",
          active: true,
          version: 1,
        }).expect(403);
      }
      await patient.get("/api/delivery/orders").expect(403);
      await courier.get("/api/clinician/bookings").expect(403);
      await put(admin, "/admin/users/" + a.id, {
        role: "patient",
        active: true,
        version: 1,
      }).expect(400);
    },
  );
  await t.test(
    "admin catalog writes invalidate cache, reject stale edits, archive safely and survive migrations",
    async () => {
      await patient.get("/api/catalog").expect(200);
      medicine = (await post(admin, "/admin/products", product).expect(201))
        .body;
      assert.ok(
        (await patient.get("/api/catalog")).body.products.some(
          (x) => x.id === medicine.id,
        ),
      );
      medicine = (
        await put(admin, "/admin/products/" + medicine.id, {
          ...medicine,
          stock: 15,
        }).expect(200)
      ).body;
      await put(admin, "/admin/products/" + medicine.id, {
        ...medicine,
        version: 1,
      }).expect(409);
      await migrate(pool);
      assert.equal(
        (
          await pool.query("SELECT stock FROM products WHERE id=$1", [
            medicine.id,
          ])
        ).rows[0].stock,
        15,
      );
      medicine = (
        await put(admin, "/admin/products/" + medicine.id, {
          ...medicine,
          active: false,
        }).expect(200)
      ).body;
      assert.ok(
        !(await patient.get("/api/catalog")).body.products.some(
          (x) => x.id === medicine.id,
        ),
      );
      await post(patient, "/orders", {
        items: [{ productId: medicine.id, quantity: 1 }],
        address: "10 Test Road, Test City",
        idempotencyKey: randomUUID(),
      }).expect(409);
      medicine = (
        await put(admin, "/admin/products/" + medicine.id, {
          ...medicine,
          active: true,
        }).expect(200)
      ).body;
    },
  );
  await t.test(
    "admin creates services and links only doctor accounts to practitioners",
    async () => {
      const providerData = {
        name: "Dr Staff Test",
        specialty: "Ayurveda",
        category: "doctor",
        active: true,
        user_id: c.id,
      };
      await post(admin, "/admin/practitioners", providerData).expect(400);
      provider = (
        await post(admin, "/admin/practitioners", {
          ...providerData,
          user_id: d.id,
        }).expect(201)
      ).body;
      service = (
        await post(admin, "/admin/services", {
          name: "Staff consultation",
          description: "Test consultation service",
          category: "doctor",
          price: 50000,
          duration: 30,
          modes: ["video", "clinic"],
          active: true,
        }).expect(201)
      ).body;
      await put(admin, "/admin/services/" + service.id, {
        ...service,
        category: "physio",
      }).expect(409);
      await post(admin, "/admin/services", {
        ...service,
        category: "physio",
      }).expect(400);
    },
  );
  await t.test(
    "patient profile, intake and shared documents are scoped to assigned doctor",
    async () => {
      await put(patient, "/profile", {
        name: "Patient Test",
        phone: "+91 9000000000",
        birth_date: "2000-02-30",
      }).expect(400);
      await put(patient, "/profile", {
        name: "Patient Test",
        phone: "+91 9000000000",
        birth_date: "2000-02-20",
      }).expect(200);
      rx = (
        await patient
          .post("/api/prescriptions/upload")
          .set("Origin", origin)
          .attach("file", Buffer.from("%PDF-1.4\nStaff fixture"), {
            filename: "staff.pdf",
            contentType: "application/pdf",
          })
          .expect(201)
      ).body;
      const payload = {
        serviceId: service.id,
        practitionerId: provider.id,
        startsAt:
          new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) +
          "T10:00:00.000Z",
        mode: "video",
        reason: "Private patient intake",
        prescriptionId: rx.id,
      };
      await post(otherDoctor, "/bookings", payload).expect(400);
      booking = (await post(patient, "/bookings", payload).expect(201)).body;
      await otherDoctor
        .get("/api/clinician/bookings/" + booking.id)
        .expect(404);
      await courier.get("/api/clinician/bookings/" + booking.id).expect(403);
      await otherDoctor
        .get("/api/clinician/bookings/" + booking.id + "/attachment")
        .expect(404);
      const details = (
        await doctor.get("/api/clinician/bookings/" + booking.id).expect(200)
      ).body;
      assert.equal(details.reason, "Private patient intake");
      assert.equal(details.patient_phone, "+91 9000000000");
      assert.equal(details.shared_prescription.filename, "staff.pdf");
      await doctor
        .get("/api/clinician/bookings/" + booking.id + "/attachment")
        .expect(200);
      await put(admin, "/admin/practitioners/" + provider.id, {
        ...provider,
        user_id: od.id,
      }).expect(409);
      await post(doctor, "/clinician/prescriptions", {
        bookingId: booking.id,
        notes: "Test prescription instructions only.",
      }).expect(201);
      assert.ok(
        (await patient.get("/api/prescriptions")).body.some(
          (x) => x.booking_id === booking.id,
        ),
      );
      await post(
        doctor,
        "/clinician/bookings/" + booking.id + "/complete",
        {},
      ).expect(409);
      await pool.query(
        "UPDATE bookings SET starts_at=now()-interval '1 hour' WHERE id=$1",
        [booking.id],
      );
      await post(
        doctor,
        "/clinician/bookings/" + booking.id + "/complete",
        {},
      ).expect(200);
      await post(
        doctor,
        "/clinician/bookings/" + booking.id + "/complete",
        {},
      ).expect(409);
      await put(admin, "/admin/practitioners/" + provider.id, {
        ...provider,
        user_id: od.id,
      }).expect(200);
      await otherDoctor
        .get("/api/clinician/bookings/" + booking.id)
        .expect(404);
      await doctor.get("/api/clinician/bookings/" + booking.id).expect(200);
    },
  );
  await t.test(
    "delivery assignment, privacy and status transitions are enforced",
    async () => {
      order = (
        await post(patient, "/orders", {
          items: [{ productId: medicine.id, quantity: 2 }],
          address: "10 Test Road, Test City",
          idempotencyKey: randomUUID(),
        }).expect(201)
      ).body;
      let full = (await admin.get("/api/admin/orders")).body.find(
        (x) => x.id === order.id,
      );
      await post(admin, "/admin/orders/" + order.id + "/assign", {
        deliveryUserId: d.id,
        version: full.version,
      }).expect(400);
      full = (
        await post(admin, "/admin/orders/" + order.id + "/assign", {
          deliveryUserId: c.id,
          version: full.version,
        }).expect(200)
      ).body;
      assert.equal(
        (await otherCourier.get("/api/delivery/orders")).body.length,
        0,
      );
      const delivery = (await courier.get("/api/delivery/orders").expect(200))
        .body[0];
      for (const field of [
        "items",
        "total",
        "prescription_id",
        "review_status",
        "user_id",
        "customer_email",
      ])
        assert.equal(delivery[field], undefined);
      assert.equal(delivery.recipient_phone, "+91 9000000000");
      await post(otherCourier, "/delivery/orders/" + order.id + "/status", {
        status: "out_for_delivery",
        version: full.version,
      }).expect(404);
      await post(courier, "/delivery/orders/" + order.id + "/status", {
        status: "delivered",
        version: full.version,
      }).expect(409);
      await post(courier, "/delivery/orders/" + order.id + "/status", {
        status: "failed",
        version: full.version,
      }).expect(400);
      await put(admin, "/admin/users/" + c.id, {
        role: "patient",
        active: true,
        version: 1,
      }).expect(409);
      const moving = (
        await post(courier, "/delivery/orders/" + order.id + "/status", {
          status: "out_for_delivery",
          version: full.version,
        }).expect(200)
      ).body;
      await post(courier, "/delivery/orders/" + order.id + "/status", {
        status: "delivered",
        version: full.version,
      }).expect(409);
      await post(courier, "/delivery/orders/" + order.id + "/status", {
        status: "delivered",
        version: moving.version,
        note: "Handed to recipient",
      }).expect(200);
      assert.equal(
        (await patient.get("/api/orders")).body.find((x) => x.id === order.id)
          .fulfillment_status,
        "delivered",
      );
    },
  );
  await t.test(
    "prescription review gates dispatch and rejection restocks exactly once",
    async () => {
      medicine = (await admin.get("/api/admin/catalog")).body.products.find(
        (x) => x.id === medicine.id,
      );
      medicine = (
        await put(admin, "/admin/products/" + medicine.id, {
          ...medicine,
          prescription_required: true,
        }).expect(200)
      ).body;
      const create = () =>
        post(patient, "/orders", {
          items: [{ productId: medicine.id, quantity: 1 }],
          address: "10 Test Road, Test City",
          prescriptionId: rx.id,
          idempotencyKey: randomUUID(),
        });
      const id = (await create().expect(201)).body.id;
      await post(admin, "/admin/orders/" + id + "/assign", {
        deliveryUserId: c.id,
        version: 1,
      }).expect(409);
      await courier
        .get("/api/admin/orders/" + id + "/prescription")
        .expect(403);
      await admin.get("/api/admin/orders/" + id + "/prescription").expect(200);
      await post(admin, "/admin/orders/" + id + "/review", {
        decision: "rejected",
        note: "Test rejection decision",
        version: 1,
      }).expect(200);
      await post(admin, "/admin/orders/" + id + "/review", {
        decision: "rejected",
        note: "Duplicate test rejection",
        version: 2,
      }).expect(409);
      assert.equal(
        (
          await pool.query("SELECT stock FROM products WHERE id=$1", [
            medicine.id,
          ])
        ).rows[0].stock,
        medicine.stock,
      );
      const approvedId = (await create().expect(201)).body.id;
      const approved = (
        await post(admin, "/admin/orders/" + approvedId + "/review", {
          decision: "approved",
          note: "Test review approval only",
          version: 1,
        }).expect(200)
      ).body;
      await post(admin, "/admin/orders/" + approvedId + "/assign", {
        deliveryUserId: c.id,
        version: approved.version,
      }).expect(200);
    },
  );
  await t.test(
    "disabled accounts lose access and password changes revoke every session",
    async () => {
      const person = (await admin.get("/api/admin/users")).body.find(
        (x) => x.id === p.id,
      );
      const disabled = (
        await put(admin, "/admin/users/" + p.id, {
          role: "patient",
          active: false,
          version: person.version,
        }).expect(200)
      ).body;
      await patient.get("/api/auth/me").expect(401);
      await post(patient, "/auth/login", {
        email: "Patient@staff.test",
        password: "staff-password-123",
      }).expect(401);
      await put(admin, "/admin/users/" + p.id, {
        role: "patient",
        active: true,
        version: disabled.version,
      }).expect(200);
      await patient.get("/api/auth/me").expect(401);
      await post(patient, "/auth/login", {
        email: "patient@staff.test",
        password: "staff-password-123",
      }).expect(200);
      const second = request.agent(app);
      await post(second, "/auth/login", {
        email: "patient@staff.test",
        password: "staff-password-123",
      }).expect(200);
      await post(patient, "/auth/password", {
        currentPassword: "wrong-password",
        newPassword: "new-staff-password-123",
      }).expect(400);
      await post(patient, "/auth/password", {
        currentPassword: "staff-password-123",
        newPassword: "new-staff-password-123",
      }).expect(200);
      await patient.get("/api/auth/me").expect(401);
      await second.get("/api/auth/me").expect(401);
      await redis.del("limit:auth:::ffff:127.0.0.1");
      await post(patient, "/auth/login", {
        email: "patient@staff.test",
        password: "new-staff-password-123",
      }).expect(200);
    },
  );
}
