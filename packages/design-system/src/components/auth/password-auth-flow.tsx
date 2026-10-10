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
import { registerSchema } from '@abies/domain/modules/auth/auth.schemas';

// The primary sign-in flow for every portal, password-first (docs/password-auth-backend.md).
// OTP now serves two things only: self-onboarding for new partner accounts
// (a separate page — see otpSignupHref) and password setup/recovery here.
//
// Login/register/forgot/setup never take a role: the account's own role
// decides the redirect, and register() always creates PATIENT, so there is
// no role picker in this flow at all (unlike the OTP LoginFlow it replaces).
export function PasswordAuthFlow({
  heading = 'Welcome back',
  subheading = 'Sign in with your mobile number or email.',
  allowSelfRegistration = false,
  otpSignupHref,
}: {
  heading?: string;
  subheading?: string;
  allowSelfRegistration?: boolean;
  otpSignupHref?: string;
}) {
  type Step =
    | { name: 'login' }
    | { name: 'register' }
    | { name: 'password-setup'; requestId: string; mobile: string }
    | { name: 'forgot-request' }
    | { name: 'forgot-otp'; requestId: string }
    | { name: 'mfa'; role: string };

  const [step, setStep] = useState<Step>({ name: 'login' });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onAuthenticated = (role: string, mfaRequired: boolean) => {
    setFormError(null);
    if (mfaRequired) {
      setStep({ name: 'mfa', role });
    } else {
      window.location.assign(PORTAL_PATH[role] ?? '/');
    }
  };

  return (
    <main className="grid min-h-[620px] place-items-center bg-gradient-to-br from-white via-[#fff4fc] to-[#edf8fc] px-6 py-12">
      <div className="w-full max-w-[480px] rounded-[28px] border border-brand-neutral-100 bg-white p-7 shadow-brand">
        <Image src="/abies-mark.png" alt="ABIES" width={64} height={64} className="rounded-control" />
        <span className="mt-3.5 inline-flex items-center gap-2 rounded-pill bg-brand-purple-500/[0.07] px-3 py-1.5 text-xs font-bold text-brand-purple-700">
          Secure access
        </span>
        <h1 className="mt-2.5 text-[28px] font-extrabold text-brand-neutral-900">
          {step.name === 'register'
            ? 'Create your account'
            : step.name === 'forgot-request' || step.name === 'forgot-otp'
              ? 'Reset your password'
              : step.name === 'password-setup'
                ? 'Set up your password'
                : heading}
        </h1>
        <p className="mt-1 text-sm text-brand-neutral-500">
          {step.name === 'register'
            ? 'Both a mobile number and an email are required.'
            : step.name === 'forgot-request'
              ? "We'll send a one-time code to confirm it's you."
              : step.name === 'forgot-otp'
                ? 'Enter the code and choose a new password.'
                : step.name === 'password-setup'
                  ? "Your account doesn't have a password yet — enter the code we sent to set one."
                  : subheading}
        </p>

        {notice && (
          <Alert tone="success" className="mt-6">
            {notice}
          </Alert>
        )}
        {formError && (
          <Alert tone="error" className="mt-6">
            {formError}
          </Alert>
        )}

        <div className="mt-6">
          {step.name === 'login' && (
            <LoginStepForm
              onError={setFormError}
              onAuthenticated={onAuthenticated}
              onNeedsPasswordSetup={(requestId, mobile) => {
                setFormError(null);
                setStep({ name: 'password-setup', requestId, mobile });
              }}
              onForgotPassword={() => {
                setFormError(null);
                setStep({ name: 'forgot-request' });
              }}
              onRegister={allowSelfRegistration ? () => { setFormError(null); setStep({ name: 'register' }); } : undefined}
              otpSignupHref={otpSignupHref}
            />
          )}

          {step.name === 'register' && (
            <RegisterStepForm
              onError={setFormError}
              onRegistered={onAuthenticated}
              onBack={() => { setFormError(null); setStep({ name: 'login' }); }}
            />
          )}

          {step.name === 'forgot-request' && (
            <ForgotRequestStepForm
              onError={setFormError}
              onSent={(requestId) => { setFormError(null); setStep({ name: 'forgot-otp', requestId }); }}
              onBack={() => { setFormError(null); setStep({ name: 'login' }); }}
            />
          )}

          {step.name === 'forgot-otp' && (
            <SetPasswordStepForm
              requestId={step.requestId}
              submitLabel="Reset password"
              onSubmitAction={(requestId, otp, newPassword) => api.post('/api/v1/auth/password/reset', { requestId, otp, newPassword })}
              onError={setFormError}
              onDone={(role) => {
                setNotice('Password reset. Signing you in...');
                onAuthenticated(role, false);
              }}
              onBack={() => { setFormError(null); setStep({ name: 'forgot-request' }); }}
            />
          )}

          {step.name === 'password-setup' && (
            <SetPasswordStepForm
              requestId={step.requestId}
              submitLabel="Set password"
              onSubmitAction={(requestId, otp, newPassword) => api.post('/api/v1/auth/password/setup', { requestId, otp, newPassword })}
              onError={setFormError}
              onDone={(role) => {
                setNotice('Password set. Signing you in...');
                onAuthenticated(role, false);
              }}
              onBack={() => { setFormError(null); setStep({ name: 'login' }); }}
            />
          )}

          {step.name === 'mfa' && <MfaForm redirectTo={PORTAL_PATH[step.role] ?? '/'} />}
        </div>
      </div>
    </main>
  );
}

