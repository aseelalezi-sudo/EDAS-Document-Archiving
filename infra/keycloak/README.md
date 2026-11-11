# Development Keycloak realm

`realm-edas.json` is imported by `docker compose` (`start-dev --import-realm`) and by
`scripts/e2e.ps1`.

**It is not a production realm.** It contains:

- demo users `admin` / `manager` / `employee` whose password equals their username;
- a public `edas-cli` client with the resource-owner password grant enabled, used only by local
  scripts and the end-to-end suite;
- localhost redirect URIs and web origins (`http://localhost:5173`, `http://localhost:4173`,
  `http://localhost:4000`).

Hardening that is already applied here:

- `edas-web` (the browser client) has `directAccessGrantsEnabled: false`; it only accepts the
  authorization-code flow with PKCE S256. The SPA never handles tokens, so the password grant is
  never needed in a browser.
- `sslRequired` is `external`, so HTTPS is mandatory for any non-localhost host.

For production, create a separate realm and do **not** reuse this file:

1. Disable or delete the `edas-cli` client (or protect it with a confidential client secret scoped to
   an operations network) and remove the demo users.
2. Register only the real SPA origin in `redirectUris` / `webOrigins` and require HTTPS.
3. Rotate the bootstrap admin password and every client secret, and keep them in the platform secret
   store rather than in this repository.

The API refuses to start with `NODE_ENV=production` when it detects the compose defaults
(`KEYCLOAK_ADMIN_PASSWORD=admin`, `MINIO_SECRET_KEY=edas_minio_dev_pw`, a `edas_dev_pw` database
password), a session/download secret shorter than 32 characters, or a non-HTTPS CORS origin
(`api/src/common/config/env.validation.ts`).
