'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api-client';

export function SubmitButton() {
  const router = useRouter();
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/doctors/me/submit', { declarationAccepted });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your application.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl rounded-card border border-brand-neutral-200 bg-white p-5">
      <h2 className="font-semibold text-brand-neutral-900">Submit for verification</h2>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-brand-neutral-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={declarationAccepted}
          onChange={(e) => setDeclarationAccepted(e.target.checked)}
        />
        <span>
          I declare that the information and documents provided are accurate and that I am authorised
          to practise under the stated registration.
        </span>
      </label>
      <Button className="mt-4" disabled={!declarationAccepted} loading={loading} onClick={handleSubmit}>
        Submit application
      </Button>
    </div>
  );
}
