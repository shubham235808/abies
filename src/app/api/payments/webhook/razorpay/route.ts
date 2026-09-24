import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { handleRazorpayWebhookPayment } from '@/modules/appointments/appointments.service';
import { finalizeOrderPaymentByOrder } from '@/modules/diagnostics/orders.service';

// Defense-in-depth alongside each purpose's own /verify-payment route: a
// patient whose browser closes right after paying (before the checkout
// callback fires) would otherwise be stuck in a pending-payment state
// forever. Razorpay signs the raw body with RAZORPAY_WEBHOOK_SECRET — a
// *different* secret than the per-payment checkout signature — so this
// only does anything once that's configured in the Razorpay dashboard and
// here. One endpoint serves every payment purpose: it looks up which
// purpose the order belongs to and dispatches to that module's own
// idempotent finalizer, rather than each purpose needing its own webhook
// URL registered with Razorpay.
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
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id && payment?.id) {
    const record = await prisma.payment.findUnique({ where: { gatewayOrderId: payment.order_id }, select: { purpose: true } });
    try {
      if (record?.purpose === 'DIAGNOSTIC_ORDER') {
        await finalizeOrderPaymentByOrder({ gatewayOrderId: payment.order_id, gatewayPaymentId: payment.id, gatewaySignature: 'webhook' });
      } else if (record?.purpose === 'CONSULTATION') {
        await handleRazorpayWebhookPayment(payment);
      }
    } catch (err) {
      console.error('[webhook razorpay] finalize failed', err);
    }
  }

  return NextResponse.json({ ok: true });
}
