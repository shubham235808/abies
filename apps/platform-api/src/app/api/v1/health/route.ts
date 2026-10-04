// General diagnostic status — distinct from the strict live/ready
// semantics at health/live and health/ready (docs/platform/CONTRACT.md
// §15): not meant for a Kubernetes probe to gate traffic on, just a
// human/dashboard-facing "what is this instance" check. No dependency
// checks here on purpose — that's what /api/v1/health/ready is for.
export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'platform-api',
    timestamp: new Date().toISOString(),
  });
}
