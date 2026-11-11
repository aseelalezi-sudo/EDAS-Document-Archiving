# AGENTS.md

Guidance for AI coding agents working in this repository.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Type-check: `npm run typecheck`
- Lint: `npm run lint`
- Format check / write: `npm run format:check` / `npm run format`
- Tests: `npm test` (watch: `npm run test:watch`; coverage: `npm run test:coverage`); API tests: `npm run api:test` (coverage gate: `npm run api:test:coverage`)
- Browser smoke test: `npm run test:browser` (Playwright; needs `npx playwright install chromium` once)
- Build (type-check + bundle): `npm run build`

Always verify changes with:
`npm run typecheck && npm run lint && npm run format:check && npm run check:secrets && npm test && npm audit --audit-level=high && npm run build`

### Backend (`api/` — separate package)

- Install: `cd api && npm install` then `npx prisma generate`.
- Type-check / build / lint / test: `npm run typecheck` · `npm run build` · `npm run lint` · `npm test` (run inside `api/`).
- The API imports `@edas/shared` (`packages/shared/`), consumed by name. Build it first with
  `npm run shared:build` (the root `api:*` scripts do this automatically); the API links it via
  `file:../packages/shared`, so re-run `npm run api:install` after changing its `package.json`.
- Dev API: `cd api && npm run start:dev` (needs Postgres + Keycloak).
- Local stack: `docker compose up -d` (PostgreSQL + Keycloak + MinIO + API) from the repo root.
  `POSTGRES_PORT` moves the database host port, `MINIO_IMAGE` / `AWS_CLI_IMAGE` override the storage
  images (defaults: `bitnamilegacy/minio:latest`, `amazon/aws-cli:latest`; upstream `minio/minio` is no
  longer pullable). The API service signs browser-facing S3 URLs with `MINIO_PUBLIC_ENDPOINT`
  (`localhost:9000` in compose) while talking to MinIO internally, so presigned uploads/downloads stay
  reachable; rebuild the API image (`docker compose build api`) after changing `api/src`.
  `scripts/s3mock.cjs` remains the in-memory S3 stand-in used by `npm run e2e`.
- Apply migrations with `cd api && npx prisma migrate deploy`; create them with `npm run prisma:migrate` (do not use `db push`).
- Bootstrap the organization data (departments, sections, employees, projects, groups, folders, retention
  policies, approval chains, system settings) with `cd api && npm run prisma:seed`. The seed is idempotent
  (upserts by code/name), leaves documents untouched, and runs `api/prisma/seed.mts` through Node's native
  TypeScript support (Node 22.18+).
- Verify backend changes with: `cd api && npm run typecheck && npm run lint && npm test && npm audit --audit-level=high && npm run build`.
  Coverage is enforced by `api/vitest.config.ts` (thresholds 75 statements / 71 branches / 64 functions / 76 lines);
  run it with `cd api && npm run test:coverage` (the root `npm run api:test:coverage` builds `@edas/shared` first).
  The SPA gate lives in the root `vitest.config.ts` (36 / 29 / 31 / 37).
- Repair documents whose stored `departmentId` drifted from their folder with
  `cd api && npm run build && npm run maintenance:reconcile-departments` (dry run; `-- --apply` writes the
  fix and signs a `document.reconcile_department` audit event per document inside the same transaction).

## Conventions

- TypeScript + React function components; no `any` for new code (legacy files contain `any`).
- Prettier: `printWidth: 140`. Run `npm run format` after editing.
- Do **not** add code comments unless asked.
- UI text: prefer keys from `src/i18n.ts`; keep `ar` and `en` dictionaries in sync.
  Some files use an inline `L(ar, en)` helper — keep both languages.
- The app is RTL by default; use logical Tailwind utilities (`ps-`, `me-`, `rtl:`).
- Accessibility: `eslint-plugin-jsx-a11y` (recommended) is enabled. Prefer real
  interactive elements (`button`, `label`) over clickable `div`s; backdrop/overlay
  `div`s that only close on click must set `aria-hidden="true"`.
- Reuse primitives from `src/components/ui.tsx` and `src/components/shared.tsx`
  (`Button`, `Card`, `Modal`, `EmptyState`, `DataTable`, `PageHeader`, …).
- Large pages are split into `*-parts.tsx` files; barrels (`src/pages/documents.tsx`, etc.)
  re-export pages. Keep the public route surface in `src/App.tsx` unchanged unless intended.
- Roles and the permission matrix are the single source of truth in `packages/shared`
  (`ROLE_CAPABILITIES`, `isGlobalRole`, `USER_ROLES`). Import `@edas/shared` (Vite/Vitest and the root
  tsconfig alias it to `packages/shared/index.ts`; the API resolves the built `dist/`). Do not
  re-declare the matrix in the API or the SPA.

