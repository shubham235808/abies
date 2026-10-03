import type { Metadata } from 'next';
import { ToastProvider } from '@abies/design-system/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'ABIES — Partner Portal',
  description: 'Doctor, diagnostic lab, pharmacy and Panchakarma centre portals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
