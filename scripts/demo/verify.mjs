import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const datasetPath = resolve(workspaceRoot, "datasets/demo/release-1.0.0.json");

async function main() {
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  if (dataset.version !== "1.0.0" || dataset.classification !== "SYNTHETIC") {
    throw new Error("Demo dataset must be versioned 1.0.0 and explicitly synthetic");
  }
  if (!Array.isArray(dataset.sources) || dataset.sources.length < 2) {
    throw new Error("Demo dataset must contain at least two synthetic sources");
  }
  if (dataset.sources.some((source) => source.sensitivity !== "SYNTHETIC")) {
    throw new Error("Every demo source must be explicitly marked SYNTHETIC");
  }

  const serialized = JSON.stringify(dataset).toLowerCase();
  for (const forbidden of ["@", "password", "api_key", "credit card", "private key"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Demo dataset contains prohibited marker: ${forbidden}`);
    }
  }

  process.stdout.write("Demo artifact verification passed (static dataset checks only).\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
