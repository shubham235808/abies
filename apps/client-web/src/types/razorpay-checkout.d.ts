// Ambient type for the Razorpay Checkout.js browser SDK, loaded on demand
// via a <script> tag (src/app/(public)/doctors/[slug]/booking-widget.tsx)
// rather than bundled — it's a third-party script, not an npm package.
interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayCheckoutInstance {
  open(): void;
}

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
}
