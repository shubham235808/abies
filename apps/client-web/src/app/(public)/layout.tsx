import { SiteHeader } from '@/components/layouts/site-header';
import { SiteFooter } from '@/components/layouts/site-footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
