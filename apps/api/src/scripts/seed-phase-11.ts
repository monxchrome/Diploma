import { createHash } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, type Prisma } from "../generated/prisma/client";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://dip_user:dip_password@localhost:5432/dip?schema=public";
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const seedActorId = process.env.BENCHMARK_SEED_CREATED_BY ?? "00000000-0000-4000-8000-000000000011";

const roles = [
  "SINGLE_AGENT",
  "PLANNER",
  "MARKET_SPECIALIST",
  "FINANCE_SPECIALIST",
  "LEGAL_SPECIALIST",
  "RISK_SPECIALIST",
  "STRATEGY_SPECIALIST",
  "COORDINATOR",
  "CRITIC",
] as const;

const cases = [
  {
    code: "SYN-001",
    title: "Market-entry trade-off",
    domain: "strategy",
    question: "Should the firm enter the synthetic regional market in the next planning cycle?",
    scenario: "Synthetic case: a firm must choose between entry, a staged pilot, or deferral.",
    objectives: ["Compare options", "Make risks explicit"],
    constraints: ["Budget is capped", "No external facts may be assumed"],
    assumptions: ["All facts below are true for this case"],
    expectedDecisionType: "MARKET_ENTRY",
    referenceFacts: ["Demand is moderate.", "A pilot has lower downside than full entry."],
    criticalRisks: ["Demand uncertainty", "Execution capacity"],
    expectedAlternatives: ["Full entry", "Pilot", "Defer"],
    knownUnknowns: ["Competitor response"],
    difficulty: "MEDIUM",
    tags: ["synthetic", "strategy"],
  },
  {
    code: "SYN-002",
    title: "Capital allocation under uncertainty",
    domain: "finance",
    question: "Which synthetic capital-allocation option best balances return and resilience?",
    scenario: "Synthetic case: compare an expansion, resilience investment, and cash preservation.",
    objectives: ["Explain recommendation", "Disclose uncertainty"],
    constraints: ["Use only frozen evidence"],
    assumptions: ["No hidden data exists"],
    expectedDecisionType: "CAPITAL_ALLOCATION",
    referenceFacts: [
      "Resilience investment reduces operational volatility.",
      "Expansion has higher upside.",
    ],
    criticalRisks: ["Liquidity", "Forecast error"],
    expectedAlternatives: ["Expansion", "Resilience", "Cash preservation"],
    knownUnknowns: ["Future demand"],
    difficulty: "MEDIUM",
    tags: ["synthetic", "finance"],
  },
  {
    code: "SYN-003",
    title: "Supplier concentration response",
    domain: "risk",
    question: "How should the firm respond to a synthetic supplier concentration risk?",
    scenario: "Synthetic case: a single supplier creates material continuity risk.",
    objectives: ["Identify mitigations", "Prioritize actions"],
    constraints: ["Do not invent supplier data"],
    assumptions: ["The facts are complete only for this benchmark"],
    expectedDecisionType: "RISK_MITIGATION",
    referenceFacts: [
      "Two alternate suppliers are qualified but cost more.",
      "Inventory can buffer short disruption.",
    ],
    criticalRisks: ["Supply interruption", "Margin pressure"],
    expectedAlternatives: ["Dual source", "Inventory buffer", "Accept risk"],
    knownUnknowns: ["Duration of disruption"],
    difficulty: "MEDIUM",
    tags: ["synthetic", "risk"],
  },
] as const;

async function main(): Promise<void> {
  await seedProfiles();
  await seedPromptVersions();
  const rubric = await prisma.evaluationRubric.upsert({
    where: { code_version: { code: "decision-support", version: "phase-11-v1" } },
    create: {
      code: "decision-support",
      version: "phase-11-v1",
      title: "Decision-support benchmark rubric",
      criteria: json([
        "grounding",
        "citation correctness",
        "risk analysis",
        "uncertainty",
        "actionability",
      ]),
      scale: json({ max: 5, min: 1 }),
      weights: json({ grounding: 0.3, risk: 0.2, uncertainty: 0.2, usefulness: 0.3 }),
      contentHash: hash("decision-support-phase-11-v1"),
    },
    update: {},
  });
  const critic = await prisma.promptVersion.findUniqueOrThrow({
    where: { role_version: { role: "CRITIC", version: "phase-11-v1" } },
  });
  await prisma.judgePolicy.upsert({
    where: { code_version: { code: "default-blinded", version: "phase-11-v1" } },
    create: {
      code: "default-blinded",
      version: "phase-11-v1",
      promptVersionId: critic.id,
      rubricId: rubric.id,
      configuration: json({ blinded: true, requireRationale: false, randomizedOrder: true }),
      contentHash: hash("default-blinded-phase-11-v1"),
    },
    update: {},
  });
  await seedDataset();
  process.stdout.write(
    "Phase 11 seed completed; configured profiles are active and unconfigured providers remain inert.\n",
  );
}

