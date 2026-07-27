import { loadApiEnv, loadCorsOrigins } from "./env.schema";

export default function configuration() {
  const env = loadApiEnv();

  return {
    aiService: {
      url: env.AI_SERVICE_URL,
    },
    app: {
      bodyLimit: env.BODY_LIMIT,
      environment: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      port: env.PORT,
      serviceName: env.SERVICE_NAME,
    },
    cors: {
      origins: loadCorsOrigins(env),
    },
    database: {
      url: env.DATABASE_URL,
    },
    queue: {
      connectionUrl: env.BULLMQ_CONNECTION_URL,
    },
    rateLimit: {
      limit: env.RATE_LIMIT_LIMIT,
      ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
    },
    redis: {
      url: env.REDIS_URL,
    },
  };
}

export type ApiConfiguration = ReturnType<typeof configuration>;
