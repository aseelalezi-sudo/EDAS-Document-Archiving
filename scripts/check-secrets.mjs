#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".vite", "previews"]);
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".env",
  ".example",
  ".md",
  ".ps1",
  ".sql",
  ".prisma",
]);

const RULES = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    label: "hardcoded sealing secret",
    pattern: /\b(?:SESSION_SECRET|DOWNLOAD_TICKET_SECRET)\b\s*[:=]\s*["']([^"']{32,})["']/,
  },
];

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .map((file) => file.replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile()) files.push(path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, "/"));
  }
  return files;
}

function isSecretFile(file) {
  const base = path.basename(file);
  if (base === ".env.example" || base.endsWith(".env.example")) return false;
  return base === ".env" || base.startsWith(".env.");
}

const findings = [];
const tracked = trackedFiles();
for (const file of tracked) {
  if (isSecretFile(file)) findings.push(`${file}: environment file is tracked by git (only .env.example may be committed)`);
}

const candidates = new Set([...walk(ROOT), ...tracked]);
for (const file of candidates) {
  if (!TEXT_EXTENSIONS.has(path.extname(file)) && !path.basename(file).startsWith(".env")) continue;
  if (file.includes("node_modules/") || isSecretFile(file)) continue;
  let content;
  try {
    if (statSync(path.join(ROOT, file)).size > 512 * 1024) continue;
    content = readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    continue;
  }
  for (const rule of RULES) {
    if (rule.pattern.test(content)) findings.push(`${file}: ${rule.label}`);
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`Secret scan clean (${tracked.length} tracked files, ${candidates.size} scanned).`);
