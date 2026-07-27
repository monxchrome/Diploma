import { z } from "zod";

export const ServiceStatusSchema = z.enum(["ok", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const HealthResponseSchema = z.object({
  environment: z.string(),
  service: z.string(),
  status: ServiceStatusSchema,
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AiEchoRequestSchema = z.object({
  message: z.string().min(1).max(1024),
  requestId: z.string().min(1).max(128),
});
export type AiEchoRequest = z.infer<typeof AiEchoRequestSchema>;

export const AiEchoResponseSchema = z.object({
  message: z.string(),
  requestId: z.string(),
  service: z.literal("ai-service"),
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});
export type AiEchoResponse = z.infer<typeof AiEchoResponseSchema>;

export const SystemStatusResponseSchema = z.object({
  environment: z.string(),
  requestId: z.string(),
  services: z.object({
    api: ServiceStatusSchema,
    aiService: ServiceStatusSchema,
  }),
  timestamp: z.string().datetime(),
});
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    path: z.string().optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AnalysisEventNameSchema = z.enum([
  "analysis.requested",
  "analysis.started",
  "analysis.completed",
  "analysis.failed",
]);
export type AnalysisEventName = z.infer<typeof AnalysisEventNameSchema>;
