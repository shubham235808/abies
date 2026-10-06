# Database service — plan

Status: proposal. Nothing is built. Decisions in section 4 are needed before any code.

## 1. Goal

One internal service owns the database. The four apps (`client-web`, `partner-web`, `management-web`, `platform-api`) stop connecting to Postgres directly and call that service instead.

## 2. Current state

- One Postgres database (`abies_ayurveda`) per environment.
- One Prisma client (`packages/domain/src/lib/db.ts`), used by every app through `@abies/domain`.
- Services call Prisma directly across about 25 domain modules.
- Schema and migrations live in `packages/domain/prisma`, run by an ArgoCD PreSync Job.

## 3. Proposed design

### 3.1 Shape of the API
Domain-specific endpoints per module, for example `POST /db/v1/crm/leads`, `GET /db/v1/crm/leads/:id`. Each endpoint has a fixed input and output schema and runs one service function.

Not a generic "run any Prisma query" endpoint. That would let any caller read or write any table, and it would bypass the access rules in each module.

### 3.2 Who calls it
Each app gets its own Kubernetes ServiceAccount. The database service accepts a call only from an allowed ServiceAccount, with its token verified by the Kubernetes API. A NetworkPolicy allows only the four app namespaces and pods to reach it.

### 3.3 Access rules
The database service keeps the existing module rules (RBAC, CRM scope, consent, audit). The calling app passes the end user's session identity, and the database service checks it again. The apps are not trusted to pass a role unchecked.

### 3.4 Migrations and schema
The database service owns the schema. Migrations run from its image in the existing PreSync pattern. Apps no longer ship `prisma` or the schema.

### 3.5 Transactions
Each endpoint runs one service function, so a transaction stays inside one call. Operations that span modules need a single endpoint that does the whole change, not two calls from the app.

### 3.6 Rollout (strangler)
1. Build the service and its auth, with a health endpoint and a metrics endpoint.
2. Move CRM first (new code, nothing else depends on it yet).
3. Move one existing module at a time, behind a flag, keeping direct access as a fallback until each module has been verified in dev.
4. Remove direct database access from the apps once every module has moved. Keep the fallback flag until then.

### 3.7 Operations
- Separate Deployment and Service in `abies-dev`, with resource limits, readiness and liveness probes.
- Same Postgres. Connection pool owned by the database service, so the apps no longer hold connections.
- Observability: request IDs passed through, one log line per call, and an error rate per endpoint.

## 4. Decisions needed

**DB-1 — API style.** Recommended: domain-specific endpoints (section 3.1). Alternative: a generic query endpoint. I'd reject the generic one.

**DB-2 — Service authentication.** Recommended: Kubernetes ServiceAccount tokens plus a NetworkPolicy. Alternative: a shared secret per app, stored in Kubernetes secrets.

**DB-3 — Rollout.** Recommended: strangler (section 3.6). Alternative: move everything at once. That's a larger, riskier change.

**DB-4 — Scope now.** Recommended: build the service and move CRM only in the first release. The existing modules move later, one at a time.

**DB-5 — Ownership.** Who owns the database service's code and on-call: the same team as the apps, or a separate platform owner?

## 5. Risks

- Every database call gets an extra network hop and serialisation. Measure latency on the dashboard endpoints before moving them.
- A shared database service becomes a single point of failure. Run at least two replicas once it's live.
- Moving 25 modules is a multi-week effort. Keep the fallback until each module has been verified.
- Partial moves can leave two code paths for one module. Track each module's status in a table.
