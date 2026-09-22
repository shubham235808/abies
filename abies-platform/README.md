# Abies platform

A working Next.js + Express modular application for Ayurveda care, backed by PostgreSQL and Redis. **Helm is the primary Kubernetes deployment approach.** See [SERVER.md](SERVER.md) for the complete on-server installation and GitOps workflow. The patient portal uses the supplied Abies logo and exact brand tokens: purple `#931A75`, pink `#E6007E`, cyan `#0088CE`, orange `#F26A21`.

This is an executable foundation with enterprise-oriented controls, not a certified production healthcare system. Products, prices, practitioners and lab packages are sample data. Booking and ordering persist real application records; video rooms and payments are explicitly demonstrations. No real consultation, shipment, payment or laboratory integration occurs.

## Project layout

```text
abies-platform/
├── frontend/              Next.js App Router, Tailwind v4, responsive patient/clinician UI
├── backend/app/           Express API, authentication, validation, migrations, provisioning
├── backend/tests/         Unit and real PostgreSQL/Redis integration tests
├── db/001_init.sql        Idempotent schema and sample catalog
├── charts/abies/          Helm chart: application, databases, storage, ingress and policies
├── charts/git-source/     Helm chart: private read-only local Git source
├── environments/server/  Server-specific Helm values
├── apps/argocd/           ArgoCD project and Helm Application
├── scripts/               Secret bootstrap and browser smoke test
├── compose.yaml           Complete local application
└── compose.test.yaml      Isolated disposable test databases
```

## Run locally with Docker Compose

Requires Docker Engine with Compose v2. Run from `abies-platform/`:

```bash
cp .env.example .env
# Replace both passwords with long random HEX values, e.g. openssl rand -hex 32.
# Keep APP_ORIGIN=http://localhost:3000 and COOKIE_SECURE=false for local HTTP.
docker compose up --build -d
docker compose ps
docker compose logs -f backend frontend
```

Open **http://localhost:3000**. Register an account with a password of at least 12 characters. PostgreSQL and Redis are internal to the Compose network; only the web port is published, bound to localhost. Migrations run before the API starts. Credentials are interpolated into URLs, so use hexadecimal passwords or URL-encode any special characters.

To stop without deleting records: `docker compose down`. Database and Redis volumes persist. Do not use `down -v` unless you intend to delete local records and sessions.

### Try the complete workflows

1. **Doctor consultation:** choose a practitioner, video or clinic, a date and an available time. Confirm, inspect My appointments, enter the clearly labeled demo video room, or cancel an upcoming visit.
2. **Medicine store:** search the catalog, add products, change quantities, sign in and provide a delivery address. Place a demo order and view its details in Prescriptions & orders. Prices and availability are checked on the server.
3. **Panchkarma:** choose a therapy, practitioner and clinic appointment.
4. **Diagnostic tests:** choose a sample test package and either clinic collection or a home visit with a full address.
5. **Physiotherapy:** choose a practitioner and clinic or home assessment.
6. **Prescription management:** upload a PDF, PNG or JPEG (maximum 5 MB), download it from your private records and attach it at checkout. Prescription-only products remain `demo_awaiting_prescription_review` and cannot be fulfilled by this application.

Times are explicitly **UTC**, in hourly slots from 09:00 through 16:00, within the next 60 days. The longest service is 60 minutes, so one practitioner cannot have overlapping appointments. This is a simple shared schedule; practitioner working calendars, holidays and local-time configuration are future extensions.

### Clinician provisioning

Create the clinician's account through the UI first. An operator then assigns an existing sample practitioner (e.g. `ananya`, `arjun`, `meera`, `rohan`):

```bash
docker compose exec backend node app/clinician.js clinician@example.com ananya
```

Sign out and back in. The clinician workspace lists only the assigned practitioner's appointments and allows issuing text prescriptions to those patients. Patients cannot grant themselves clinician access. Provisioning refuses to overwrite another clinician's assignment. These sample identities must be replaced and credentials verified before real clinical use.

## Native development and tests

Requires Node.js 24 LTS, PostgreSQL 17+ and Redis 7+. Install dependencies:

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

Set `DATABASE_URL`, `REDIS_URL`, `APP_ORIGIN=http://localhost:3000` and `COOKIE_SECURE=false` in your shell. Create the database referenced by `DATABASE_URL` first. Then:

```bash
npm run migrate --prefix backend
npm run dev --prefix backend
# In another terminal:
npm run dev --prefix frontend
```

Next.js proxies `/api/*` to `API_INTERNAL_URL` at **runtime**, defaulting to `http://localhost:8000` during native development. Compose sets it to `http://backend:8000`; Helm sets the release-specific backend service DNS. One frontend image works across environments without rebuilding its API URL.

```bash
npm run build --prefix frontend
npm run typecheck --prefix frontend
npm test --prefix backend
```

Without test environment variables, `npm test` runs unit checks and explicitly skips the integration suite. Run all tests with isolated test databases:

