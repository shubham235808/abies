// Small helpers shared by the CRM pages. Money is stored as whole rupees.

export function formatRupees(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
}

export function enumLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function personName(p: { firstName: string; lastName: string | null } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : '—';
}

// The API returns { error: string } on failure. Never show stack traces.
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

// Builds a link to the current page with some query params changed.
export function linkWith(params: Record<string, string | undefined>, changes: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) if (value) qs.set(key, value);
  const s = qs.toString();
  return s ? `?${s}` : '?';
}
