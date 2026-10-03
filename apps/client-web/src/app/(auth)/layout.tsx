import { SiteHeader } from '@/components/layouts/site-header';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