## Repo notes

- Front-end prototype + a NestJS/Prisma API under `api/`. The SPA is **partially wired**: when
  `VITE_API_URL` / `VITE_OIDC_ISSUER` / `VITE_OIDC_CLIENT_ID` are set, login runs through the API's
  server-side OIDC flow (`/auth/login` → Keycloak → `/auth/callback`), which keeps the tokens in a
  `UserSession` row and hands the SPA an httpOnly session cookie (plus a CSRF cookie); the profile
  comes from `/auth/me` (`src/lib/session.ts`, `src/lib/role-bridge.ts`). Bearer tokens are still
  accepted for scripts and `e2e`. Folders, ACLs,
  documents, versions, uploads, the trash, retention items, legal holds, workflow tasks,
  notifications, the audit trail, saved searches, the organization directory, groups, user accounts,
  retention policies, approval chains, dashboard summary figures/trends, system settings and report
  schedules/runs write through to the API (`src/lib/docs-api.ts`, `src/lib/domain-api.ts`,
  `src/lib/api-mappers.ts`, `src/store-docs.tsx`). User create/edit/lock/delete/reset flows also
  call the Keycloak Admin API (`api/src/modules/users/keycloak-admin.service.ts`; configure
  `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`, defaults to `admin` / `admin`). The report template
  catalog is seeded by the API (`report-templates`); other demo
  state persists to `localStorage` (`edas.v1.` prefix). Approval-chain steps are editable while no instance is pending. Without
  those variables the app runs in the offline prototype mode.
- Backend decisions: NestJS + Prisma + PostgreSQL, Keycloak (OIDC/JWT via JWKS) for identity,
  MinIO for file storage. API routes are under `/api/v1`; responses use a `{ data }` envelope and
  errors `{ error: { code, message, details }, correlationId }`.
- API modules: `auth`, `users`, `org`, `groups`, `folders` (+ACL), `files` (presigned S3), `documents`,
  `preview` (PDF/image/text/DXF inline; Office via LibreOffice, shipped in the API image, and DWG
  via the optional ODA File Converter; cached per file+checksum under
  `previews/`, prewarmed in the background when a document is created or a version is added,
  disable with `PREVIEW_PREWARM=off`),
  `approvals` (chains / instances / decisions), `retention` (policies / items), `legal-holds`,
`notifications`, `notification-templates` (seeded catalog, admin CRUD/reset), `tasks`, `reports` (schedules / runs / summary; runs export CSV, Excel (SpreadsheetML) or an RTL PDF (`pdfkit` + `bidi-shaper`, Amiri font under `api/assets`) to object storage and
serve `/reports/runs/:id/download`), `report-templates`, `roles` (per-role capability overrides stored in `RolePolicy`; `/roles` GET for admin/manager/auditor, PATCH/DELETE for system admin), `saved-searches`, `settings`, `audit` (hash-chained), `metrics` (Prometheus text at `/api/v1/metrics`; `METRICS_TOKEN` required to expose it in production). Mutating
endpoints must write an audit event.
- Root ESLint/tsconfig exclude `api/`; the API has its own `eslint.config.mjs` and `tsconfig.json`.
- Prometheus scrape config and alert rules live in `infra/monitoring/` (no extra compose service);
  validate edits with `promtool check config` / `check rules` before committing.
- No git history baseline yet; make small, focused changes.
- Node tooling note: `eslint-plugin-jsx-a11y` declares a peer range up to ESLint 9 while
  the repo uses ESLint 10, so dependency installs may need `--legacy-peer-deps`. When
  doing so, keep `@testing-library/dom` pinned (it is a peer dep that npm drops in that mode).

## Testing

- Tests live next to sources as `*.test.ts(x)`.
- Page tests wrap with `MemoryRouter + AppProvider + DocsProvider` and clear `localStorage`
  in `beforeEach`; shared mocks are in `src/test/setup.ts`.
- API unit tests live under `api/src/**/*.test.ts` (`npm run api:test`).
- The end-to-end suite is `scripts/e2e.ps1` (`npm run e2e`); it needs Docker, applies Prisma
  migrations to a throwaway Postgres, starts Keycloak from `infra/keycloak`, uses `scripts/s3mock.cjs`
  for S3, and boots the built API on port 4210.
- The browser smoke test is `e2e/browser/*.spec.ts` (`npm run test:browser`). Playwright builds the
  SPA with empty `VITE_` variables, serves the bundle on port 4173 and drives Chromium through the
  offline demo: sign-in, dashboard, documents list, a document page and the preview route, plus the
  language toggle. The same test runs in CI.