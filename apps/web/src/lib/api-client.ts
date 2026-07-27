import { ApiErrorSchema, ServiceStatusSchema, SystemStatusResponseSchema } from "@dip/contracts";
import type { z } from "zod";

export const WebSystemStatusResponseSchema = SystemStatusResponseSchema.extend({
  services: SystemStatusResponseSchema.shape.services.extend({
    web: ServiceStatusSchema,
  }),
});

export type WebSystemStatusResponse = z.infer<typeof WebSystemStatusResponseSchema>;

export async function fetchSystemStatus(): Promise<WebSystemStatusResponse> {
  const response = await fetch("/api/status", {
    cache: "no-store",
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.error.message : "Unable to fetch status");
  }

  return WebSystemStatusResponseSchema.parse(payload);
}
