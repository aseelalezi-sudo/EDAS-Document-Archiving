# EDAS — نظام الأرشفة الإلكترونية للوثائق

Electronic Document Archiving System — an Arabic-first (RTL) front-end prototype for managing,
classifying, retaining, searching, and approving organizational documents.

> **Status: prototype / demo (front-end).** Without API environment variables the React app runs
> with mocked auth and `localStorage` persistence. With them it authenticates against Keycloak and
> reads/writes documents, folders, ACLs and the trash through the NestJS + PostgreSQL API under
> `api/` (see "Connecting the SPA to the API"). Other domain areas are still mocked — see "Demo
> limitations" below.

## Tech stack

- **React 19** + **TypeScript 5** + **Vite 7**
- **Tailwind CSS v4** (RTL, light/dark)
- **React Router 7** (HashRouter)
- **Recharts** for dashboard charts, **lucide-react** icons
- **Vitest** + **Testing Library** for tests
- Hash-chunked production build (vendor split, lazy PDF/DXF viewers and routes); an optional
  single-file build via **vite-plugin-singlefile** (`npm run build:singlefile`) keeps the
  offline demo reproducible as one `dist/index.html`
- Backend (`api/`): **NestJS 11** + **Prisma** + **PostgreSQL**, **Keycloak** (OIDC) for identity,
  **MinIO** for file storage

## Backend (api/)

The API lives in `api/` with its own `package.json`. It exposes REST endpoints under `/api/v1`,
validates Keycloak-issued JWTs (RS256 via JWKS) and enforces RBAC/roles server-side. Account status is
checked on every request, so locked or deactivated users are rejected even while their JWT is still
valid (the user-provisioning path on first login is unaffected).

```bash
# one-time (from the repo root)
npm install && npm run shared:build
cd api && npm install && npx prisma generate

# run the local stack (PostgreSQL + Keycloak + MinIO + API)
docker compose up -d

# or run the API directly (requires a reachable Postgres + Keycloak)
cd api && npm run start:dev

# optional: bootstrap the organization directory (departments, sections, employees,
# projects, groups, folders, retention policies, approval chains, settings)
cd api && npx prisma migrate deploy && npm run prisma:seed

# optional: add 20 demo documents through the real upload path (MinIO/S3 presign →
# PUT → register → create), so search, libraries and reports show real data
npm run demo:seed            # from the repo root; needs the API + Keycloak + MinIO running
npm run demo:seed -- --clean # remove them again (they carry the "demo-seed" tag)

# optional: repair documents whose stored department drifted from their folder
# (dry run by default; -- --apply rewrites them and signs one audit event per document)
cd api && npm run build && npm run maintenance:reconcile-departments -- --apply
```

Key endpoints (all under `/api/v1`, `{ data }` envelope):

| Area      | Endpoints                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------- |
| Health    | `GET /health`, `GET /health/ready` (env-free)                                                        |
| Auth      | `GET /auth/config` (public), `GET /auth/me`                                                          |
| Org       | `GET /org/tree`, `GET /org/projects`, `GET /org/employees`, `POST/PATCH/DELETE /org/{departments,sections,projects,employees}` |
| Groups    | `GET/POST /groups`, `PATCH/DELETE /groups/:id` (admin writes; members replaced per update)                |
| Roles     | `GET /roles`, `PATCH/DELETE /roles/:role` (system admin writes; role capabilities override the shared defaults) |
| Users     | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `POST /users/:id/reset-password`, `POST /users/:id/revoke-sessions` (admin writes; manager/auditor read) |
| Folders   | `GET /folders/tree`, `GET/POST /folders`, `GET/PATCH/DELETE /folders/:id`, `GET/PUT /folders/:id/acl` |
| Files     | `POST /files/presign-upload`, `POST /files`, `GET /files/:id/download` (120 s ticket link; needs `EXPORT`), `GET /files/:id/content` (ticket stream) |
| Documents | `GET/POST /documents`, `GET/PATCH/DELETE /documents/:id`, `GET /documents/:id/permissions`, `POST /documents/:id/versions`, `POST /documents/:id/declare-record` |
| Approvals | `GET/POST /approval-chains`, `PATCH /approval-chains/:id`, `GET/POST /approvals`, `GET /approvals/pending`, `GET /approvals/:id`, `POST /approvals/:id/decide` |
| Retention | `GET/POST /retention/policies`, `PATCH/DELETE /retention/policies/:id`, `GET/POST /retention/items`, `PATCH /retention/items/:id`, `POST /retention/items/:id/execute` |
| Holds     | `GET/POST /legal-holds`, `GET /legal-holds/:id`, `POST /legal-holds/:id/documents`, `DELETE /legal-holds/:id/documents/:documentId`, `POST /legal-holds/:id/release` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications` |
| Notification templates | `GET/POST /notification-templates`, `PATCH/DELETE /notification-templates/:id`, `POST /notification-templates/:id/reset` (admin writes; seeded catalog) |
| Tasks     | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id`, `POST /tasks/:id/complete`                              |
| Templates | `GET /report-templates`, `PATCH /report-templates/:id/favorite`                                      |
| Reports   | `GET /reports/summary`, `GET/POST /reports/schedules`, `PATCH/DELETE /reports/schedules/:id`, `POST /reports/schedules/:id/run`, `GET/POST /reports/runs`, `GET /reports/runs/:id/download` (120 s ticket), `GET /reports/runs/:id/content` (ticket stream) |
| Searches  | `GET/POST /saved-searches`, `PATCH/DELETE /saved-searches/:id`                                       |
| Settings  | `GET /settings`, `GET/PUT /settings/:key` (admin)                                                    |
| Audit     | `GET /audit` (auditor / admin)                                                                       |

