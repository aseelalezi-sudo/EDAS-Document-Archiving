import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const [mode, path, outPath] = process.argv.slice(2);
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

async function api(route, body, headers = auth, method) {
  const options = { headers };
  if (body !== undefined) {
    options.method = method ?? "POST";
    options.headers = { ...headers, "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  } else if (method) {
    options.method = method;
  }
  const response = await request(base + route, options);
  return (await response.json()).data;
}

async function raw(route, headers) {
  const response = await fetch(base + route, { headers, signal: AbortSignal.timeout(15_000) });
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  return { status: response.status, data: payload?.data ?? null };
}

async function fixturePdf(title) {
  const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
  const PdfDocument = requireApi("pdfkit");
  const pdf = new PdfDocument();
  pdf.text(title);
  pdf.end();
  const chunks = [];
  for await (const chunk of pdf) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function uploadFixture(name) {
  const mimeType = "application/pdf";
  const bytes = await fixturePdf(name);
  const sizeBytes = bytes.length;
  const checksumSha256 = sha256(bytes);
  const { url, storageKey } = await api("/files/presign-upload", { fileName: `${name}.pdf`, mimeType, sizeBytes });
  console.log(`Uploading ${name} to ${new URL(url).host}`);
  let upload;
  try {
    upload = await fetch(url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`Upload ${name} failed: ${detail}`);
    throw error;
  }
  assert(upload.ok, `PUT ${name} returned ${upload.status}`);
  console.log(`Uploaded ${name}: ${upload.status}`);
  const file = await api("/files", { storageKey, originalName: `${name}.pdf`, mimeType, sizeBytes, checksumSha256 });
  return { fileId: file.id, checksumSha256 };
}

function downloadTarget(route) {
  return route.startsWith("http") ? route : `${new URL(base).origin}${route}`;
}

async function probeAccess(employeeAuth, allowed, restricted) {
  const allowedList = await raw(`/documents?folderId=${allowed.folderId}&pageSize=25`, employeeAuth);
  const restrictedList = await raw(`/documents?folderId=${restricted.folderId}&pageSize=25`, employeeAuth);
  const allowedOpen = await raw(`/documents/${allowed.id}`, employeeAuth);
  const restrictedOpen = await raw(`/documents/${restricted.id}`, employeeAuth);
  const allowedDownload = await raw(`/files/${allowed.fileId}/download`, employeeAuth);
  const restrictedDownload = await raw(`/files/${restricted.fileId}/download`, employeeAuth);

  let downloadChecksumMatches = false;
  if (allowedDownload.status === 200 && allowedDownload.data?.url) {
    const bytes = Buffer.from(await (await fetch(downloadTarget(allowedDownload.data.url), { signal: AbortSignal.timeout(20_000) })).arrayBuffer());
    downloadChecksumMatches = sha256(bytes) === allowed.checksumSha256;
  }

  const allowedItems = allowedList.data?.items;
  const allowedListed = Array.isArray(allowedItems) && allowedItems.some((item) => item.id === allowed.id);

  const report = {
    allowed: {
      listStatus: allowedList.status,
      listTotal: allowedList.data?.meta?.total ?? null,
      listed: allowedListed,
      openStatus: allowedOpen.status,
      downloadStatus: allowedDownload.status,
      downloadChecksumMatches,
    },
    restricted: {
      listStatus: restrictedList.status,
      listTotal: restrictedList.data?.meta?.total ?? null,
      openStatus: restrictedOpen.status,
      downloadStatus: restrictedDownload.status,
    },
  };
  report.verdict = {
    allow:
      report.allowed.listStatus === 200 &&
      report.allowed.listed &&
      report.allowed.openStatus === 200 &&
      report.allowed.downloadStatus === 200 &&
      report.allowed.downloadChecksumMatches,
    deny:
      (report.restricted.listStatus === 403 || (report.restricted.listStatus === 200 && (report.restricted.listTotal ?? 0) === 0)) &&
      [403, 404].includes(report.restricted.openStatus) &&
      [403, 404].includes(report.restricted.downloadStatus),
  };
  return report;
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
  const bytes = await fixturePdf(title);
  const sizeBytes = bytes.length;
  const checksumSha256 = sha256(bytes);
  const { url, storageKey } = await api("/files/presign-upload", { fileName: originalName, mimeType, sizeBytes });
  await request(url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  const file = await api("/files", { storageKey, originalName, mimeType, sizeBytes, checksumSha256 });
  const doc = await api("/documents", { title, fileId: file.id });
  await writeFile(path, JSON.stringify({ id: doc.id, fileId: file.id, title, checksumSha256, accountId: account.id }), { mode: 0o600 });
  console.log("Uploaded and registered a test PDF through the source API");
} else if (mode === "access-create") {
  const employeeAuth = await login("employee", "employee");
  const employee = await api("/auth/me", undefined, employeeAuth);
  assert.equal(employee.role, "EMPLOYEE", "The drill account must hold the EMPLOYEE role");

  const tree = await api("/org/tree");
  let department = tree.items.find((item) => item.code === "DRILL-ACCESS");
  if (!department) {
    department = await api("/org/departments", { code: "DRILL-ACCESS", name: "Drill access department", nameEn: "Drill access department" });
  }
  if (employee.departmentId !== department.id) {
    await api(`/users/${employee.id}`, { departmentId: department.id }, auth, "PATCH");
  }
  const scopedEmployee = await api("/auth/me", undefined, employeeAuth);
  assert.equal(scopedEmployee.departmentId, department.id, "The drill employee must be assigned to the drill department before the backup");

  const stamp = Date.now();
  const publicFolder = await api("/folders", { name: `Drill public ${stamp}`, scope: "PUBLIC" });
  const privateFolder = await api("/folders", { name: `Drill private ${stamp}`, scope: "PRIVATE" });

  const allowedFile = await uploadFixture("drill-allowed");
  const restrictedFile = await uploadFixture("drill-restricted");
  const allowedDoc = await api("/documents", { title: "Drill allowed", fileId: allowedFile.fileId, folderId: publicFolder.id });
  const restrictedDoc = await api("/documents", { title: "Drill restricted", fileId: restrictedFile.fileId, folderId: privateFolder.id });

  const allowed = { id: allowedDoc.id, fileId: allowedFile.fileId, title: allowedDoc.title, folderId: publicFolder.id, checksumSha256: allowedFile.checksumSha256 };
  const restricted = {
    id: restrictedDoc.id,
    fileId: restrictedFile.fileId,
    title: restrictedDoc.title,
    folderId: privateFolder.id,
    checksumSha256: restrictedFile.checksumSha256,
  };
  const before = await probeAccess(employeeAuth, allowed, restricted);

  const fixture = {
    department: { id: department.id, code: department.code },
    employee: { id: scopedEmployee.id, role: scopedEmployee.role, departmentId: scopedEmployee.departmentId },
    allowed,
    restricted,
    before,
  };
  await writeFile(path, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(fixture, null, 2));
  assert.ok(before.verdict.allow, "Before the backup the employee must see, open and download the PUBLIC document");
  assert.ok(before.verdict.deny, "Before the backup the employee must not see, open or download the PRIVATE document");
} else if (mode === "access-verify") {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  const employeeAuth = await login("employee", "employee");
  const employee = await api("/auth/me", undefined, employeeAuth);
  assert.equal(employee.id, fixture.employee.id, "The restored employee must keep the same identity");
  assert.equal(employee.role, "EMPLOYEE", "The restored employee must keep the EMPLOYEE role");
  assert.equal(employee.departmentId, fixture.employee.departmentId, "The restored employee must keep the department recorded before the backup");
  assert.equal(employee.departmentId, fixture.department.id, "The restored employee must keep the drill department");

  const after = await probeAccess(employeeAuth, fixture.allowed, fixture.restricted);

  const restrictedDoc = await raw(`/documents/${fixture.restricted.id}`, auth);
  assert.equal(restrictedDoc.status, 200, "The authorized account must still find the restricted document after the restore");
  assert.equal(restrictedDoc.data?.title, fixture.restricted.title, "The restored restricted document must keep its title");
  const restrictedDownload = await raw(`/files/${fixture.restricted.fileId}/download`, auth);
  assert.equal(restrictedDownload.status, 200, "The authorized account must still download the restricted document after the restore");
  const restrictedBytes = Buffer.from(await (await fetch(downloadTarget(restrictedDownload.data.url), { signal: AbortSignal.timeout(20_000) })).arrayBuffer());
  const restrictedViaAdmin = {
    openStatus: restrictedDoc.status,
    downloadStatus: restrictedDownload.status,
    checksumMatches: sha256(restrictedBytes) === fixture.restricted.checksumSha256,
  };

  const report = {
    employee: { id: employee.id, role: employee.role, departmentId: employee.departmentId },
    allowed: after.allowed,
    restricted: after.restricted,
    restrictedViaAdmin,
    verdict: { allow: after.verdict.allow, deny: after.verdict.deny && restrictedViaAdmin.checksumMatches },
  };
  await writeFile(outPath ?? path, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  assert.ok(report.verdict.allow, "After the restore the employee must see, open and download the PUBLIC document");
  assert.ok(report.verdict.deny, "After the restore the employee must not see, open or download the PRIVATE document, while the authorized account still can");
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