```bash
docker compose -f compose.test.yaml up -d
# Wait until pg_isready succeeds:
docker compose -f compose.test.yaml exec postgres pg_isready -U abies -d abies_test
TEST_DATABASE_URL=postgresql://abies:test-only-password@127.0.0.1:55432/abies_test \
TEST_REDIS_URL=redis://127.0.0.1:56379/15 npm test --prefix backend
docker compose -f compose.test.yaml down
```

The integration suite **truncates the `abies_test` database and flushes Redis database 15**. It refuses a differently named database or Redis database number. Never point it at shared infrastructure. It tests authentication, CSRF origin checks, ownership, simultaneous slot reservations, every booking category, prescription permissions, transactional checkout, retries, stock contention and cancellation.

A browser smoke test is included at `scripts/browser-smoke.mjs`. With the application running:

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

It creates a unique sample patient and exercises registration, booking, video-room preview, medicine search, checkout, cancellation, and mobile layout. Screenshots are saved under `test-results/`. On minimal Linux installations Playwright may require its documented system libraries.

## Install on this server with Helm and ArgoCD

Run the privileged host bootstrap in your server terminal, then the unprivileged deployment:

```bash
cd /home/devops/abies.com/abies-platform
sudo bash scripts/bootstrap-server.sh
bash scripts/deploy-server.sh
```

The bootstrap installs Docker for image builds, a loopback-only persistent registry, K3s (including containerd, Traefik and local-path storage), and Helm. It writes a private kubeconfig to `.runtime/kubeconfig`. The deployment builds all images on this server, publishes them to the local registry, creates stable secrets/TLS, installs the local Git-source chart and the official ArgoCD Helm chart, then lets ArgoCD render and reconcile `charts/abies`.

Defaults: **https://192.168.1.160** for Abies and **https://192.168.1.160:30443** for ArgoCD. The bootstrap TLS certificate is locally generated; trust `.runtime/tls.crt` on your workstation or replace the TLS secret with a trusted certificate. ArgoCD has its own initial certificate. Its admin password is stored in `.runtime/argocd-admin-password` with mode 600 after deployment.

For a hostname, use `ABIES_HOST=your-hostname bash scripts/deploy-server.sh` before first deployment and point its DNS at this server. See [SERVER.md](SERVER.md) for changing certificates and hostnames afterward, backups, chart values, diagnostics and updates.

```bash
bash scripts/server-status.sh
npm run test:helm
ABIES_BASE_URL=https://192.168.1.160 ABIES_ALLOW_SELF_SIGNED=true npm run test:browser
```

**Live status:** deployed on this server; ArgoCD reports **Synced/Healthy**, all six application pods are Ready, and live HTTPS browser tests pass. See [VALIDATION.md](VALIDATION.md).

### Local GitOps updates

The server maintains a dedicated bare repository under `.runtime/git/abies.git`, separate from your working repository. A read-only Git service exposes it only to ArgoCD's repo-server through a Kubernetes NetworkPolicy. No source is pushed to GitHub by these scripts.

- Application/code changes: run `bash scripts/deploy-server.sh` to rebuild content-addressed images, update Helm image tags, publish a local snapshot and wait for reconciliation.
- Chart/values-only changes: run `bash scripts/publish-local.sh`; ArgoCD discovers the new revision. To request an immediate refresh, run `kubectl -n argocd annotate application abies-platform argocd.argoproj.io/refresh=hard --overwrite` with the supplied kubeconfig.
- ArgoCD owns Abies resources. Do not run `helm upgrade` directly against the same application while ArgoCD manages it. Helm itself owns the infrastructure releases `argocd` and `abies-git`.

The old `apps/base` manifests are retained only as a legacy reference; the active ArgoCD Application targets `charts/abies` and server Helm values.

### Runtime controls

The application has two web/API replicas, resource limits, probes, non-root containers, private sessions and prescriptions, transactional stock/booking checks, and network policies. Secrets stay outside Git and chart values. PVCs are retained on Helm uninstall and excluded from ArgoCD pruning. PostgreSQL and Redis have one replica each on K3s local-path storage; this is a **single-server deployment**, not HA. Keep encrypted off-server backups and test recovery before using real data.

Read [backend/API.md](backend/API.md) for the API contract and the following production scope for clinical/commerce integrations still required.

## Production scope still to complete

Before handling real patients or commerce: replace sample catalog/identities with verified records; add email verification, account recovery and MFA/SSO as appropriate; consent and retention/deletion flows; clinical validation and prescribing policies; pharmacist review and fulfillment; real payment provider with signed idempotent webhooks; video provider and access-controlled meeting credentials; diagnostic partner integration; address/service coverage and scheduling calendars; upload malware scanning and storage quotas; observability/alerts, backup validation, load testing, accessibility review and independent security review. File signature validation is not malware scanning. This implementation does not make compliance or medical-safety claims.

## Design and deployment references

The container strategy follows [Next.js standalone deployment](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). GitOps configuration follows [ArgoCD Application specification](https://argo-cd.readthedocs.io/en/stable/user-guide/application-specification/) and [automated sync policy](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).
