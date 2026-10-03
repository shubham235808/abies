// Liveness probe: process is up and can respond. No dependency checks here —
// that's /api/ready. Used by docker-compose healthcheck and the eventual
// load balancer.
export async function GET() {
  return Response.json({ status: 'ok' });
}
