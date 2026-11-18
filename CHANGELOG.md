# Changelog

All notable changes to EDAS are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

- Report run history opened an empty list instead of the run log.
- Six ESLint warnings in shared UI hooks and policy editor effects.
- New user accounts could be created with a five-digit employee number, which broke the `EMP-\d{4}` expectation in the admin-users test.
- The ODA install-root scan built Windows paths with the host path flavour, so DWG converter detection failed its test on non-Windows CI runners.
- The assistant date-range test compared fixtures against the real clock, so it started failing as soon as the calendar day moved past them; the suite now pins the system time.
