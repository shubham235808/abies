import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { handleRazorpayWebhookPayment } from '@/modules/appointments/appointments.service';

// Defense-in-depth alongside /api/appointments/verify-payment: a patient
// whose browser closes right after paying (before the checkout callback
// fires) would otherwise be stuck PENDING_PAYMENT forever. Razorpay signs
// the raw body with RAZORPAY_WEBHOOK_SECRET — a *different* secret than the
// per-payment checkout signature — so this only does anything once that's
// configured in the Razorpay dashboard and here.
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  if (!signature || !verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment) {
    await handleRazorpayWebhookPayment(payment);
  }

  return NextResponse.json({ ok: true });
}
