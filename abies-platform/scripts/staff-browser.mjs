import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
const base = process.env.ABIES_BASE_URL || "http://localhost:3000";
const credentials = JSON.parse(
  await readFile(
    process.env.ABIES_ADMIN_CREDENTIALS || ".runtime/admin-account.json",
    "utf8",
  ),
);
const browser = await chromium.launch({ headless: true });
const errors = [],
  contexts = [];
const prefix = "Panel test " + Date.now(),
  password = randomBytes(24).toString("base64url");
const options = {
  baseURL: base,
  ignoreHTTPSErrors: process.env.ABIES_ALLOW_SELF_SIGNED === "true",
  viewport: { width: 1440, height: 1080 },
};
async function context() {
  const c = await browser.newContext(options);
  contexts.push(c);
  return c;
}
async function call(c, path, method = "GET", body) {
  const r = await c.request.fetch("/api" + path, {
    method,
    headers: { Origin: base },
    ...(body ? { data: body } : {}),
  });
  if (!r.ok())
    throw new Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
  return r.json();
}
async function pageFor(c) {
  const p = await c.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("/");
  await p.getByRole("heading", { name: "Your everyday essentials" }).waitFor();
  return p;
}
const admin = await context(),
  patient = await context(),
  doctor = await context(),
  courier = await context();
