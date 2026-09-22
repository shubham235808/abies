import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Abies | A healthier you, naturally",
  description:
    "Your connected Ayurveda care experience. Consultations, medicine, therapies, diagnostics and physiotherapy.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
