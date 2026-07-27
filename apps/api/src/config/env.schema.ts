import { splitCsv } from "@dip/config";
import { z } from "zod";

const EnvironmentSchema = z.enum(["development", "test", "staging", "production"]);
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

export const ApiEnvSchema = z.object({
  AI_SERVICE_URL: HttpUrlSchema.default("http://localhost:8000"),
  BODY_LIMIT: z.string().default("1mb"),
  BULLMQ_CONNECTION_URL: z.string().url().default("redis://localhost:6379/1"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://dip_user:dip_password@localhost:5432/dip?schema=public"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: EnvironmentSchema.default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  REDIS_URL: z.string().url().default("redis://localhost:6379/0"),
  SERVICE_NAME: z.string().min(1).default("api"),
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
