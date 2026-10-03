'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, FieldError } from '@abies/design-system/components/ui/input';
import { Alert } from '@abies/design-system/components/ui/alert';
import { MfaForm } from '@/components/auth/mfa-form';
import { api, ApiError } from '@abies/design-system/api-client';
import { PORTAL_PATH } from '../../../lib/portal-paths';

const ROLE_OPTIONS = [
  { value: 'PATIENT', label: 'Patient' },
  { value: 'DOCTOR', label: 'Doctor / Vaidya' },
  { value: 'LAB', label: 'Diagnostic Lab' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'PANCHAKARMA_CENTRE', label: 'Panchakarma Centre' },
  { value: 'CUSTOMER_SUPPORT', label: 'Customer Support' },
  { value: 'TECH_SUPPORT', label: 'Technical Support' },
  { value: 'SALES', label: 'Sales / Partner Ops' },
  { value: 'CARE_COORDINATOR', label: 'Care Coordinator' },
  { value: 'ADMIN', label: 'Administrator' },
] as const;

const mobileStepSchema = z.object({
  mobile: z.string().min(10, 'Enter a 10-digit mobile number'),
  role: z.enum([
    'PATIENT',
    'DOCTOR',
    'LAB',
    'PHARMACY',
    'PANCHAKARMA_CENTRE',
    'CUSTOMER_SUPPORT',
    'TECH_SUPPORT',
    'SALES',
    'CARE_COORDINATOR',
    'ADMIN',
  ]),
});
type MobileStep = z.infer<typeof mobileStepSchema>;

const otpStepSchema = z.object({
  otp: z.string().min(4, 'Enter the code you received').max(8),
  acceptedTerms: z.literal(true, { message: 'You must accept the Terms and Privacy Notice to continue' }),
});
type OtpStep = z.infer<typeof otpStepSchema>;

type Step =
  | { name: 'mobile' }
  | { name: 'otp'; requestId: string; role: string; devOtp?: string }
  | { name: 'mfa'; role: string };

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ name: 'mobile' });
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <main className="grid min-h-[620px] place-items-center bg-gradient-to-br from-white via-[#fff4fc] to-[#edf8fc] px-6 py-12">
      <div className="w-full max-w-[480px] rounded-[28px] border border-brand-neutral-100 bg-white p-7 shadow-brand">
        <Image src="/abies-mark.png" alt="ABIES" width={64} height={64} className="rounded-control" />
        <span className="mt-3.5 inline-flex items-center gap-2 rounded-pill bg-brand-purple-500/[0.07] px-3 py-1.5 text-xs font-bold text-brand-purple-700">
          Secure access
        </span>
        <h1 className="mt-2.5 text-[28px] font-extrabold text-brand-neutral-900">Welcome to ABIES Care</h1>
        <p className="mt-1 text-sm text-brand-neutral-500">We&apos;ll text you a one-time code — no password needed.</p>

        {formError && (
          <Alert tone="error" className="mt-6">
            {formError}
          </Alert>
        )}

        <div className="mt-6">
          {step.name === 'mobile' && (
            <MobileStepForm
              onError={setFormError}
              onSent={(requestId, role, devOtp) => {
                setFormError(null);
                setStep({ name: 'otp', requestId, role, devOtp });
              }}
            />
          )}
          {step.name === 'otp' && (
            <OtpStepForm
              requestId={step.requestId}
              devOtp={step.devOtp}
              onError={setFormError}
              onBack={() => setStep({ name: 'mobile' })}
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

function MobileStepForm({
  onSent,
  onError,
}: {
  onSent: (requestId: string, role: string, devOtp?: string) => void;
  onError: (message: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MobileStep>({ resolver: zodResolver(mobileStepSchema), defaultValues: { role: 'PATIENT' } });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await api.post<{ requestId: string; devOtp?: string }>('/api/auth/otp/request', data);
      onSent(result.requestId, data.role, result.devOtp);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="role">I am a</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ROLE_OPTIONS.map((opt) => (
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
      <div>
        <Label htmlFor="mobile">Mobile number</Label>
        <Input
          id="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="98765 43210"
          {...register('mobile')}
        />
        <FieldError>{errors.mobile?.message}</FieldError>
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
  onVerified,
  onError,
  onBack,
}: {
  requestId: string;
  devOtp?: string;
  onVerified: (role: string, mfaRequired: boolean) => void;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpStep>({ resolver: zodResolver(otpStepSchema), defaultValues: { otp: devOtp ?? '' } });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await api.post<{ user: { role: string }; mfaRequired: boolean }>('/api/auth/otp/verify', {
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
