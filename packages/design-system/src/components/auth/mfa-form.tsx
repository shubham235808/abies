'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import { Button } from '../ui/button';
import { Input, Label, FieldError } from '../ui/input';
import { Alert } from '../ui/alert';
import { api, ApiError } from '../../api-client';
import { verifyMfaSchema } from '@abies/domain/modules/auth/auth.schemas';
import type { z } from 'zod';

type MfaStep = z.infer<typeof verifyMfaSchema>;

type LoadState =
  | { phase: 'loading' }
  | { phase: 'verify' }
  | { phase: 'enroll'; secret: string; qrCodeDataUrl: string }
  | { phase: 'error'; message: string };

// Shared by the inline login flow (fresh session, mfaRequired just came
// back from password/OTP verify) and the standalone /login/mfa page (an
// existing session whose admin MFA step was never completed). Checks
// enrollment first: a never-enrolled account gets the QR setup step
// instead of a code box with nothing to generate a code from.
export function MfaForm({ redirectTo }: { redirectTo: string }) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.get<{ enrolled: boolean }>('/api/v1/auth/mfa/totp/status');
        if (cancelled) return;
        if (status.enrolled) {
          setState({ phase: 'verify' });
          return;
        }
        const enrollment = await api.post<{ secret: string; qrCodeDataUrl: string }>('/api/v1/auth/mfa/totp/enroll');
        if (cancelled) return;
        setState({ phase: 'enroll', secret: enrollment.secret, qrCodeDataUrl: enrollment.qrCodeDataUrl });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load the verification step. Please try again.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') return <Alert tone="info">Checking your account&apos;s verification setup...</Alert>;
  if (state.phase === 'error') return <Alert tone="error">{state.message}</Alert>;
  if (state.phase === 'enroll') {
    return <EnrollStep secret={state.secret} qrCodeDataUrl={state.qrCodeDataUrl} redirectTo={redirectTo} />;
  }
  return <VerifyStep redirectTo={redirectTo} />;
}

function VerifyStep({ redirectTo }: { redirectTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MfaStep>({ resolver: zodResolver(verifyMfaSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/mfa/verify', data);
      window.location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify that code. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Alert tone="info">Administrator accounts require an extra verification step.</Alert>
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="code">Authenticator code</Label>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...register('code')} />
        <FieldError>{errors.code?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Verify
      </Button>
    </form>
  );
}

function EnrollStep({ secret, qrCodeDataUrl, redirectTo }: { secret: string; qrCodeDataUrl: string; redirectTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MfaStep>({ resolver: zodResolver(verifyMfaSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/mfa/totp/confirm', data);
      window.location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not confirm that code. Please try again.');
    }
  });

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Set up an authenticator app (Google Authenticator, Authy, 1Password, ...) for this administrator account —
        required before you can continue.
      </Alert>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-brand-neutral-200 p-4">
        <Image src={qrCodeDataUrl} alt="Scan with your authenticator app" width={200} height={200} unoptimized />
        <p className="text-xs text-brand-neutral-500">Can&apos;t scan? Enter this key manually:</p>
        <code className="rounded bg-brand-neutral-50 px-2 py-1 text-sm font-mono tracking-wide">{secret}</code>
      </div>
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="code">Enter the 6-digit code from your app</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...register('code')} />
          <FieldError>{errors.code?.message}</FieldError>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Confirm and finish setup
        </Button>
      </form>
    </div>
  );
}
