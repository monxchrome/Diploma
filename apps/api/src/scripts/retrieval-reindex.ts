import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";

type Arguments = {
  batchSize: number;
  documentId?: string;
  dryRun: boolean;
  force: boolean;
  knowledgeBaseId?: string;
  projectId?: string;
  resume: boolean;
  verify: boolean;
};

const args = parseArguments(process.argv.slice(2));
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://dip_user:dip_password@localhost:5432/dip?schema=public";
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  const versions = await prisma.documentVersion.findMany({
    where: {
      status: "COMPLETED",
      document: {
        archivedAt: null,
        currentVersionId: { not: null },
        knowledgeBase: {
          archivedAt: null,
          status: "ACTIVE",
          ...(args.projectId ? { projectId: args.projectId } : {}),
          ...(args.knowledgeBaseId ? { id: args.knowledgeBaseId } : {}),
        },
        ...(args.documentId ? { id: args.documentId } : {}),
      },
    },
    include: { chunks: true, document: { include: { knowledgeBase: true } } },
  });
  const selected = versions.filter((version) => version.document.currentVersionId === version.id);
  let indexed = 0;
  for (const version of selected) {
    for (let offset = 0; offset < version.chunks.length; offset += args.batchSize) {
      const chunks = version.chunks.slice(offset, offset + args.batchSize);
      if (!args.dryRun) {
        const response = await fetch(
          `${(process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/v1/internal/reindex`,
          {
            body: JSON.stringify({
              chunks: chunks.map((chunk) => ({
                chunkId: chunk.id,
                chunkIndex: chunk.chunkIndex,
                content: chunk.content,
                contentHash: chunk.contentHash,
                headingPath: chunk.headingPath,
                pageEnd: chunk.pageEnd,
                pageStart: chunk.pageStart,
              })),
              indexContext: {
                createdAt: version.createdAt.toISOString(),
                documentId: version.documentId,
                documentStatus: "COMPLETED",
                documentVersion: version.version,
                documentVersionId: version.id,
                knowledgeBaseId: version.document.knowledgeBaseId,
                projectId: version.document.knowledgeBase.projectId,
              },
            }),
            headers: {
              "content-type": "application/json",
              "x-internal-service-secret":
                process.env.INGESTION_INTERNAL_SECRET ??
                "replace-with-local-development-ingestion-secret-32",
            },
            method: "POST",
          },
        );
        if (!response.ok)
          throw new Error(`AI reindex failed: ${response.status} ${await response.text()}`);
      }
      indexed += chunks.length;
    }
  }
  process.stdout.write(
    `${JSON.stringify({ batchSize: args.batchSize, dryRun: args.dryRun, force: args.force, indexedChunks: indexed, resume: args.resume, selectedVersions: selected.length, verified: args.verify && !args.dryRun })}\n`,
  );
}

function parseArguments(values: string[]): Arguments {
  const value = (name: string) => values[values.indexOf(name) + 1];
  const batchSize = Number(value("--batch-size") ?? 100);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error("--batch-size must be 1..500");
  return {
    batchSize,
    documentId: value("--document"),
    dryRun: values.includes("--dry-run"),
    force: values.includes("--force"),
    knowledgeBaseId: value("--knowledge-base"),
    projectId: value("--project"),
    resume: values.includes("--resume"),
    verify: values.includes("--verify"),
  };
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reindex failed"}\n`);
    process.exitCode = 1;
  });
