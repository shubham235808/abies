import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import { getEnv } from '@/lib/env';

// Thin wrapper around the Razorpay SDK — the only place that talks to the
// gateway or knows its rupee->paise conversion. Every other module works in
// rupees (docs/DOMAIN-MODEL.md §11's Payment.amount, same unit as
// DoctorProfile.videoFee/clinicFee).
//
// isConfigured() gates the entire booking-checkout path (modules/appointments):
// without real (even test-mode) Razorpay keys there is nothing this adapter
// can honestly do, so callers must refuse to start a checkout rather than
// fabricate an order — same "hard fail, don't fake it" rule the codebase
// already applies to admin MFA in production (see auth.service.ts).

export function isConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

let client: Razorpay | undefined;

function getClient(): Razorpay {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createOrder(params: {
  amountRupees: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<GatewayOrder> {
  const rp = getClient();
  const order = await rp.orders.create({
    amount: Math.round(params.amountRupees * 100),
    currency: params.currency ?? 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

// Razorpay's documented checkout-verification algorithm: HMAC-SHA256 of
// `orderId|paymentId` using the key secret, constant-time compared against
// the signature the client received. This is pure crypto (no network call)
// and is exactly what verifiedAt is allowed to depend on
// (docs/DOMAIN-MODEL.md §11) — never a bare client callback claiming success.
export function verifySignature(params: { orderId: string; paymentId: string; signature: string }): boolean {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(params.signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Webhooks sign the raw request body with a separate secret
// (RAZORPAY_WEBHOOK_SECRET) using the same HMAC-SHA256 scheme.
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const env = getEnv();
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
