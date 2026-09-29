// ENTERPRISE-10 — captures the x-request-id a failed API call's response
// carried (src/proxy.ts stamps every response with one) so a "technical
// issue" ticket filed shortly afterward can attach it automatically,
// instead of asking the reporter to somehow know or find it themselves.
// Session-scoped and short-lived on purpose: an old, unrelated request ID
// attached to today's ticket would be actively misleading.
const STORAGE_KEY = 'abies:lastErrorRequestId';
const MAX_AGE_MS = 30 * 60 * 1000;

export function recordFailedRequestId(requestId: string | null): void {
  if (!requestId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: requestId, at: Date.now() }));
  } catch {
    // Private browsing / storage disabled — attaching a request id to a
    // support ticket is a nice-to-have, never worth failing the request over.
  }
}

export function recentFailedRequestId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { id, at } = JSON.parse(raw) as { id: string; at: number };
    return Date.now() - at <= MAX_AGE_MS ? id : null;
  } catch {
    return null;
  }
}
