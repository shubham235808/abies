'use client';

import { useState } from 'react';
import { api } from '../api-client';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await api.post('/api/auth/logout').catch(() => undefined);
        // Full navigation, not router.push: guarantees the portal shell's
        // server-side session check re-runs against the now-cleared cookie
        // instead of risking a client-side router cache hit from before logout.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/login');
      }}
      className="text-sm font-medium text-brand-neutral-600 hover:text-brand-magenta-600 disabled:opacity-50"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
