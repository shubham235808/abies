export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(request: Request) {
  const incoming = new URL(request.url);
  const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
  const target = new URL(incoming.pathname + incoming.search, base);
  const headers = new Headers();
  for (const key of ["accept", "content-type", "cookie", "origin"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const options: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      options.body = request.body;
      options.duplex = "half";
    }
    const upstream = await fetch(target, options);
    const responseHeaders = new Headers(upstream.headers);
    for (const key of [
      "connection",
      "transfer-encoding",
      "content-encoding",
      "content-length",
    ]) {
      responseHeaders.delete(key);
    }
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "Service temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as HEAD,
};
