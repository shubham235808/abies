import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
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
