import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, type Prisma } from "../generated/prisma/client";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://dip_user:dip_password@localhost:5432/dip?schema=public",
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  const project = process.env.BENCHMARK_DEMO_PROJECT_ID
    ? await prisma.project.findUniqueOrThrow({ where: { id: process.env.BENCHMARK_DEMO_PROJECT_ID } })
    : await prisma.project.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const user = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const datasetVersion = await prisma.benchmarkDatasetVersion.findFirstOrThrow({
    where: { dataset: { code: "phase-11-synthetic" }, version: "v1" },
    include: { cases: { orderBy: { code: "asc" }, take: 1, include: { evidencePackages: true } } },
  });
  const profile = await prisma.modelProfile.findFirstOrThrow({ where: { code: "qwen-ollama-default", active: true, benchmarkEligible: true } });
  const prompt = await prisma.promptVersion.findUniqueOrThrow({ where: { role_version: { role: "SINGLE_AGENT", version: "phase-11-v1" } } });
  const rubric = await prisma.evaluationRubric.findUniqueOrThrow({ where: { code_version: { code: "decision-support", version: "phase-11-v1" } } });
  const suite = await prisma.benchmarkSuite.upsert({
    where: { code_version: { code: "phase-11-demo", version: "v1" } },
    create: { projectId: project.id, datasetVersionId: datasetVersion.id, code: "phase-11-demo", version: "v1", title: "Phase 11 local Qwen demo", description: "One-case controlled-evidence demonstration run.", researchQuestions: json(["How does the local Qwen baseline handle a bounded decision case?"]), hypotheses: json(["A pinned local model produces a structurally valid decision artifact."]), domain: "decision-support", defaultEvaluationRubricId: rubric.id, createdById: user.id },
    update: { datasetVersionId: datasetVersion.id, defaultEvaluationRubricId: rubric.id, status: "DRAFT" },
  });
  const variant = await prisma.benchmarkVariant.upsert({
    where: { suiteId_code: { suiteId: suite.id, code: "V5-DEMO" } },
    create: { suiteId: suite.id, code: "V5-DEMO", title: "Qwen Single via Ollama", description: "Pinned local Qwen single-agent baseline.", architecture: "SINGLE_AGENT", budgetConfiguration: json({ maxOutputTokens: 256 }), contentHash: "phase-11-demo-v5" },
    update: { contentHash: "phase-11-demo-v5", enabled: true, frozenAt: null },
  });
  await prisma.agentModelAssignment.upsert({
    where: { benchmarkVariantId_role: { benchmarkVariantId: variant.id, role: "SINGLE_AGENT" } },
    create: { benchmarkVariantId: variant.id, role: "SINGLE_AGENT", modelProfileId: profile.id, promptVersionId: prompt.id, parameters: json({ maxOutputTokens: 256, temperature: 0, topP: 1, timeoutSeconds: 120, seed: 11042 }), executionOrder: 0 },
    update: { modelProfileId: profile.id, promptVersionId: prompt.id },
  });
  await prisma.benchmarkVariant.update({ where: { id: variant.id }, data: { frozenAt: new Date() } });
  await prisma.benchmarkSuite.update({ where: { id: suite.id }, data: { status: "READY", frozenAt: new Date() } });
  const testCase = datasetVersion.cases[0];
  if (!testCase) throw new Error("Synthetic benchmark case not found");
  const evidence = testCase.evidencePackages.find((item) => item.protocol === "CONTROLLED_EVIDENCE");
  if (!evidence) throw new Error("Controlled evidence package not found");
  const existing = await prisma.benchmarkRun.findFirst({ where: { suiteId: suite.id }, orderBy: { createdAt: "desc" } });
  const run = existing ?? await prisma.benchmarkRun.create({
    data: { suiteId: suite.id, datasetVersionId: datasetVersion.id, protocol: "CONTROLLED_EVIDENCE", budgetProtocol: "PRODUCTION_DEFAULT_BUDGET", repetitions: 1, randomizationSeed: 11042, status: "QUEUED", startedById: user.id, idempotencyKey: randomUUID(), executionPlan: json({ order: [{ caseId: testCase.id, variantId: variant.id, repetitionIndex: 1 }] }), evaluationPolicy: json({ humanEvaluation: false }), currency: "USD", caseRuns: { create: { benchmarkCaseId: testCase.id, benchmarkVariantId: variant.id, repetitionIndex: 1, executionOrder: 0, evidencePackageId: evidence.id } } },
  });
  const queue = new Queue("benchmarks", { connection: { host: "localhost", port: 6379, db: 1 } });
  await queue.add("execute", { benchmarkRunId: run.id, requestId: `demo-${run.id}` }, { jobId: `benchmark-run:${run.id}-${Date.now()}` });
  await queue.disconnect();
  process.stdout.write(JSON.stringify({ projectId: project.id, runId: run.id, suiteId: suite.id }));
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

main().finally(async () => { await prisma.$disconnect(); await pool.end(); }).catch((error: unknown) => { process.stderr.write(error instanceof Error ? error.message : "Demo seed failed"); process.exitCode = 1; });
