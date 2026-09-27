// Content-Security-Policy without nonces (docs/next's own "Without Nonces"
// recipe) — a nonce-based CSP requires forcing every page to render
// dynamically (no static optimization), which would regress the several
// genuinely-static pages this app already has (/login, /support, /terms,
// /privacy, /partners). 'unsafe-inline' on script/style is the accepted
// tradeoff of that simpler approach; it still blocks the things that
// actually matter for a payments app — arbitrary third-party script/frame
// injection, clickjacking, and mixed-content.
//
// checkout.razorpay.com/api.razorpay.com/lumberjack.razorpay.com are
// allowlisted because src/lib/razorpay-checkout.ts loads Razorpay's
// Checkout.js on demand and it opens an iframe + makes its own XHR calls —
// every booking/order/consultation/therapy payment flow across Phases 4-11
// depends on this, so getting the allowlist wrong breaks real functionality,
// not just a lint rule.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Deliberately NOT including 'upgrade-insecure-requests': unlike HSTS,
  // it is not a no-op over plain HTTP — it rewrites every subresource
  // request to https: regardless of the scheme the page itself loaded
  // over, so a page reached at http://<host>:3000 (this app's only real
  // deployment mode right now: the LAN review container, and the real
  // Nginx+TLS Ubuntu VM target that doesn't exist yet either) had every
  // asset request rewritten to https://<host>:3000/... and fail outright
  // with ERR_SSL_PROTOCOL_ERROR, since nothing on that port speaks TLS.
  // Found live: the very first real browser check against the LAN address
  // after shipping it. Add it back only once Nginx is actually terminating
  // TLS in front of this app.
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: CSP },
          // No-op over plain HTTP (browsers only honor HSTS on a response
          // actually received over HTTPS) — real effect starts the moment
          // TLS termination is wired up at the Nginx layer.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
