// Liveness probe: process is up and can respond. No dependency checks here —
// that's /api/v1/health/ready. Used by docker-compose healthcheck and the
// Kubernetes livenessProbe.
export async function GET() {
  return Response.json({ status: 'ok' });
}
