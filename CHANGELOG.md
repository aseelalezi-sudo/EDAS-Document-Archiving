# Changelog

All notable changes to EDAS are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-21

Fixes and operational readiness only; no structural changes. `M1`, `L2` and `L3` are deferred to `0.2.0`.

### Security

- Pin `effect` to `^3.22.5` in the API `overrides` to clear `GHSA-7589-6fvf-x4pw` (ReDoS). `@prisma/config` pins the vulnerable `effect@3.21.0` exactly and even `7.10.1` still pins `3.20.0`, so `npm audit fix` and a Prisma upgrade alone cannot clear it; the production dependency audit now reports zero vulnerabilities in both packages.

### Added

- Alertmanager renders its receiver from `ALERT_WEBHOOK_URL` or `ALERT_WEBHOOK_URL_FILE` (Docker-secret friendly) at startup, over http/https only, without logging the URL. With no configuration it keeps the no-integration default and states that alerts are recorded but not delivered. Validated with `amtool` and a real local delivery test.
- Encrypted off-site backups: `scripts/backup/offsite.sh` encrypts the dump and object archive, uploads to an S3-compatible bucket, re-reads the object to verify its sha256, checks the key exists, and only then applies a configurable retention policy. It refuses to upload without a passphrase and never uploads plaintext.
- `scripts/backup/verify.sh` decrypts encrypted backups before the isolated restore, and `verify-latest.sh` drives the newest backup for scheduled drills.
- systemd `edas-backup` (nightly) and `edas-backup-verify` (weekly restore drill) service/timer units with an example environment file.
- CI job that checks shell syntax, runs the off-site self-test against a local fake S3, and validates the rendered Alertmanager config with `amtool`.
- `.nvmrc` and `engines.node >= 22`.

### Changed

- Audit chain verification (`verifyChain` / baseline creation) streams the ledger in `seq`-ordered batches of 1,000 with a cursor instead of loading every event at once, keeping verification memory bounded while preserving break, fork and gap detection.
- The SPA coverage suite uses a 20s test timeout on every machine, matching CI, so coverage runs under load no longer fail slow-but-correct tests; no retries were added.
- Renamed `api/vitest.config.ts` to `api/vitest.config.mts` so Vitest no longer warns about ESM syntax in a CommonJS-loaded config.
- `README.md` now describes the real audit gate (`npm audit --omit=dev` blocking, full tree advisory) instead of claiming the full-tree audit blocks the build.

### Operational notes

- Alert delivery is verified against a local receiver only; production needs the same check against the organisation endpoint.
- Off-site backup round-trip is verified against a local fake S3 only; production needs one restore from the real external bucket before the copy is considered production-ready.

## [0.1.0] - 2026-11-18

The first security-hardened pre-production baseline.

### Added

- `Folder.scope` enforcement for `PUBLIC`, `DEPARTMENT`, `SECTION`, and `PRIVATE`, including a `Folder.sectionId` migration and owner assignment on new folders.
- Server-side effective permissions: role capabilities are the ceiling, folder `DENY` rules always win, and folder `ALLOW` rules cannot grant an action the role does not hold.
- `canManageAcl` guard for ACL replacement; folder scope changes now require `MANAGE_SCOPE` authority.
- Browser smoke test guards against CSP violations.
- Build-time CSP meta tag and optional `VITE_REQUIRE_API` deployment guard.
- Versioned MinIO bucket in the local stack and backup/restore runbooks plus verification scripts.
- Optional Redis/BullMQ preview queue with retry, idempotent job ids, and an in-process fallback.
- OpenTelemetry tracing for HTTP/Express, W3C trace context, and log `traceId` correlation.
- Optional observability profile with Prometheus, Alertmanager, Loki, Promtail, Grafana, the OpenTelemetry Collector, and Jaeger.
- Release process, rollback checklist, and versioning policy.
- Accessible form labelling: `Field` now associates its `<label>` with the first labelable control via `htmlFor`/`id`, `Checkbox` accepts an accessible name, and `DataTable`/ACL/notification checkboxes carry labels.
- Accessible names for icon-only controls (sidebar collapse/expand, toast dismiss, library details panel, sort/filter menus, clear-search buttons) and a shared `g.selectAll` / `g.selectRow` / `nav.collapseSidebar` / `nav.expandSidebar` message set.

### Changed

- Documents listing and the folder tree now derive visibility from effective folder permissions instead of a department-only filter.
- `TRUST_PROXY` is configurable instead of hard-coded.
- The department dashboard (`/dashboard/department`) is no longer reachable by the `employee` and `auditor` roles; both now see the access-denied state.
- Local backup output (`backups/`, produced by `npm run backup:local`) is git-ignored so dumps are not committed by accident.
- The blocking dependency-audit gate now covers production dependencies (`npm audit --omit=dev`); the full-tree audit runs in CI as a non-blocking advisory step.

### Fixed

- The login screen no longer probes `/auth/me` before a session exists, removing the expected `401` from the browser console.
- Form controls and raw search/file inputs now always have an `id` and `name`, so browser autofill no longer reports missing attributes.
- Report run history opened an empty list instead of the run log.
- Six ESLint warnings in shared UI hooks and policy editor effects.
- New user accounts could be created with a five-digit employee number, which broke the `EMP-\d{4}` expectation in the admin-users test.
- The ODA install-root scan built Windows paths with the host path flavour, so DWG converter detection failed its test on non-Windows CI runners.
- The assistant date-range test compared fixtures against the real clock, so it started failing as soon as the calendar day moved past them; the suite now pins the system time.
- The default one-second `waitFor` timeout was too tight for loaded CI workers and flaked unrelated page tests; the SPA test setup now allows five seconds.
- The SPA suite fanned out eight test workers on runners with fewer cores, which starved heavy tests into timeouts; the worker count now follows the available CPUs and CI gets a longer test timeout.