let product, practitioner, booking;
const testUsers = [];
await mkdir("test-results", { recursive: true });
try {
  await call(admin, "/auth/login", "POST", credentials);
  for (const [c, role] of [
    [patient, "patient"],
    [doctor, "clinician"],
    [courier, "delivery"],
  ]) {
    const u = await call(c, "/auth/register", "POST", {
      name: prefix + " " + role,
      email: `panel-${role}-${Date.now()}@example.test`,
      password,
    });
    testUsers.push({ ...u, targetRole: role });
  }
  const p = await pageFor(admin);
  await p.getByRole("button", { name: "Administration", exact: true }).click();
  await p
    .getByRole("heading", { name: "Administration", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Accounts", exact: true }).click();
  for (const u of testUsers.filter((u) => u.targetRole !== "patient")) {
    await p.getByLabel("Find an account").fill(u.email);
    await p
      .getByRole("button", { name: "Search accounts", exact: true })
      .click();
    await p
      .getByRole("row")
      .filter({ hasText: u.email })
      .getByRole("button", { name: "Manage access" })
      .click();
    await p.getByLabel("Role").selectOption(u.targetRole);
    await p.getByRole("button", { name: "Save access" }).click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await p.getByRole("button", { name: "Medicines", exact: true }).click();
  await p.getByRole("button", { name: "Add medicine" }).click();
  const dialog = p.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(prefix + " medicine");
  await dialog.getByLabel("Subtitle / pack size").fill("Test pack only");
  await dialog.getByLabel("Price (₹)").fill("149.50");
  await dialog.getByLabel("Stock units").fill("5");
  await dialog.getByLabel("Prescription required").check();
  await dialog.getByRole("button", { name: "Save medicine" }).click();
  await dialog.waitFor({ state: "hidden" });
  product = (await call(admin, "/admin/catalog")).products.find(
    (x) => x.name === prefix + " medicine",
  );
  expect(product.price).toBe(14950);
  expect(
    (await call(patient, "/catalog")).products.some((x) => x.id === product.id),
  ).toBe(true);
  await p.getByRole("button", { name: "Care team", exact: true }).click();
  await p.getByRole("button", { name: "Add practitioner" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill(prefix + " doctor");
  await dialog
    .getByLabel("Specialty / qualification")
    .fill("Demo practitioner only");
  await dialog
    .getByLabel("Linked doctor account")
    .selectOption(testUsers.find((u) => u.targetRole === "clinician").id);
  await dialog.getByRole("button", { name: "Save practitioner" }).click();
  await dialog.waitFor({ state: "hidden" });
  practitioner = (await call(admin, "/admin/catalog")).practitioners.find(
    (x) => x.name === prefix + " doctor",
  );
  await call(patient, "/profile", "PUT", {
    name: prefix + " patient",
    phone: "+91 9000000000",
    birth_date: "1990-01-01",
  });
  const upload = await patient.request.post("/api/prescriptions/upload", {
    headers: { Origin: base },
    multipart: {
      file: {
        name: "panel-test.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nPanel test fixture"),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const rx = await upload.json();
  const catalog = await call(patient, "/catalog");
  const service = catalog.services.find(
    (x) => x.category === "doctor" && x.modes.includes("video"),
  );
  booking = await call(patient, "/bookings", "POST", {
    serviceId: service.id,
    practitionerId: practitioner.id,
    startsAt:
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) +
      "T10:00:00.000Z",
    mode: "video",
    reason: "Panel browser private intake",
    prescriptionId: rx.id,
  });
  const dp = await pageFor(doctor);
  await dp
    .getByRole("button", { name: "Doctor workspace", exact: true })
    .click();
  await dp.getByRole("button", { name: "View patient" }).click();
  await expect(
    dp.getByText("Panel browser private intake", { exact: true }),
  ).toBeVisible();
  await expect(dp.getByText("+91 9000000000", { exact: true })).toBeVisible();
  await dp
    .getByLabel("Write prescription")
    .fill("Panel browser test prescription. Not clinical advice.");
  await dp
    .getByRole("button", { name: "Issue prescription", exact: true })
    .click();
  await dp.getByText("Prescription saved to the patient’s records.").waitFor();
  expect(
    (await call(patient, "/prescriptions")).some(
      (x) => x.booking_id === booking.id,
    ),
  ).toBe(true);
  await dp.getByRole("button", { name: "Close panel" }).click();
  await dp.screenshot({
    path: "test-results/doctor-panel.png",
    fullPage: true,
  });
  const order = await call(patient, "/orders", "POST", {
    items: [{ productId: product.id, quantity: 1 }],
    address: "10 Panel Test Street, Sample City 110001",
    prescriptionId: rx.id,
    idempotencyKey: randomUUID(),
  });
  await p.getByRole("button", { name: "Refresh workspace" }).click();
  await p
    .getByRole("button", { name: "Orders & delivery", exact: true })
    .click();
  const card = p
    .locator(".staff-card")
    .filter({ hasText: order.id.slice(0, 8) });
  await card.getByRole("button", { name: "Manage order" }).click();
  await dialog
    .getByLabel("Review note")
    .fill("Browser test approval, demonstration only");
  await dialog.getByRole("button", { name: "Record review" }).click();
  await dialog.waitFor({ state: "hidden" });
  await card.getByRole("button", { name: "Manage order" }).click();
  await dialog
    .getByLabel("Delivery staff")
    .selectOption(testUsers.find((u) => u.targetRole === "delivery").id);
  await dialog.getByRole("button", { name: "Assign delivery" }).click();
  await dialog.waitFor({ state: "hidden" });
  const cp = await pageFor(courier);
  await cp
    .getByRole("button", { name: "Delivery workspace", exact: true })
    .click();
  await expect(
    cp.getByText("10 Panel Test Street, Sample City 110001", { exact: true }),
  ).toBeVisible();
  await expect(cp.getByText(prefix + " medicine", { exact: true })).toHaveCount(
    0,
  );
  for (const status of ["out_for_delivery", "delivered"]) {
    await cp.getByRole("button", { name: "Update delivery" }).click();
    await cp.getByLabel("New status").selectOption(status);
    await cp.getByLabel("Delivery note").fill("Browser test handover");
    await cp.getByRole("button", { name: "Save delivery status" }).click();
    await cp.getByRole("dialog").waitFor({ state: "hidden" });
  }
  expect(
    (await call(patient, "/orders")).find((x) => x.id === order.id)
      .fulfillment_status,
  ).toBe("delivered");
  await cp.screenshot({
    path: "test-results/delivery-panel.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Medicines", exact: true }).click();
  await p.getByLabel("Search medicines").fill(prefix);
  await p.screenshot({ path: "test-results/admin-panel.png", fullPage: true });
  for (const panel of [p, dp, cp]) {
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.waitForFunction(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
    );
    await panel.getByRole("button", { name: "Open navigation" }).click();
    await panel
      .getByRole("button", {
        name:
          panel === p
            ? "Administration"
            : panel === dp
              ? "Doctor workspace"
              : "Delivery workspace",
        exact: true,
      })
      .click();
    await panel.waitForFunction(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
    );
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await p.screenshot({ path: "test-results/admin-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    "PASS: admin catalog and role management, doctor linking and patient access, prescription issuance and review, delivery assignment and progression, patient tracking, mobile panels; no browser errors",
  );
} finally {
  const failures = [];
  async function cleanup(fn) {
    try {
      await fn();
    } catch (e) {
      failures.push(e.message);
    }
  }
  if (booking)
    await cleanup(() =>
      call(patient, "/bookings/" + booking.id + "/cancel", "POST", {}),
    );
  if (product || practitioner)
    await cleanup(async () => {
      const c = await call(admin, "/admin/catalog");
      if (product) {
        const current = c.products.find((x) => x.id === product.id);
        await call(admin, "/admin/products/" + product.id, "PUT", {
          ...current,
          active: false,
        });
      }
      if (practitioner) {
        const current = c.practitioners.find((x) => x.id === practitioner.id);
        await call(admin, "/admin/practitioners/" + practitioner.id, "PUT", {
          ...current,
          active: false,
          user_id: null,
        });
      }
    });
  for (const u of testUsers)
    await cleanup(async () => {
      const current = (
        await call(admin, "/admin/users?q=" + encodeURIComponent(u.email))
      ).find((x) => x.id === u.id);
      await call(admin, "/admin/users/" + u.id, "PUT", {
        role: "patient",
        active: false,
        version: current.version,
      });
    });
  for (const c of contexts) await c.close();
  await browser.close();
  if (failures.length)
    throw new Error("Test cleanup failed: " + failures.join("; "));
}
