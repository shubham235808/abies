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
// every booking/order/consultation/therapy payment flow depends on this,
// so getting the allowlist wrong breaks real functionality, not just a
// lint rule.
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
  // Deliberately NOT including 'upgrade-insecure-requests' — see
  // docs/EXPANSION-TARGET-ARCHITECTURE.md / git history for why (breaks
  // plain-HTTP review deployments by rewriting every asset request to
  // https: even when the page itself loaded over http:).
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // EXPANSION-5 — lets this app's bundler process @abies/domain and
  // @abies/design-system's TypeScript source directly (workspace
  // packages ship source, not a separate compiled build step).
  transpilePackages: ['@abies/domain', '@abies/design-system'],
  experimental: {
    // src/proxy.ts matches every route, so Next buffers each request body
    // and silently truncates anything past this (default 10mb) — which
    // would corrupt media-library video uploads (MEDIA_VIDEO_MAX_BYTES,
    // 50 MB, in packages/domain/src/modules/media/media.schemas.ts) rather
    // than reject them. 55mb leaves room for multipart framing. nginx's
    // client_max_body_size stays the per-route cap in front of this.
    proxyClientMaxBodySize: '55mb',
  },
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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