async function seedProfiles(): Promise<void> {
  const profiles = [
    {
      code: "openai-default",
      displayName: "OpenAI benchmark placeholder",
      provider: "OPENAI" as const,
      family: "OPENAI",
      exactModelId: process.env.OPENAI_BENCHMARK_MODEL_ID ?? "unconfigured-openai-model",
      runtime: "CLOUD" as const,
    },
    {
      code: "anthropic-default",
      displayName: "Anthropic benchmark placeholder",
      provider: "ANTHROPIC" as const,
      family: "ANTHROPIC",
      exactModelId: process.env.ANTHROPIC_BENCHMARK_MODEL_ID ?? "unconfigured-anthropic-model",
      runtime: "CLOUD" as const,
    },
    {
      code: "qwen-ollama-default",
      displayName: "Qwen via Ollama benchmark placeholder",
      provider: "OLLAMA" as const,
      family: "QWEN",
      exactModelId: process.env.OLLAMA_BENCHMARK_MODEL_ID ?? "unconfigured-qwen-model",
      runtime: "LOCAL_OLLAMA" as const,
    },
  ];
  for (const profile of profiles) {
    const configured = !profile.exactModelId.startsWith("unconfigured-");
    await prisma.modelProfile.upsert({
      where: { code_version: { code: profile.code, version: "phase-11-v1" } },
      create: {
        ...profile,
        version: "phase-11-v1",
        active: configured,
        benchmarkEligible: configured,
        capabilities: json({
          supportsSeed: profile.provider !== "ANTHROPIC",
          supportsStructuredOutput: true,
        }),
        defaultParameters: json({ maxOutputTokens: 1024, temperature: 0, topP: 1 }),
        metadata: json(
          profile.provider === "OLLAMA"
            ? {
                digest: process.env.OLLAMA_MODEL_DIGEST ?? "",
                hardware: process.env.OLLAMA_HARDWARE_PROFILE ?? "",
              }
            : {},
        ),
      },
      update: configured
        ? {
            active: true,
            benchmarkEligible: true,
            exactModelId: profile.exactModelId,
          }
        : {},
    });
  }
}

async function seedPromptVersions(): Promise<void> {
  for (const role of roles) {
    await prisma.promptVersion.upsert({
      where: { role_version: { role, version: "phase-11-v1" } },
      create: {
        role,
        version: "phase-11-v1",
        templateHash: hash(`benchmark-${role}-phase-11-v1`),
        schemaVersion: "benchmark-decision-output-v1",
        sourcePath: `phase-11/builtin/${role.toLowerCase()}.md`,
        changelog:
          "Deterministic built-in benchmark prompt identity; source text remains server-owned.",
      },
      update: {},
    });
  }
}

async function seedDataset(): Promise<void> {
  const dataset = await prisma.benchmarkDataset.upsert({
    where: { code: "phase-11-synthetic" },
    create: {
      code: "phase-11-synthetic",
      title: "Phase 11 synthetic decision benchmark",
      description: "Non-production synthetic cases for benchmark smoke and reproducibility checks.",
      domain: "decision-support",
      createdById: seedActorId,
    },
    update: {},
  });
  const version = await prisma.benchmarkDatasetVersion.upsert({
    where: { datasetId_version: { datasetId: dataset.id, version: "v1" } },
    create: {
      datasetId: dataset.id,
      version: "v1",
      schemaVersion: "phase-11-v1",
      contentHash: hash(cases),
      sourcePackageHash: hash("phase-11-synthetic-v1"),
      createdById: seedActorId,
    },
    update: {},
  });
  for (const testCase of cases) {
    const created = await prisma.benchmarkCase.upsert({
      where: { datasetVersionId_code: { datasetVersionId: version.id, code: testCase.code } },
      create: { ...testCase, datasetVersionId: version.id, sensitivity: "SYNTHETIC" },
      update: {},
    });
    const internalEvidence = testCase.referenceFacts.map((excerpt, index) => ({
      evidenceId: `${testCase.code}-E${index + 1}`,
      excerpt,
      sourceType: "SYNTHETIC_CASE_REFERENCE",
    }));
    const evidence = {
      benchmarkCaseId: created.id,
      version: "v1",
      protocol: "CONTROLLED_EVIDENCE" as const,
      internalEvidence,
      externalEvidence: [],
      citationMappings: Object.fromEntries(
        internalEvidence.map((item) => [item.evidenceId, item.evidenceId]),
      ),
      sourceMetadata: { synthetic: true },
      retrievalConfiguration: { executed: false, reason: "Controlled synthetic fixture" },
      researchConfiguration: { executed: false, reason: "Controlled synthetic fixture" },
    };
    await prisma.benchmarkEvidencePackage.upsert({
      where: {
        benchmarkCaseId_version_protocol: {
          benchmarkCaseId: created.id,
          protocol: "CONTROLLED_EVIDENCE",
          version: "v1",
        },
      },
      create: {
        ...evidence,
        internalEvidence: json(evidence.internalEvidence),
        externalEvidence: json(evidence.externalEvidence),
        citationMappings: json(evidence.citationMappings),
        sourceMetadata: json(evidence.sourceMetadata),
        retrievalConfiguration: json(evidence.retrievalConfiguration),
        researchConfiguration: json(evidence.researchConfiguration),
        contentHash: hash(evidence),
      },
      update: {},
    });
  }
  await prisma.benchmarkDatasetVersion.update({
    where: { id: version.id },
    data: { caseCount: cases.length, frozenAt: new Date() },
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Phase 11 seed failed"}\n`);
    process.exitCode = 1;
  });
