import { redirect } from 'next/navigation';
import { MfaForm } from '@/components/auth/mfa-form';
import { getCurrentSession } from '@/server/current-user';

// Standalone MFA completion step for an existing session that never
// finished it (e.g. closed the tab mid-login). PortalShell redirects here
// for any ADMIN session with mfaVerified=false, rather than forcing a full
// fresh OTP request.
export default async function LoginMfaPage() {
  const session = await getCurrentSession();
  if (!session || session.user.role !== 'ADMIN') redirect('/login');
  if (session.mfaVerified) redirect('/admin');

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Verify it&apos;s you</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Finish the admin verification step to continue.</p>
      <div className="mt-6">
        <MfaForm redirectTo="/admin" />
      </div>
    </main>
  );
}
