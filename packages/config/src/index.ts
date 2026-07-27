import { z } from "zod";

export const EnvironmentNameSchema = z.enum(["development", "test", "staging", "production"]);
export type EnvironmentName = z.infer<typeof EnvironmentNameSchema>;

export const requestIdHeaderName = "x-request-id";

export function splitCsv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
