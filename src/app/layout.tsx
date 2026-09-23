import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ABIES — Ayurveda Care Platform',
  description:
    'A trusted digital care network connecting patients, verified Ayurveda practitioners, diagnostics, medicines and Panchakarma services through one coordinated treatment journey.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
