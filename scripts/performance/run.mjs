import assert from "node:assert/strict";
import { cpus, totalmem } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

function percentile(values, ratio) {
  if (!values.length) return null;
  return Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]);
}

export async function runLoad({ api, request, base, auth, employee, fixture, sha256, refreshAuth }) {
  const documents = Number(process.env.LOAD_DOCUMENTS);
  const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 12);
  const rounds = Number(process.env.LOAD_ROUNDS ?? 12);
  const durationSeconds = Number(process.env.LOAD_DURATION_SECONDS ?? 0);
  assert(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 50);
  assert(Number.isInteger(rounds) && rounds >= 8 && rounds <= 100);

  assert(Number.isInteger(durationSeconds) && durationSeconds >= 0 && durationSeconds <= 7200);

  const filePath = `/files/${fixture.fileId}`;
  const previewPath = `/preview/files/${fixture.fileId}/content?kind=original`;
  const original = Buffer.from(await (await request(base + previewPath, { headers: auth })).arrayBuffer());
  assert.equal(sha256(original), fixture.checksumSha256);
  const firstPage = await api("/documents?after=start&pageSize=25");
  assert.equal(firstPage.meta.total, 2 + documents - Math.floor(documents / 100));
  const scopedPage = await api("/documents?after=start&pageSize=25", undefined, employee);
  assert(scopedPage.meta.total > 0 && scopedPage.meta.total < firstPage.meta.total);
  const deniedFolder = "20000000-0000-4000-8000-000000000033";
  const deniedPage = await api(`/documents?folderId=${deniedFolder}&pageSize=25`, undefined, employee);
  assert.equal(deniedPage.meta.total, 0, "Employee search must respect the ACL denial");
  const deepPage = Math.max(1, Math.floor(firstPage.meta.total * 0.9 / 25));
  const anchorPage = deepPage > 1 ? await api(`/documents?page=${deepPage - 1}&pageSize=25`) : null;
  const anchor = anchorPage?.items.at(-1);
  const after = anchor ? encodeURIComponent(`${anchor.createdAt}/${anchor.id}`) : "start";
  const deepRoute = `/documents?after=${after}&pageSize=25`;
  const expectedDeep = await api(`/documents?page=${deepPage}&pageSize=25`);
  const expectedIds = expectedDeep.items.map(({ id }) => id);
  assert.deepEqual((await api(deepRoute)).items.map(({ id }) => id), expectedIds);
  const needle = encodeURIComponent("عبارة اختبار الأرشيف");

  const ownerSearch = await api("/documents?q=Catalog%20Search%20Owner&pageSize=25", undefined, employee);
  assert.equal(ownerSearch.meta.total, Math.floor((documents - 1) / 2048) + 1);
  assert(ownerSearch.items.every((doc) => doc.ownerNameEn === "Catalog Search Owner"));

  const tagSearch = await api("/documents?q=group-17&pageSize=25");
  assert.equal(tagSearch.meta.total, Math.floor((documents - 17) / 50) + 1);
  assert(tagSearch.items.every((doc) => doc.tags.includes("group-17")));

  const phraseSearch = await api(`/documents?q=${needle}&pageSize=25`, undefined, employee);
  assert(phraseSearch.meta.total > 0);
  assert(phraseSearch.items.every((doc) => doc.description === "عبارة اختبار الأرشيف"));

  const mimeType = "application/pdf";
  async function storePdf(bytes) {
    const originalName = "load-fixture.pdf";
    const sizeBytes = bytes.length;
    const checksumSha256 = sha256(bytes);
    const { url, storageKey } = await api("/files/presign-upload", { fileName: originalName, mimeType, sizeBytes });
    await request(url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
    const file = await api("/files", { storageKey, originalName, mimeType, sizeBytes, checksumSha256 });
    assert.equal(file.checksumSha256, checksumSha256);
    assert((await api("/documents", { title: "Load upload", fileId: file.id })).id);
    return { fileId: file.id, checksumSha256, sizeBytes };
  }

  const payloadSizes = [64, 512, 64, 64, 4096, 64, 512, 64, 64, 12288].map((sizeKiB) => sizeKiB * 1024);
  let makePdf;
  const readFixtures = [{ ...fixture, sizeBytes: original.length }];
  if (durationSeconds) {
    ({ makePdf } = await import("./synthetic-pdf.mjs"));
    for (const bytes of new Set(payloadSizes)) {
      readFixtures.push(await storePdf(await makePdf(bytes)));
    }
    assert.equal(new Set(readFixtures.map((item) => item.fileId)).size, readFixtures.length);
    assert.equal(new Set(readFixtures.map((item) => item.checksumSha256)).size, readFixtures.length);
  }
  let nextDownload = 0;
  let nextPreview = 0;
  let nextUpload = 0;

  const operations = {
    adminList: async () => assert.equal((await api("/documents?after=start&pageSize=25")).items.length, 25),
    employeeList: async () => assert.equal((await api("/documents?after=start&pageSize=25", undefined, employee)).items.length, 25),
    deepPage: async () => {
      const page = await api(deepRoute);
      assert.deepEqual(page.items.map(({ id }) => id), expectedIds);
      assert.equal(page.meta.total, undefined);
    },
    searchArabic: async () => {
      const found = await api(`/documents?q=${needle}`, undefined, employee);
      assert.equal(found.meta.total, phraseSearch.meta.total);
      assert.deepEqual(found.items.map(({ id }) => id), phraseSearch.items.map(({ id }) => id));
    },
    download: async () => {
      const item = readFixtures[nextDownload++ % readFixtures.length];
      const { url } = await api(`/files/${item.fileId}/download`);
      assert.equal(sha256(Buffer.from(await (await request(url)).arrayBuffer())), item.checksumSha256);
      return item.sizeBytes;
    },
    preview: async () => {
      const item = readFixtures[nextPreview++ % readFixtures.length];
      const response = await request(`${base}/preview/files/${item.fileId}/content?kind=original`, { headers: auth });
      assert.match(response.headers.get("content-disposition") ?? "", /^inline/);
      assert.equal(sha256(Buffer.from(await response.arrayBuffer())), item.checksumSha256);
      return item.sizeBytes;
    },
    uploadAndRegister: async () => {
      const bytes = makePdf ? await makePdf(payloadSizes[nextUpload++ % payloadSizes.length]) : original;
      return (await storePdf(bytes)).sizeBytes;
    },
  };

  const names = Object.keys(operations);
  const samples = Object.fromEntries(names.map((name) => [name, []]));
  const started = performance.now();
  const deadline = started + durationSeconds * 1000;
  const intervalMs = durationSeconds ? Math.max(3000, concurrency * 250) : 0;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      if (intervalMs) await sleep((worker * intervalMs) / concurrency);
      for (let round = 0; durationSeconds ? performance.now() < deadline : round < rounds; round++) {
        const name = names[(round + worker) % names.length];
        const start = performance.now();
        let error = null;
        let bytes = 0;
        try {
          if (durationSeconds) await refreshAuth();
          bytes = (await operations[name]()) ?? 0;
        } catch (cause) {
          error = cause.name === "AssertionError" ? cause.message.split("\n")[0] : cause.name;
        }
        const latencyMs = performance.now() - start;
        samples[name].push({ latencyMs, error, bytes, minute: Math.floor((start - started) / 60_000) + 1 });
        if (intervalMs) await sleep(Math.max(0, Math.min(intervalMs - latencyMs, deadline - performance.now())));
      }
    }),
  );
  const elapsedMs = Math.round(performance.now() - started);
  const attempts = Object.values(samples).reduce((sum, rows) => sum + rows.length, 0);
  const report = {
    revision: process.env.GITHUB_SHA ?? null,
    dataset: {
      documents,
      departments: 16,
      folders: 256,
      seededFilesShared: true,
      readFixtureSizesBytes: readFixtures.map((item) => item.sizeBytes),
      uploadPayloadSizesBytes: durationSeconds ? payloadSizes : [original.length],
    },
    runner: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramMiB: Math.round(totalmem() / 1024 ** 2) },
    apiPeakRssMiB: null,
    workload: {
      concurrency,
      rounds: durationSeconds ? null : rounds,
      durationSeconds,
      intervalMs,
      deepPage,
      elapsedMs,
      attempts,
      operationsPerSecond: +((1000 * attempts) / elapsedMs).toFixed(2),
    },
    operations: {},
  };
  if (process.env.LOAD_API_PID) {
    const status = await readFile(`/proc/${process.env.LOAD_API_PID}/status`, "utf8");
    const peak = /^VmHWM:\s+(\d+) kB$/m.exec(status);
    if (peak) report.apiPeakRssMiB = Math.round(Number(peak[1]) / 1024);
  }
  let errors = 0;
  const minutes = new Map();
  for (const [name, rows] of Object.entries(samples)) {
    const successes = rows.filter(({ error }) => !error).map(({ latencyMs }) => latencyMs);
    const failures = rows.length - successes.length;
    errors += failures;
    for (const row of rows) {
      if (!minutes.has(row.minute)) minutes.set(row.minute, { minute: row.minute, attempts: 0, failures: 0 });
      const bucket = minutes.get(row.minute);
      bucket.attempts++;
      if (row.error) bucket.failures++;
    }
    report.operations[name] = {
      attempts: rows.length,
      failures,
      verifiedBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
      p50Ms: percentile(successes, 0.5),
      p95Ms: percentile(successes, 0.95),
      maxMs: percentile(successes, 1),
      errorExamples: [...new Set(rows.flatMap(({ error }) => (error ? [error] : [])))].slice(0, 3),
    };
  }
  report.minutes = [...minutes.values()].sort((a, b) => a.minute - b.minute);
  report.errorRatePercent = +((100 * errors) / attempts).toFixed(2);
  const json = JSON.stringify(report, null, 2) + "\n";
  await writeFile(process.env.LOAD_REPORT, json);
  console.log(json);
  assert(Object.values(samples).every((rows) => rows.length > 0), "Every workload operation must run");
  assert.equal(errors, 0, "Some load operations failed; see the benchmark report");
}
