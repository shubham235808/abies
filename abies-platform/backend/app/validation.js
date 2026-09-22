import { z } from "zod";
export const uuid = z.string().uuid();
export const registration = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const login = registration.omit({ name: true });
export const booking = z.object({
  serviceId: z.string().max(80),
  practitionerId: z.string().max(80),
  startsAt: z.iso.datetime(),
  mode: z.enum(["video", "clinic", "home"]),
  address: z.string().trim().max(500).optional(),
});
export const checkout = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().max(80),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(30),
  address: z.string().trim().min(10).max(500),
  prescriptionId: uuid.optional(),
  idempotencyKey: uuid,
});
export function validSlot(date) {
  const d = new Date(date),
    now = Date.now();
  return (
    d.getTime() > now &&
    d.getTime() < now + 60 * 86400000 &&
    d.getUTCHours() >= 9 &&
    d.getUTCHours() < 17 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}
