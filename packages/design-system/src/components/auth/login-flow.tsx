'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { Button } from '../ui/button';
import { Input, Label, FieldError } from '../ui/input';
import { Alert } from '../ui/alert';
import { MfaForm } from './mfa-form';
import { api, ApiError } from '../../api-client';
import { PORTAL_PATH } from './portal-paths';

export interface LoginRoleOption {
  value: string;
  label: string;
}

// One sign-in flow shared by every portal. Each portal passes only its own
// roles, so a user can't pick a role that belongs to a different portal. The
// server still checks the role against the account (auth.service verifyOtp).
//
// The identifier is a mobile number or the email on the account. An email
// (anything with "@") is sent as `email`; anything else as `mobile`.
export function LoginFlow({
  roles,
  heading = 'Welcome to ABIES Care',
  subheading = "We'll send you a one-time code — no password needed.",
}: {
  roles: LoginRoleOption[];
  heading?: string;
  subheading?: string;
}) {
  type Step =
    | { name: 'identifier' }
    | { name: 'otp'; requestId: string; role: string; devOtp?: string; isNewAccount: boolean }
    | { name: 'mfa'; role: string };

  const [step, setStep] = useState<Step>({ name: 'identifier' });
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <main className="grid min-h-[620px] place-items-center bg-gradient-to-br from-white via-[#fff4fc] to-[#edf8fc] px-6 py-12">
      <div className="w-full max-w-[480px] rounded-[28px] border border-brand-neutral-100 bg-white p-7 shadow-brand">
        <Image src="/abies-mark.png" alt="ABIES" width={64} height={64} className="rounded-control" />
        <span className="mt-3.5 inline-flex items-center gap-2 rounded-pill bg-brand-purple-500/[0.07] px-3 py-1.5 text-xs font-bold text-brand-purple-700">
          Secure access
        </span>
        <h1 className="mt-2.5 text-[28px] font-extrabold text-brand-neutral-900">{heading}</h1>
        <p className="mt-1 text-sm text-brand-neutral-500">{subheading}</p>

        {formError && (
          <Alert tone="error" className="mt-6">
            {formError}
          </Alert>
        )}

        <div className="mt-6">
          {step.name === 'identifier' && (
            <IdentifierStepForm
              roles={roles}
              onError={setFormError}
              onSent={(requestId, role, devOtp, isNewAccount) => {
                setFormError(null);
                setStep({ name: 'otp', requestId, role, devOtp, isNewAccount });
              }}
            />
          )}
          {step.name === 'otp' && (
            <OtpStepForm
              requestId={step.requestId}
              devOtp={step.devOtp}
              isNewAccount={step.isNewAccount}
              onError={setFormError}
              onBack={() => setStep({ name: 'identifier' })}
              onVerified={(role, mfaRequired) => {
                setFormError(null);
                if (mfaRequired) {
                  setStep({ name: 'mfa', role });
                } else {
                  window.location.assign(PORTAL_PATH[role] ?? '/');
                }
              }}
            />
          )}
          {step.name === 'mfa' && <MfaForm redirectTo={PORTAL_PATH[step.role] ?? '/'} />}
        </div>
      </div>
    </main>
  );
}

function IdentifierStepForm({
  roles,
  onSent,
  onError,
}: {
  roles: LoginRoleOption[];
  onSent: (requestId: string, role: string, devOtp: string | undefined, isNewAccount: boolean) => void;
  onError: (message: string) => void;
}) {
  const schema = z.object({
    role: z.enum(roles.map((r) => r.value) as [string, ...string[]]),
    identifier: z
      .string()
      .trim()
      .min(3, 'Enter your mobile number or email')
      .refine((v) => v.includes('@') || v.replace(/\D/g, '').length >= 10, 'Enter a 10-digit mobile number or a valid email'),
  });
  type IdentifierStep = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IdentifierStep>({ resolver: zodResolver(schema), defaultValues: { role: roles[0]?.value } });

  const onSubmit = handleSubmit(async (data) => {
    const identifier = data.identifier.trim();
    const body = identifier.includes('@')
      ? { role: data.role, email: identifier }
      : { role: data.role, mobile: identifier };
    try {
      const result = await api.post<{ requestId: string; devOtp?: string; isNewAccount: boolean }>(
        '/api/v1/auth/otp/request',
        body,
      );
      onSent(result.requestId, data.role, result.devOtp, result.isNewAccount);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {roles.length > 1 && (
        <div>
          <Label htmlFor="role">I am a</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roles.map((opt) => (
              <label
                key={opt.value}
                className="cursor-pointer rounded-control border border-brand-neutral-200 px-3 py-2.5 text-center text-sm font-bold has-[:checked]:border-brand-purple-500 has-[:checked]:bg-brand-purple-50 has-[:checked]:text-brand-purple-700"
              >
                <input type="radio" value={opt.value} {...register('role')} className="sr-only" />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {roles.length === 1 && <input type="hidden" {...register('role')} />}
      <div>
        <Label htmlFor="identifier">Mobile number or email</Label>
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="98765 43210 or you@example.com"
          {...register('identifier')}
        />
        <FieldError>{errors.identifier?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send code
      </Button>
    </form>
  );
}

function OtpStepForm({
  requestId,
  devOtp,
  isNewAccount,
  onVerified,
  onError,
  onBack,
}: {
  requestId: string;
  devOtp?: string;
  isNewAccount: boolean;
  onVerified: (role: string, mfaRequired: boolean) => void;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  const schema = z.object({
    otp: z.string().min(4, 'Enter the code you received').max(8),
    acceptedTerms: z.literal(true, { message: 'You must accept the Terms and Privacy Notice to continue' }),
    // Only a new account asks for a name; an existing one signs in without it.
    name: isNewAccount
      ? z.string().trim().min(2, 'Enter your full name').max(120)
      : z.string().trim().max(120).optional(),
  });
  type OtpStep = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpStep>({ resolver: zodResolver(schema), defaultValues: { otp: devOtp ?? '' } });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await api.post<{ user: { role: string }; mfaRequired: boolean }>('/api/v1/auth/otp/verify', {
        requestId,
        ...data,
      });
      onVerified(result.user.role, result.mfaRequired);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not verify that code. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {devOtp && (
        <Alert tone="info">
          Development mode — your code is <span className="font-mono font-semibold">{devOtp}</span>.
        </Alert>
      )}
      {isNewAccount && (
        <div>
          <Label htmlFor="name">Your full name</Label>
          <Input id="name" autoComplete="name" placeholder="As on your ID" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
      )}
      <div>
        <Label htmlFor="otp">Enter the 6-digit code</Label>
        <Input id="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...register('otp')} />
        <FieldError>{errors.otp?.message}</FieldError>
      </div>
      <label className="flex items-start gap-2 text-sm text-brand-neutral-600">
        <input type="checkbox" className="mt-0.5" {...register('acceptedTerms')} />
        <span>
          I accept the{' '}
          <Link href="/terms" className="text-brand-purple-600 underline" target="_blank">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-brand-purple-600 underline" target="_blank">
            Privacy Notice
          </Link>
          .
        </span>
      </label>
      <FieldError>{errors.acceptedTerms?.message}</FieldError>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Verify &amp; continue
        </Button>
      </div>
    </form>
  );
}
