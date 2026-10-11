import type { Metadata } from 'next';
import { ToastProvider } from '@abies/design-system/components/ui/toast';
import './globals.css';

// Lets every page's relative og:image URL (lib/seo.ts — proxy routes under
// /api/v1/public/..., not a direct signed storage URL a crawler couldn't
// reach anyway) resolve to an absolute one in the actual rendered meta tag,
// without every call site building that absolute URL itself.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? 'https://dev.abies.in'),
  title: 'ABIES — Ayurveda Care Platform',
  description:
    'A trusted digital care network connecting patients, verified Ayurveda practitioners, diagnostics, medicines and Panchakarma services through one coordinated treatment journey.',
};

// SiteHeader is deliberately NOT rendered here — it lives in the
// (public) and (auth) route group layouts instead. The portal routes
// (/patient, /doctor, /admin) render their own header via PortalShell;
// rendering SiteHeader here too gave every portal page two stacked
// headers (docs/IMPLEMENTATION-STATUS.md — found via an actual
// screenshot, not by reading the code).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
