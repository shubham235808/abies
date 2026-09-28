// Thin fetch wrapper for client components calling our own route handlers.
// Cookies are same-origin, so the browser attaches the session cookie
// automatically — nothing to pass explicitly. Throws ApiError with the
// server's message so callers can show it directly in a form.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? 'Request failed', res.status, body.issues);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) =>
    fetch(path, { method: 'POST', body: formData }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(body.error ?? 'Request failed', res.status, body.issues);
      return body as T;
    }),
  patchForm: <T>(path: string, formData: FormData) =>
    fetch(path, { method: 'PATCH', body: formData }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(body.error ?? 'Request failed', res.status, body.issues);
      return body as T;
    }),
};
