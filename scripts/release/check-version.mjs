import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageFiles = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/config/package.json",
  "packages/contracts/package.json",
  "packages/eslint-config/package.json",
  "packages/typescript-config/package.json",
  "packages/ui/package.json",
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(workspaceRoot, relativePath), "utf8"));
}

export async function verifyReleaseVersion() {
  const rootPackage = await readJson("package.json");
  const version = rootPackage.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Root package version is not SemVer: ${version}`);
  }

  const mismatches = [];
  for (const relativePath of packageFiles) {
    const packageJson = await readJson(relativePath);
    if (packageJson.version !== version) {
      mismatches.push(`${relativePath} is ${packageJson.version}`);
    }
  }

  const pyproject = await readFile(
    resolve(workspaceRoot, "apps/ai-service/pyproject.toml"),
    "utf8",
  );
  const pythonVersion = /^version\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1];
  if (pythonVersion !== version) {
    mismatches.push(`apps/ai-service/pyproject.toml is ${pythonVersion ?? "missing"}`);
  }

  const manifest = await readJson("docs/release/release-manifest.json");
  if (manifest.version !== version) {
    mismatches.push(`docs/release/release-manifest.json is ${manifest.version}`);
  }

  if (mismatches.length) {
    throw new Error(`Release version mismatch:\n- ${mismatches.join("\n- ")}`);
  }

  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReleaseVersion()
    .then((version) => {
      process.stdout.write(`Release version consistency verified: ${version}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
