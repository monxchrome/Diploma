import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReleaseVersion } from "./check-version.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const secretPatterns = [
  /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
];

function readEnvFile(contents) {
  const values = new Map();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const delimiter = line.indexOf("=");
    if (delimiter < 1) continue;
    values.set(line.slice(0, delimiter).trim(), line.slice(delimiter + 1).trim());
  }
  return values;
}

async function scanTrackedTextForSecrets() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean)
    .filter((file) => !file.endsWith(".png") && !file.endsWith(".pdf"));
  const findings = [];

  for (const file of files) {
    const contents = await readFile(resolve(workspaceRoot, file), "utf8").catch(() => null);
    if (!contents) continue;
    if (secretPatterns.some((pattern) => pattern.test(contents))) findings.push(file);
  }
  return findings;
}

async function verifyProductionMetadata(version, envPath) {
  const values = readEnvFile(await readFile(resolve(workspaceRoot, envPath), "utf8"));
  const deploymentVersion = values.get("DEPLOYMENT_VERSION");
  const commitSha = values.get("DEPLOYMENT_COMMIT_SHA");
  const buildTimestamp = values.get("BUILD_TIMESTAMP");

  if (deploymentVersion !== version) {
    throw new Error(`DEPLOYMENT_VERSION must equal ${version}`);
  }
  if (!commitSha || !/^[0-9a-f]{7,64}$/i.test(commitSha)) {
    throw new Error("DEPLOYMENT_COMMIT_SHA must be a Git SHA before a production preflight");
  }
  if (!buildTimestamp || Number.isNaN(Date.parse(buildTimestamp))) {
    throw new Error("BUILD_TIMESTAMP must be an ISO-8601 timestamp before a production preflight");
  }
  if (values.get("DEPLOYMENT_DIRTY") !== "false") {
    throw new Error("DEPLOYMENT_DIRTY must be false for a production release candidate");
  }
}

async function main() {
  const version = await verifyReleaseVersion();
  const packageManager = JSON.parse(
    await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
  ).packageManager;
  if (packageManager !== "pnpm@11.17.0") {
    throw new Error(`Expected pinned pnpm@11.17.0, received ${packageManager ?? "missing"}`);
  }

  const findings = await scanTrackedTextForSecrets();
  if (findings.length) {
    throw new Error(`Potential committed secret material found in: ${findings.join(", ")}`);
  }

  const [mode, envPath] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (mode !== undefined && mode !== "--production") {
    throw new Error("Usage: pnpm release:preflight [--production path/to/.env.production]");
  }
  if (mode === "--production") {
    if (!envPath) throw new Error("A production environment file is required");
    await verifyProductionMetadata(version, envPath);
  }

  process.stdout.write(
    `Release preflight passed for ${version}${mode ? ` using ${envPath}` : " (static checks only)"}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
