'use client';

// Loads Razorpay's Checkout.js on demand (not bundled, not loaded for
// anonymous visitors) — shared by every booking flow that takes a payment
// (appointments, diagnostic orders, ...). See src/types/razorpay-checkout.d.ts
// for the window.Razorpay ambient type.
const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayScriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window.Razorpay !== 'undefined') return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment provider script'));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}
