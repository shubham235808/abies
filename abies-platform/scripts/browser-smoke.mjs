import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  ignoreHTTPSErrors: process.env.ABIES_ALLOW_SELF_SIGNED === "true",
});
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.ABIES_BASE_URL || "http://localhost:3000");
await page.getByRole("heading", { name: "Your everyday essentials" }).waitFor();
await page.getByRole("button", { name: "Add Ashwagandha to bag" }).waitFor();
await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page
  .getByRole("button", { name: "New to Abies? Create an account" })
  .click();
await page.getByLabel("Full name", { exact: true }).fill("Browser Patient");
await page
  .getByLabel("Email address")
  .fill(`browser-${Date.now()}@example.test`);
await page.getByLabel("Password", { exact: true }).fill("browser-password-123");
await page.getByRole("button", { name: "Create account", exact: true }).click();
await page.getByText("You’re signed in.").waitFor();
await page
  .getByRole("button", { name: "Book a consultation", exact: true })
  .click();
await page.getByRole("button", { name: "Choose a slot" }).click();
await page.locator(".slot-grid button").first().click();
await page
  .getByRole("button", { name: "Confirm appointment", exact: true })
  .click();
await page
  .getByText("Your appointment is confirmed.", { exact: true })
  .waitFor();
await page.getByRole("button", { name: "Video room demo" }).click();
await page.getByRole("button", { name: "Enter demo room" }).click();
await page.getByText("You’re in the demo room").waitFor();
await page.getByRole("button", { name: "Close dialog" }).click();
await page
  .getByRole("button", { name: "Ayurveda medicines", exact: true })
  .click();
await page.getByLabel("Search medicines", { exact: true }).fill("Ashwagandha");
await page.getByRole("button", { name: "Add to bag", exact: true }).click();
await page.getByRole("button", { name: "Your bag (1)" }).click();
await page
  .getByLabel("Delivery address")
  .fill("12 Sample Street, New Delhi 110001");
await page.getByRole("button", { name: "Place demo order" }).click();
await page.getByText("Demo order placed. No payment was collected.").waitFor();
const prescriptionBody = "%PDF-1.4\nAbies browser upload test";
await page
  .locator('input[type="file"]')
  .setInputFiles({
    name: "browser-prescription.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(prescriptionBody),
  });
await page
  .getByText("Prescription uploaded securely.", { exact: true })
  .waitFor();
const fileUrl = await page
  .getByRole("link", { name: "Download", exact: true })
  .getAttribute("href");
const downloaded = await page.request.get(new URL(fileUrl, page.url()).href);
if (!downloaded.ok() || (await downloaded.text()) !== prescriptionBody)
  throw new Error(
    "Prescription upload/download through the runtime proxy failed",
  );

await page
  .getByRole("button", { name: "My appointments", exact: false })
  .click();
await page.getByRole("button", { name: "Cancel", exact: true }).click();
await page.getByText("Appointment cancelled.", { exact: true }).waitFor();
// Exercise every care category against the deployed services, then release test slots.
for (const name of ["Panchkarma", "Diagnostic tests", "Physiotherapy"]) {
  await page.getByRole("button", {name, exact: true}).click();
  await page.getByRole("button", {name: "Choose a slot", exact: true}).first().click();
  await page.locator(".slot-grid button").first().click();
  const homeAddress = page.getByLabel("Home visit address", {exact: true});
  if (await homeAddress.count()) await homeAddress.fill("12 Sample Street, New Delhi 110001");
  await page.getByRole("button", {name: "Confirm appointment", exact: true}).click();
  await page.getByText("Your appointment is confirmed.", {exact: true}).waitFor();
  await page.getByRole("button", {name: "Cancel", exact: true}).click();
  await page.getByText("Appointment cancelled.", {exact: true}).waitFor();
}
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Open navigation" }).click();
await page.getByRole("button", { name: "Overview", exact: true }).click();
await page.waitForFunction(
  () => document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
);
await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
if (
  await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
)
  throw new Error("Mobile horizontal overflow");
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "PASS: registration, all five service modules, video demo, medicine search, cart, checkout, prescription upload/download, cancellation, mobile layout; no browser runtime errors",
);
await browser.close();
