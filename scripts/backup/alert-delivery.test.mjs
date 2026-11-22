import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const configDirectory = resolve(process.argv[2]);
const receiverPort = 9099;
const alertmanager = "http://127.0.0.1:19093";
const drillId = randomUUID();
let delivered = false;

const receiver = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/hook") {
    response.writeHead(404).end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const payload = JSON.parse(body);
    if (payload.status === "firing" && payload.alerts.some(({ labels }) => labels.drill_id === drillId)) {
      delivered = true;
    }
    response.writeHead(204).end();
  } catch {
    response.writeHead(400).end();
  }
});

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120_000 }).trim();
}

async function waitUntil(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await pause(250);
  }
  return false;
}

let container;
try {
  receiver.listen(receiverPort, "127.0.0.1");
  await once(receiver, "listening");
  container = docker(
    "run",
    "-d",
    "--network",
    "host",
    "-v",
    `${configDirectory}:/cfg:ro`,
    "prom/alertmanager:v0.28.1@sha256:27c475db5fb156cab31d5c18a4251ac7ed567746a2483ff264516437a39b15ba",
    "--config.file=/cfg/alertmanager.yml",
    "--web.listen-address=127.0.0.1:19093",
    "--cluster.listen-address=",
  );
  const ready = await waitUntil(async () => {
    try {
      return (await fetch(`${alertmanager}/-/ready`, { signal: AbortSignal.timeout(2_000) })).ok;
    } catch {
      return false;
    }
  }, 20_000);
  assert(ready, "Alertmanager did not become ready");

  const accepted = await fetch(`${alertmanager}/api/v2/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        labels: { alertname: "EdasWebhookDrill", severity: "warning", drill_id: drillId },
        annotations: { summary: "EDAS CI webhook delivery check" },
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 180_000).toISOString(),
      },
    ]),
    signal: AbortSignal.timeout(5_000),
  });
  assert(accepted.ok, `Alertmanager rejected the test alert with HTTP ${accepted.status}`);
  assert(await waitUntil(() => delivered, 75_000), "The loopback webhook did not receive the firing alert");
  console.log("Alertmanager delivered the expected firing alert to the loopback webhook");
} catch (error) {
  if (container) console.error(docker("logs", container));
  throw error;
} finally {
  receiver.close();
  if (container) docker("rm", "-f", container);
}