function LoginStepForm({
  onAuthenticated,
  onNeedsPasswordSetup,
  onForgotPassword,
  onRegister,
  onError,
  otpSignupHref,
}: {
  onAuthenticated: (role: string, mfaRequired: boolean) => void;
  onNeedsPasswordSetup: (requestId: string, mobile: string) => void;
  onForgotPassword: () => void;
  onRegister?: () => void;
  onError: (message: string) => void;
  otpSignupHref?: string;
}) {
  const schema = z.object({
    identifier: z
      .string()
      .trim()
      .min(3, 'Enter your mobile number or email')
      .refine((v) => v.includes('@') || v.replace(/\D/g, '').length >= 10, 'Enter a 10-digit mobile number or a valid email'),
    password: z.string().min(1, 'Enter your password'),
  });
  type LoginStep = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginStep>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    const identifier = data.identifier.trim();
    const body = identifier.includes('@')
      ? { email: identifier, password: data.password }
      : { mobile: identifier, password: data.password };
    try {
      const result = await api.post<
        | { requiresPasswordSetup: true; mobile: string }
        | { requiresPasswordSetup: false; user: { role: string }; mfaRequired: boolean }
      >('/api/v1/auth/login', body);
      if (result.requiresPasswordSetup) {
        // The account exists but has never set a password — prove control of
        // its OTP channel first (same request the "forgot password" flow
        // uses), then move to the setup step.
        const reset = await api.post<{ requestId: string }>('/api/v1/auth/password/forgot', { mobile: result.mobile });
        onNeedsPasswordSetup(reset.requestId, result.mobile);
      } else {
        onAuthenticated(result.user.role, result.mfaRequired);
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <button type="button" onClick={onForgotPassword} className="text-xs font-semibold text-brand-purple-600 underline">
            Forgot password?
          </button>
        </div>
        <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        <FieldError>{errors.password?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
      {(onRegister || otpSignupHref) && (
        <p className="text-center text-sm text-brand-neutral-500">
          {onRegister && (
            <button type="button" onClick={onRegister} className="font-semibold text-brand-purple-600 underline">
              Create an account
            </button>
          )}
          {otpSignupHref && (
            <Link href={otpSignupHref} className="font-semibold text-brand-purple-600 underline">
              New partner? Apply with a one-time code
            </Link>
          )}
        </p>
      )}
    </form>
  );
}

function RegisterStepForm({
  onRegistered,
  onError,
  onBack,
}: {
  onRegistered: (role: string, mfaRequired: boolean) => void;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  type RegisterStep = z.infer<typeof registerSchema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStep>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await api.post<{ user: { role: string } }>('/api/v1/auth/register', data);
      onRegistered(result.user.role, false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" placeholder="As on your ID" {...register('name')} />
        <FieldError>{errors.name?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" autoComplete="tel" placeholder="98765 43210" {...register('mobile')} />
        <FieldError>{errors.mobile?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        <FieldError>{errors.password?.message}</FieldError>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Create account
        </Button>
      </div>
    </form>
  );
}

function ForgotRequestStepForm({
  onSent,
  onError,
  onBack,
}: {
  onSent: (requestId: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  const schema = z.object({
    identifier: z
      .string()
      .trim()
      .min(3, 'Enter your mobile number or email')
      .refine((v) => v.includes('@') || v.replace(/\D/g, '').length >= 10, 'Enter a 10-digit mobile number or a valid email'),
  });
  type ForgotStep = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotStep>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    const identifier = data.identifier.trim();
    const body = identifier.includes('@') ? { email: identifier } : { mobile: identifier };
    try {
      const result = await api.post<{ requestId: string }>('/api/v1/auth/password/forgot', body);
      onSent(result.requestId);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
      <p className="text-xs text-brand-neutral-500">If an account exists, a code was sent to it.</p>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Send code
        </Button>
      </div>
    </form>
  );
}

function SetPasswordStepForm({
  requestId,
  submitLabel,
  onSubmitAction,
  onDone,
  onError,
  onBack,
}: {
  requestId: string;
  submitLabel: string;
  onSubmitAction: (requestId: string, otp: string, newPassword: string) => Promise<{ user: { role: string } }>;
  onDone: (role: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  const schema = z.object({
    otp: z.string().min(4, 'Enter the code you received').max(8),
    newPassword: z.string().min(12, 'Password must be at least 12 characters').max(256, 'Password is too long'),
  });
  type SetPasswordStep = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordStep>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const result = await onSubmitAction(requestId, data.otp, data.newPassword);
      onDone(result.user.role);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not verify that code. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="otp">Enter the 6-digit code</Label>
        <Input id="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...register('otp')} />
        <FieldError>{errors.otp?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
        <FieldError>{errors.newPassword?.message}</FieldError>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
