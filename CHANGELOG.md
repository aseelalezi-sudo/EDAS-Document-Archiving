# Changelog

All notable changes to EDAS are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed

- Documents listing and the folder tree now derive visibility from effective folder permissions instead of a department-only filter.
- `TRUST_PROXY` is configurable instead of hard-coded.

### Fixed

- Report run history opened an empty list instead of the run log.
- Six ESLint warnings in shared UI hooks and policy editor effects.

## [0.1.0] - TBD

The first security-hardened pre-production baseline. Do not tag until the release checklist in `docs/release-process.md` is complete and the release owner approves it.
