import assert from "node:assert/strict";
import { cpus, totalmem } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

function percentile(values, ratio) {
  if (!values.length) return null;
  return Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]);
}

export async function runLoad({ api, request, base, auth, employee, fixture, sha256 }) {
  const documents = Number(process.env.LOAD_DOCUMENTS);
  const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 12);
  const rounds = Number(process.env.LOAD_ROUNDS ?? 12);
  assert(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 50);
  assert(Number.isInteger(rounds) && rounds >= 8 && rounds <= 100);

  const filePath = `/files/${fixture.fileId}`;
  const previewPath = `/preview/files/${fixture.fileId}/content?kind=original`;
  const original = Buffer.from(await (await request(base + previewPath, { headers: auth })).arrayBuffer());
  assert.equal(sha256(original), fixture.checksumSha256);
  const firstPage = await api("/documents?pageSize=25");
  assert.equal(firstPage.meta.total, 2 + documents - Math.floor(documents / 100));
  const scopedPage = await api("/documents?pageSize=25", undefined, employee);
  assert(scopedPage.meta.total > 0 && scopedPage.meta.total < firstPage.meta.total);
  const deniedFolder = "20000000-0000-4000-8000-000000000033";
  const deniedPage = await api(`/documents?folderId=${deniedFolder}&pageSize=25`, undefined, employee);
  assert.equal(deniedPage.meta.total, 0, "Employee search must respect the ACL denial");
  const deepPage = Math.max(1, Math.floor(firstPage.meta.total * 0.9 / 25));
  const needle = encodeURIComponent("عبارة اختبار الأرشيف");

  const operations = {
    adminList: async () => assert.equal((await api("/documents?pageSize=25")).items.length, 25),
    employeeList: async () => assert.equal((await api("/documents?pageSize=25", undefined, employee)).items.length, 25),
    deepPage: async () => assert.equal((await api(`/documents?page=${deepPage}&pageSize=25`)).items.length, 25),
    searchArabic: async () => assert((await api(`/documents?q=${needle}`, undefined, employee)).meta.total > 0),
    download: async () => {
      const { url } = await api(filePath + "/download");
      assert.equal(sha256(Buffer.from(await (await request(url)).arrayBuffer())), fixture.checksumSha256);
    },
    preview: async () => {
      const response = await request(base + previewPath, { headers: auth });
      assert.match(response.headers.get("content-disposition") ?? "", /^inline/);
      assert.equal(sha256(Buffer.from(await response.arrayBuffer())), fixture.checksumSha256);
    },
    uploadAndRegister: async () => {
      const mimeType = "application/pdf";
      const originalName = "load-fixture.pdf";
      const sizeBytes = original.length;
      const { url, storageKey } = await api("/files/presign-upload", { fileName: originalName, mimeType, sizeBytes });
      await request(url, { method: "PUT", headers: { "Content-Type": mimeType }, body: original });
      const file = await api("/files", { storageKey, originalName, mimeType, sizeBytes, checksumSha256: fixture.checksumSha256 });
      assert.equal(file.checksumSha256, fixture.checksumSha256);
      assert((await api("/documents", { title: "Load upload", fileId: file.id })).id);
    },
  };

  const names = Object.keys(operations);
  const samples = Object.fromEntries(names.map((name) => [name, []]));
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      for (let round = 0; round < rounds; round++) {
        const name = names[(round + worker) % names.length];
        const start = performance.now();
        let error = null;
        try {
          await operations[name]();
        } catch (cause) {
          error = cause.name === "AssertionError" ? cause.message.split("\n")[0] : cause.name;
        }
        samples[name].push({ latencyMs: performance.now() - start, error });
      }
    }),
  );
  const elapsedMs = Math.round(performance.now() - started);
  const report = {
    revision: process.env.GITHUB_SHA ?? null,
    dataset: { documents, departments: 16, folders: 256, fileBytes: original.length, seededFilesShared: true },
    runner: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramMiB: Math.round(totalmem() / 1024 ** 2) },
    apiPeakRssMiB: null,
    workload: { concurrency, rounds, deepPage, elapsedMs, operationsPerSecond: +(1000 * concurrency * rounds / elapsedMs).toFixed(2) },
    operations: {},
  };
  if (process.env.LOAD_API_PID) {
    const status = await readFile(`/proc/${process.env.LOAD_API_PID}/status`, "utf8");
    const peak = /^VmHWM:\s+(\d+) kB$/m.exec(status);
    if (peak) report.apiPeakRssMiB = Math.round(Number(peak[1]) / 1024);
  }
  let errors = 0;
  for (const [name, rows] of Object.entries(samples)) {
    const successes = rows.filter(({ error }) => !error).map(({ latencyMs }) => latencyMs);
    const failures = rows.length - successes.length;
    errors += failures;
    report.operations[name] = {
      attempts: rows.length,
      failures,
      p50Ms: percentile(successes, 0.5),
      p95Ms: percentile(successes, 0.95),
      maxMs: percentile(successes, 1),
      errorExamples: [...new Set(rows.flatMap(({ error }) => (error ? [error] : [])))].slice(0, 3),
    };
  }
  report.errorRatePercent = +(100 * errors / (concurrency * rounds)).toFixed(2);
  const json = JSON.stringify(report, null, 2) + "\n";
  await writeFile(process.env.LOAD_REPORT, json);
  console.log(json);
  assert.equal(errors, 0, "Some load operations failed; see the benchmark report");
}
