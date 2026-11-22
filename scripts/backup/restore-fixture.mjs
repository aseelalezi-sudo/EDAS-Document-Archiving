import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const [mode, path] = process.argv.slice(2);
const base = `http://127.0.0.1:${process.env.PORT}/api/v1`;

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  assert(response.ok, `${options?.method ?? "GET"} ${new URL(url).pathname} returned ${response.status}`);
  return response;
}

async function login(username, password) {
  const response = await request(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "password", client_id: "edas-cli", username, password, scope: "openid" }),
  });
  const { access_token: token } = await response.json();
  assert(token, "Keycloak must issue an access token");
  return { Authorization: `Bearer ${token}` };
}

const auth =
  mode === "employee" ? await login("employee", "employee") : await login(process.env.KEYCLOAK_ADMIN, process.env.KEYCLOAK_ADMIN_PASSWORD);

async function api(route, body, headers = auth) {
  const response = await request(
    base + route,
    body
      ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { headers },
  );
  return (await response.json()).data;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const account = await api("/auth/me");
assert.equal(account.role, mode === "employee" ? "EMPLOYEE" : "SYSTEM_ADMIN", "Unexpected role for the provisioned test account");

if (mode === "employee") {
  console.log("Provisioned the scoped test employee");
} else if (mode === "benchmark") {
  const { runLoad } = await import("../performance/run.mjs");
  const fixture = JSON.parse(await readFile(path, "utf8"));
  const employee = await login("employee", "employee");
  let refreshPending;
  function isExpiring(headers) {
    const payload = headers.Authorization.split(".")[1];
    const expiry = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp;
    return expiry * 1000 - Date.now() < 60_000;
  }

  function refreshAuth() {
    if (!isExpiring(auth) && !isExpiring(employee)) return;
    refreshPending ??= Promise.all([
      login(process.env.KEYCLOAK_ADMIN, process.env.KEYCLOAK_ADMIN_PASSWORD),
      login("employee", "employee"),
    ])
      .then(([adminAuth, employeeAuth]) => {
        Object.assign(auth, adminAuth);
        Object.assign(employee, employeeAuth);
      })
      .finally(() => { refreshPending = undefined; });
    return refreshPending;
  }

  await runLoad({ api, request, base, auth, employee, fixture, sha256, refreshAuth });
} else if (mode === "create") {
  const originalName = "restore-fixture.pdf";
  const mimeType = "application/pdf";
  const title = `Recovery fixture ${randomUUID()}`;
  const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
  const PdfDocument = requireApi("pdfkit");
  const pdf = new PdfDocument();
  pdf.text(title);
  pdf.end();
  const chunks = [];
  for await (const chunk of pdf) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const sizeBytes = bytes.length;
  const checksumSha256 = sha256(bytes);
  const { url, storageKey } = await api("/files/presign-upload", { fileName: originalName, mimeType, sizeBytes });
  await request(url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  const file = await api("/files", { storageKey, originalName, mimeType, sizeBytes, checksumSha256 });
  const doc = await api("/documents", { title, fileId: file.id });
  await writeFile(path, JSON.stringify({ id: doc.id, fileId: file.id, title, checksumSha256, accountId: account.id }), { mode: 0o600 });
  console.log("Uploaded and registered a test PDF through the source API");
} else {
  assert.equal(mode, "check");
  const { id, fileId, title, checksumSha256, accountId } = JSON.parse(await readFile(path, "utf8"));
  assert.equal(account.id, accountId, "Restored account must keep its EDAS identity");
  const doc = await api(`/documents/${id}`);
  assert.equal(doc.title, title, "Restored PostgreSQL must contain the original document");
  const currentFile = doc.versions.find((version) => version.isCurrent)?.file;
  assert.equal(currentFile?.id, fileId, "Restored current version must point to the original file");
  assert.equal(currentFile.checksumSha256, checksumSha256, "Restored file metadata must retain the original checksum");

  const { url } = await api(`/files/${fileId}/download`);
  const download = await request(url);
  assert.equal(sha256(Buffer.from(await download.arrayBuffer())), checksumSha256, "Restored download bytes changed");

  const preview = await request(`${base}/preview/files/${fileId}/content?kind=original`, { headers: auth });
  assert.match(preview.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal(sha256(Buffer.from(await preview.arrayBuffer())), checksumSha256, "Restored preview bytes changed");
  console.log("Verified the restored document, original download and inline preview through the API");
}