Access control is enforced server-side: role capabilities (employee → system_admin) plus department
scoping and per-folder ACL rules (`USER` / `ROLE` / `DEPARTMENT` × `VIEW|CREATE|EDIT|DELETE|APPROVE|EXPORT`).
Every mutation writes an append-only, hash-chained row to the audit log.

Dev identity provider (Keycloak) imports `infra/keycloak/realm-edas.json` with users
`admin` / `manager` / `employee` (password = username) and realm roles matching the SPA roles.
That realm is **development-only**: it holds demo passwords and a `edas-cli` client that allows the
password grant for local scripts and `npm run e2e`. The browser client (`edas-web`) has the password
grant disabled and only accepts the authorization-code flow with PKCE. Production must import its own
realm and rotate every credential; see `infra/keycloak/README.md`.

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev:all    # start PostgreSQL, Keycloak, MinIO, API, and the UI
```

`npm run dev:all` requires Docker Desktop to be running. It starts the backend stack in the
background, then serves the UI at `http://localhost:5173`. To stop the backend containers later,
run `npm run stack:down`; stop the UI with Ctrl+C.

## Connecting the SPA to the API

The SPA runs in offline prototype mode unless the `VITE_` variables below are set. Copy
`.env.example` to `.env.local`, then start the full local stack and UI with:

```bash
npm run dev:all
```

| Variable              | Example                                | Purpose                                     |
| --------------------- | -------------------------------------- | ------------------------------------------- |
| `VITE_API_URL`        | `http://localhost:4000`                | API origin (routes live under `/api/v1`)     |
| `VITE_OIDC_ISSUER`    | `http://localhost:8080/realms/edas`    | Realm used by the browser login              |
| `VITE_OIDC_CLIENT_ID` | `edas-web`                             | Public PKCE client from the realm import     |

When configured, `/login` shows a single Keycloak button that sends the browser to the API's
`/api/v1/auth/login`. The API — not the browser — runs the authorization-code + PKCE exchange
(`/api/v1/auth/callback`), keeps the OIDC tokens server-side in a `UserSession` row and hands the
SPA an opaque **httpOnly session cookie** (`edas_session`) plus a readable CSRF cookie (`edas_csrf`)
that mutating requests must echo in the `x-csrf-token` header. The SPA never stores tokens, hydrates
`/auth/me` on boot and calls `/api/v1/auth/logout` (which ends the Keycloak session) on sign-out;
`src/lib/role-bridge.ts` maps API roles and ACL actions onto the UI role / `PermAction` model.

The API side of this flow needs `APP_BASE_URL` (the SPA origin it redirects back to) and, in
production, a stable `SESSION_SECRET` (32+ characters) that seals the stored tokens — set the same
value on every replica. Register the deployment redirect URI (`<API>/api/v1/auth/callback`) in
Keycloak. See `api/.env.example` for `SESSION_TTL_SECONDS`, `SESSION_COOKIE_SECURE` and
`SESSION_COOKIE_SAMESITE`.

