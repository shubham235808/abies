'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, FieldError } from '@abies/design-system/components/ui/input';
import { Alert } from '@abies/design-system/components/ui/alert';
import { api, ApiError } from '@abies/design-system/api-client';
import { verifyMfaSchema } from '@abies/domain/modules/auth/auth.schemas';
import type { z } from 'zod';

type MfaStep = z.infer<typeof verifyMfaSchema>;

// Shared by the inline login flow (fresh session, mfaRequired just came
// back from OTP verify) and the standalone /login/mfa page (an existing
// session whose admin MFA step was never completed — e.g. they navigated
// away before finishing it last time).
export function MfaForm({ redirectTo }: { redirectTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MfaStep>({ resolver: zodResolver(verifyMfaSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/api/auth/mfa/verify', data);
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
        <Label htmlFor="code">Admin verification code</Label>
        <Input id="code" inputMode="numeric" placeholder="654321" {...register('code')} />
        <FieldError>{errors.code?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Verify
      </Button>
    </form>
  );
}
