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
const DurationSchema = z.string().regex(/^\d+[smhd]$/, {
  message: "Expected a duration such as 15m, 1h, or 30d",
});

const DEFAULT_JWT_SECRET = "replace-with-local-development-access-secret-32";
const DEFAULT_REFRESH_PEPPER = "replace-with-local-development-refresh-pepper-32";

export const ApiEnvSchema = z
  .object({
    AI_SERVICE_URL: HttpUrlSchema.default("http://localhost:8000"),
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
