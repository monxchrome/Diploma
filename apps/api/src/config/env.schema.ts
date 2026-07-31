import { splitCsv } from "@dip/config";
import { z } from "zod";

const EnvironmentSchema = z.enum(["development", "test", "staging", "production"]);
const SameSiteSchema = z.enum(["lax", "strict", "none"]);
const HttpUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  {
    message: "Expected an absolute HTTP(S) URL",
  },
);
const BooleanStringSchema = z.preprocess(
  (value) => value ?? "false",
  z.enum(["true", "false"]).transform((value) => value === "true"),
);
const TrueBooleanStringSchema = z.preprocess(
  (value) => value ?? "true",
  z.enum(["true", "false"]).transform((value) => value === "true"),
);
const DurationSchema = z.string().regex(/^\d+[smhd]$/, {
  message: "Expected a duration such as 15m, 1h, or 30d",
});

const DEFAULT_JWT_SECRET = "replace-with-local-development-access-secret-32";
const DEFAULT_REFRESH_PEPPER = "replace-with-local-development-refresh-pepper-32";

export const ApiEnvSchema = z
  .object({
    AI_SERVICE_URL: HttpUrlSchema.default("http://localhost:8000"),
    ANALYSIS_CHECKPOINT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    ANALYSIS_GRAPH_VERSION: z.string().min(1).max(100).default("phase-6-v1"),
    ANALYSIS_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    ANALYSIS_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(660_000),
    ANALYSIS_MAX_CONCURRENT_PER_PROJECT: z.coerce.number().int().positive().default(2),
    ANALYSIS_MAX_CONCURRENT_PER_USER: z.coerce.number().int().positive().default(1),
    ANALYSIS_MAX_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
    ANALYSIS_MAX_EVIDENCE_PER_SPECIALIST: z.coerce.number().int().positive().max(50).default(8),
    ANALYSIS_MAX_RETRIEVAL_QUERIES: z.coerce.number().int().positive().max(20).default(5),
    ANALYSIS_MAX_REVISIONS: z.coerce.number().int().min(0).max(1).default(1),
    ANALYSIS_MAX_SPECIALISTS: z.coerce.number().int().positive().max(5).default(5),
    ANALYSIS_MAX_TOTAL_CONTEXT_TOKENS: z.coerce.number().int().positive().default(12_000),
    ANALYSIS_MAX_TOTAL_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8_000),
    ANALYSIS_MIN_QUALITY_SCORE: z.coerce.number().min(0).max(1).default(0.7),
    ANALYSIS_MIN_GROUNDING_SCORE: z.coerce.number().min(0).max(1).default(0.7),
    ANALYSIS_ALLOW_DEGRADED_REPORT: TrueBooleanStringSchema,
    ANALYSIS_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(2),
    ANALYSIS_QUEUE_NAME: z.string().min(1).default("analysis"),
    ANALYSIS_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    EXTERNAL_RESEARCH_ENABLED: BooleanStringSchema,
    EXTERNAL_RESEARCH_DEFAULT_MODE: z
      .enum(["INTERNAL_ONLY", "EXTERNAL_ONLY", "HYBRID"])
      .default("INTERNAL_ONLY"),
    RESEARCH_PROVIDER: z.enum(["fake", "brave"]).default("fake"),
    RESEARCH_API_KEY: z.string().max(1_000).default(""),
    RESEARCH_MAX_QUERIES: z.coerce.number().int().min(1).max(5).default(3),
    RESEARCH_RESULTS_PER_QUERY: z.coerce.number().int().min(1).max(20).default(5),
    RESEARCH_MAX_FETCHED_PAGES: z.coerce.number().int().min(1).max(20).default(5),
    RESEARCH_MAX_PAGE_BYTES: z.coerce.number().int().min(1_024).max(5_000_000).default(500_000),
    RESEARCH_MAX_TOTAL_BYTES: z.coerce.number().int().min(1_024).max(20_000_000).default(2_000_000),
    RESEARCH_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
    RESEARCH_FETCH_TIMEOUT_SECONDS: z.coerce.number().positive().max(60).default(10),
    RESEARCH_TOTAL_TIMEOUT_SECONDS: z.coerce.number().positive().max(300).default(60),
    RESEARCH_MAX_CONTEXT_TOKENS: z.coerce.number().int().min(256).max(100_000).default(4_000),
    RESEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    RESEARCH_POLICY_VERSION: z.string().min(1).max(100).default("phase-6-v1"),
    RESEARCH_ALLOWED_SCHEMES: z.string().default("http,https"),
    RESEARCH_ALLOWED_CONTENT_TYPES: z
      .string()
      .default("text/html,text/plain,application/xhtml+xml"),
    RESEARCH_BLOCK_PRIVATE_NETWORKS: TrueBooleanStringSchema,
    RESEARCH_DOMAIN_ALLOWLIST: z.string().default(""),
    RESEARCH_DOMAIN_DENYLIST: z.string().default(""),
    RESEARCH_QUEUE_NAME: z.string().min(1).default("external-research"),
    RESEARCH_QUEUE_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
    RESEARCH_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    RESEARCH_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    EXPERIMENT_QUEUE_NAME: z.string().min(1).default("experiments"),
    EXPERIMENT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().max(20).default(1),
    EXPERIMENT_MAX_VARIANTS: z.coerce.number().int().min(1).max(8).default(4),
    EXPERIMENT_MAX_CASES: z.coerce.number().int().min(1).max(50).default(10),
    EXPERIMENT_MAX_REPETITIONS: z.coerce.number().int().min(1).max(5).default(3),
    EXPERIMENT_MAX_RUNS: z.coerce.number().int().min(1).max(200).default(100),
    EXPERIMENT_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
    EXPERIMENT_MAX_ESTIMATED_COST: z.coerce.number().nonnegative().default(25),
    EVALUATION_RUBRIC_VERSION: z.string().min(1).max(100).default("phase-6-v1"),
    EVALUATION_LLM_JUDGE_ENABLED: BooleanStringSchema,
    EVALUATION_LLM_JUDGE_PROVIDER: z.string().min(1).max(100).default("disabled"),
    EVALUATION_LLM_JUDGE_MODEL: z.string().min(1).max(200).default("disabled"),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_COOKIE_NAME: z.string().min(1).default("dip_refresh"),
    AUTH_COOKIE_SAME_SITE: SameSiteSchema.default("lax"),
    AUTH_COOKIE_SECURE: BooleanStringSchema,
    AUTH_LOGIN_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(10),
    AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_REFRESH_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(30),
    AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_REGISTER_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(5),
    AUTH_REGISTER_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    BODY_LIMIT: z.string().default("1mb"),
    BULLMQ_CONNECTION_URL: z.string().url().default("redis://localhost:6379/1"),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    DOCUMENT_ALLOWED_EXTENSIONS: z.string().default("pdf,docx,txt,md,markdown,html,htm"),
    DOCUMENT_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25_000_000),
    INGESTION_INTERNAL_SECRET: z
      .string()
      .min(32)
      .default("replace-with-local-development-ingestion-secret-32"),
    INGESTION_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    DATABASE_URL: z
      .string()
      .url()
      .default("postgresql://dip_user:dip_password@localhost:5432/dip?schema=public"),
    JWT_ACCESS_SECRET: z.string().min(32).default(DEFAULT_JWT_SECRET),
    JWT_ACCESS_TTL: DurationSchema.default("15m"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    NODE_ENV: EnvironmentSchema.default("development"),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(8),
    PORT: z.coerce.number().int().positive().default(3001),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    REDIS_URL: z.string().url().default("redis://localhost:6379/0"),
    MINIO_ACCESS_KEY: z.string().min(3).default("dip_minio"),
    MINIO_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .default("dip-documents"),
    MINIO_ENDPOINT: HttpUrlSchema.default("http://localhost:9000"),
    MINIO_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    MINIO_SECRET_KEY: z.string().min(8).default("dip_minio_password"),
    REFRESH_TOKEN_PEPPER: z.string().min(32).default(DEFAULT_REFRESH_PEPPER),
    REFRESH_TOKEN_TTL: DurationSchema.default("30d"),
    SERVICE_NAME: z.string().min(1).default("api"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && !env.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        message: "AUTH_COOKIE_SECURE must be true in production",
        path: ["AUTH_COOKIE_SECURE"],
      });
    }

    if (env.AUTH_COOKIE_SAME_SITE === "none" && !env.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        message: "AUTH_COOKIE_SECURE must be true when SameSite=None",
        path: ["AUTH_COOKIE_SECURE"],
      });
    }

    if (env.NODE_ENV === "production" && env.JWT_ACCESS_SECRET === DEFAULT_JWT_SECRET) {
      context.addIssue({
        code: "custom",
        message: "JWT_ACCESS_SECRET must be replaced in production",
        path: ["JWT_ACCESS_SECRET"],
      });
    }

    if (env.NODE_ENV === "production" && env.REFRESH_TOKEN_PEPPER === DEFAULT_REFRESH_PEPPER) {
      context.addIssue({
        code: "custom",
        message: "REFRESH_TOKEN_PEPPER must be replaced in production",
        path: ["REFRESH_TOKEN_PEPPER"],
      });
    }

    if (
      env.EXTERNAL_RESEARCH_ENABLED &&
      env.RESEARCH_PROVIDER === "brave" &&
      !env.RESEARCH_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        message: "RESEARCH_API_KEY is required when the Brave provider is enabled",
        path: ["RESEARCH_API_KEY"],
      });
    }
  });

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function validateApiEnv(config: Record<string, unknown>): ApiEnv {
  return ApiEnvSchema.parse(config);
}

export function loadApiEnv(): ApiEnv {
  return validateApiEnv(process.env);
}

export function loadCorsOrigins(env: Pick<ApiEnv, "CORS_ORIGINS">): string[] {
  return splitCsv(env.CORS_ORIGINS, ["http://localhost:3000"]);
}
