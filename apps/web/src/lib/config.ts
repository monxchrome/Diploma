import { z } from "zod";

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_ENVIRONMENT: z
    .enum(["development", "test", "demo", "staging", "production"])
    .default("development"),
});

export type WebConfig = {
  apiBaseUrl: string;
  environment: "development" | "test" | "demo" | "staging" | "production";
};

export function getWebConfig(): WebConfig {
  const env = WebEnvSchema.parse(process.env);

  return {
    apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, ""),
    environment: env.NEXT_PUBLIC_ENVIRONMENT,
  };
}