Domain data: in API mode the document store (`src/store-docs.tsx`) hydrates folders, ACLs,
documents, the trash, retention items, legal holds, workflow tasks, notifications, the audit trail,
the organization directory (departments, sections, projects, employees, users), groups, retention policies,
approval chains and system settings from `/api/v1`, then writes through on create/upload, new
versions, move/archive, checkout/checkin, delete/restore/purge, signatures, record declarations, ACL
edits, retention policy creation/toggling/deletion, retention extensions/disposal, legal-hold
placement/release, approval-chain creation/rename/activation and step edits (while no instance is
pending), organization directory create/edit/delete (departments, sections, projects, employees), group create/edit/delete with membership,
task completion/reassignment, notification read state, saved searches and settings edits. User
accounts created, edited, locked/unlocked, reactivated, deleted and password-reset from the admin
page are mirrored into Keycloak through its Admin API (roles, enabled flag, credentials, required
actions such as forced password change and two-factor enrolment, session logout), with the database
row updated afterwards and the action audited
(`src/lib/docs-api.ts`, `src/lib/domain-api.ts`, `src/lib/api-mappers.ts`). Report
schedules and their run history live in `/reports/schedules` and `/reports/runs`; running a schedule
now generates an export of the documents in the caller's scope into object storage — CSV for `csv`,
Excel SpreadsheetML (`.xls`) for `excel`, and a right-to-left PDF (embedded Amiri font + bidi/shaping
via `pdfkit` and `bidi-shaper`) for `pdf` — marks the run
`completed` and exposes it through `/reports/runs/:id/download`.
The schedule page writes through in API mode, and the report catalog/detail pages trigger manual runs that download the generated file (the catalog's "Recently run" list shows the latest actual runs); both fall back to the local demo otherwise.
The detail page header shows live figures from `/reports/summary` (documents, archived, pending approvals, monthly growth) in API mode. Report
templates live in the `report_templates` table (seeded on first API start) and their favorites persist
through `PATCH /report-templates/:id/favorite`. Database schema changes ship as Prisma migrations under
`api/prisma/migrations`; `docker compose` applies them with `prisma migrate deploy` on startup, and locally
run `cd api && npx prisma migrate deploy` (or `npm run prisma:migrate` while developing). A database created earlier with `db push` should be baselined once: `npx prisma migrate resolve --applied 20261022000000_init`. The API validates required environment variables and rejects wildcard CORS origins when `NODE_ENV=production`.

## File previews

The preview page (`/documents/:id/preview`, `src/pages/documents-preview.tsx`) streams the stored
original or a converted copy from `/api/v1/preview/files/:id/content` through the API, so MinIO stays
private and no bucket policy is needed. Previewing requires `VIEW` on a linked document; downloading
the original (`/files/:id/download`) additionally requires `EXPORT` (the UI's `download` permission),
so a view-only grant cannot fetch the file even though it can see it on screen. Successful preview
opens/streams and refused accesses are appended to the audit chain once per actor, file and kind per
five-minute window (range requests would otherwise serialise the hash-chained ledger). Responses use
`Content-Disposition: inline`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
PDFs render with `pdfjs-dist` (including `Range`/`206` and `416` responses), DXF and converted DWG
files with `dxf-viewer`, images through revocable object URLs that are aborted on close, and
CSV/TXT/JSON/XML through a `text/plain` iframe. SVG content is rejected as a type mismatch even when
it is renamed, because it can run script when opened directly.

Downloads never expose MinIO either: `/files/:id/download` returns a 120-second ticket URL at
`/files/:id/content?ticket=…` instead of a presigned storage link. Opening that URL needs no bearer
header (so a normal browser download works), but the endpoint re-checks access and the `EXPORT`
grant at delivery time and audits the first delivery, so a revoked grant cannot keep using an older
link. Originals are streamed as `Content-Disposition: attachment` with `no-store` and `nosniff`
(unknown or unsafe content is served as `application/octet-stream`); `Range` and `416` behave as in
the preview endpoint. Set `API_PUBLIC_URL` to pin the absolute origin used in the returned link;
otherwise the request `Host` (and `X-Forwarded-Proto` behind a proxy) is used. Report exports use the
same ticketing: `/reports/runs/:id/download` keeps its department check at issuance and repeats it
when `/reports/runs/:id/content` is opened, so generated reports never appear as MinIO links either.
Tickets are AES-256-GCM sealed and stateless, so no Redis or database rows are involved: set
`DOWNLOAD_TICKET_SECRET` (32+ characters) to the same value on every API instance and links keep
working across restarts and replicas. Without it they are valid only inside the issuing process.

| Detected content                                     | Preview             | Cache key                             |
| ---------------------------------------------------- | ------------------- | ------------------------------------- |
| PDF, PNG/JPEG/GIF/WebP/BMP/TIFF/SVG, DXF, plain text | original            | —                                     |
| DOCX/XLSX/PPTX, DOC/XLS/PPT, ODT/ODS/ODP              | LibreOffice to PDF  | `previews/<fileId>/<sha256>.pdf`      |
| DWG (`AC10xx`)                                       | ODA to DXF          | `previews/<fileId>/<sha256>.dxf`      |

The content type is detected from magic bytes, so a renamed file is rejected instead of trusted.
Office/DWG conversions run outside the request path through an in-memory queue with a concurrency
limit, timeout, source/output size caps, isolated temp directories that are always removed and a
minimal environment that keeps database, Keycloak and MinIO secrets away from the converter process;
the page polls the preview status until the cached copy is ready. Jobs live in one API process: run a
single API replica or move the queue to Redis/BullMQ when scaling out. Cached previews are removed
when the file is purged, and an administrator can remove stale ones with
`POST /api/v1/preview/cache/cleanup` (`{ "olderThanDays": 30 }`). `GET /api/v1/preview/capabilities`
reports which converters were detected.

| Variable                    | Default    | Purpose                                     |
| --------------------------- | ---------- | ------------------------------------------- |
| `PREVIEW_SOFFICE_PATH`      | auto-detect | LibreOffice `soffice` executable           |
| `PREVIEW_ODA_PATH`          | auto-detect | ODA `ODAFileConverter` executable          |
| `PREVIEW_MAX_SOURCE_BYTES`  | 50 MiB     | Larger sources are download-only           |
| `PREVIEW_MAX_OUTPUT_BYTES`  | 200 MiB    | Converted output limit                     |
| `PREVIEW_TIMEOUT_MS`        | 120000     | Per-conversion timeout                     |
| `PREVIEW_CONCURRENCY`       | 2          | Parallel conversions per API process       |
| `PREVIEW_CACHE_SCAN_LIMIT`  | 5000       | Objects scanned by the cleanup endpoint    |

Ubuntu/Debian: `apt-get install libreoffice-writer libreoffice-calc libreoffice-impress
fonts-noto-core fonts-noto-ui-core`, then set `PREVIEW_SOFFICE_PATH=/usr/bin/soffice` (or leave it
unset for auto-detection). Install the ODA File Converter separately and set `PREVIEW_ODA_PATH`;
DWG previews stay disabled with a clear message until the converter is present. The bundled API
image is Debian-based (`node:22-bookworm-slim`) and already ships LibreOffice plus Arabic fonts;
only the ODA File Converter has to be added for DWG. ODA is glibc-only, so it runs on Debian/Ubuntu
but not on Alpine.

## Scripts

| Script                   | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `npm run dev`            | Vite dev server                                        |
| `npm run build`          | Type-check (`tsc --noEmit`) then production build      |
| `npm run preview`        | Serve the production build locally                     |
| `npm run typecheck`      | TypeScript check only                                  |
| `npm run lint`           | ESLint                                                 |
| `npm run test`           | Run the Vitest suite once                              |
| `npm run test:watch`     | Vitest in watch mode                                   |
| `npm run format`         | Prettier write (`src/**/*.{ts,tsx,css}` + `packages/**/*.ts`) |
| `npm run format:check`   | Prettier check                                         |
| `npm run build`          | Type-check + chunked production bundle in `dist/`      |
| `npm run build:singlefile` | Same bundle inlined into a single `dist/index.html` (offline demo) |
| `npm run shared:build`   | Compile `packages/shared` to `dist/` (used by the API) |
| `npm run api:install`    | Install the `api/` package and link `@edas/shared`     |
| `npm run api:typecheck`  | Build shared + type-check the API                      |
| `npm run api:lint`       | Lint the API                                           |
| `npm run api:test`       | Build shared + run the API unit tests                  |
| `npm run api:build`      | Build shared + bundle the API (`api/dist/main.js`)     |
| `npm run api:dev`        | Build shared + run the API in watch mode               |
| `npm run e2e`            | End-to-end API suite (Docker: Postgres + Keycloak + S3 mock) |
| `npm run demo:seed`      | Create/remove 20 demo documents via the real upload path (`-- --clean`) |

> Before committing, run: `npm run typecheck && npm run lint && npm run format:check && npm run check:secrets && npm test && npm run build` (plus `npm run api:typecheck && npm run api:lint && npm run api:test && npm run api:build` for backend changes). CI runs the same gates in `.github/workflows/ci.yml`.

## Observability

The API writes **one JSON object per line** to stdout/stderr (`api/src/common/logging/json.logger.ts`), so a log
shipper or `docker logs` consumer can parse it without regexes:

```json
{"time":"2026-11-10T09:12:44.318Z","level":"log","message":"GET /api/v1/documents 200 41.7ms","context":"HTTP","correlationId":"3f0c…","userId":"9d1e…","method":"GET","route":"/documents"}
```

- `LOG_LEVEL` (`error|warn|log|debug|verbose`, default `log`) filters the stream; an unknown value fails the boot
  validation instead of being silently ignored.
- Every request carries a correlation id (`x-correlation-id`, reused when the caller sends one, otherwise generated);
  it is returned in the response header and in the `{ error, correlationId }` envelope, and it is attached to every log
  line emitted inside that request — including service warnings, preview conversion failures and 5xx stacks.
- Access lines record method, path, status and duration; 5xx log at `error`, 4xx at `warn`, successful requests at
  `log`, and health probes at `debug` so liveness/readiness polling does not flood the stream.
- Probes: `GET /api/v1/health` (liveness, returns uptime) and `GET /api/v1/health/ready` (executes `SELECT 1` and returns
  503 when the database is unreachable). `docker-compose.yml` wires the container healthcheck to the former.
- **What does not exist yet**: no metrics endpoint (Prometheus/OpenTelemetry), no tracing, no APM integration, no log
  aggregation or alerting, and no `pm2`/cluster manager — restarts are left to the container runtime
  (`restart: unless-stopped`). Structured logs plus the two probes are the whole observability surface, and any claim
  beyond that would be aspirational.

## Secrets

No credential belongs in this repository. The local AI-provider catalogue (`opencode.json`) is gitignored and never
published; register its API key once with `opencode auth login`, which stores it in the global auth file outside the
working tree. Server-side secrets come from the environment: `api/.env` (gitignored, see `api/.env.example`) for
`DATABASE_URL`, Keycloak and S3 settings, and `KEYCLOAK_ADMIN_PASSWORD` for the user-administration flows. Rotate any
key that has ever been committed or shared before reusing it. The internal audit report (`AUDIT.md`) is gitignored as
well, so a push never publishes the security review.

`.env` and `api/.env` exist locally with the compose development credentials (database `edas_dev_pw`, MinIO
`edas_minio_dev_pw`) and freshly generated 48-character `SESSION_SECRET` values. They are ignored by git
(`git check-ignore -v .env api/.env`), and `npm run check:secrets` fails the build when an environment file other than
`.env.example` is tracked, when a private key is present, or when a sealing secret is hardcoded in source. CI runs it.

## Project structure

```
api/            NestJS backend (own package.json, Prisma schema, Dockerfile)
packages/shared/ shared contracts (roles, permission matrix, API DTOs) — single source of truth
infra/keycloak/ Keycloak realm import (edas realm)
docker-compose.yml  local stack: PostgreSQL + Keycloak + MinIO + API
src/
  components/   shared UI (ui.tsx, shared.tsx, Layout, navigation, assistant, …)
  pages/        one file per route; large pages have co-located *-parts.tsx files
  lib/          pure logic (permissions engine, validation)
  utils/        persistence, ids
  store.tsx     app session/theme/lang/toasts (React context)
  store-docs.tsx  domain state (documents, folders, ACLs, tasks, …)
  data.ts       mock seed data
  i18n.ts       ar/en translation dictionaries
  types.ts      domain types
```

Route definitions live in `src/App.tsx`; navigation and role-based access live in
`src/components/nav-config.ts`.

## Demo limitations

- **Prototype auth by default:** without the `VITE_` variables, any username/password logs in as a
  demo user and the password is not verified (`src/pages/auth-login.tsx`). With them set,
  authentication goes through Keycloak (authorization code + PKCE).
- **API wiring is partial:** authentication, documents, folders, ACLs, versions, uploads, trash,
  retention items, legal holds, workflow tasks, notifications, audit trail, saved searches, the
  organization directory (read/write), retention policies, approval chains (steps editable while no
  instance is pending), system settings, dashboard KPI figures (`/reports/summary`) and report
  schedules/runs and the report template catalog go through the API in API mode; a few dashboard
  deltas and the role/permission demo pages still use local demo data (`src/data.ts`, `edas.v1.`
  `localStorage` keys via `src/utils/persist.ts`).
- **Client-side access control** is illustrative only, not a security boundary (the API enforces it
  server-side).
- Placeholder metrics/figures are hard-coded.

## Accessibility & i18n

The UI is RTL by default (`<html dir="rtl" lang="ar">`) and switches to LTR/English through the
language toggle. Translations live in `src/i18n.ts`; `ar` and `en` dictionaries must stay in sync.
