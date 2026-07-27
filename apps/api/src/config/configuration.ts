import { loadApiEnv, loadCorsOrigins } from "./env.schema";

export default function configuration() {
  const env = loadApiEnv();

  return {
    aiService: {
      ingestionSecret: env.INGESTION_INTERNAL_SECRET,
      ingestionTimeoutMs: env.INGESTION_TIMEOUT_MS,
      url: env.AI_SERVICE_URL,
    },
    app: {
      bodyLimit: env.BODY_LIMIT,
      environment: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      port: env.PORT,
      serviceName: env.SERVICE_NAME,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      cookie: {
        domain: env.AUTH_COOKIE_DOMAIN?.trim() ? env.AUTH_COOKIE_DOMAIN.trim() : undefined,
        name: env.AUTH_COOKIE_NAME,
        sameSite: env.AUTH_COOKIE_SAME_SITE,
        secure: env.AUTH_COOKIE_SECURE,
      },
      passwordMinLength: env.PASSWORD_MIN_LENGTH,
      refreshPepper: env.REFRESH_TOKEN_PEPPER,
      refreshTtl: env.REFRESH_TOKEN_TTL,
      throttles: {
        login: {
          limit: env.AUTH_LOGIN_RATE_LIMIT_LIMIT,
          ttlSeconds: env.AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS,
        },
        refresh: {
          limit: env.AUTH_REFRESH_RATE_LIMIT_LIMIT,
          ttlSeconds: env.AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS,
        },
        register: {
          limit: env.AUTH_REGISTER_RATE_LIMIT_LIMIT,
          ttlSeconds: env.AUTH_REGISTER_RATE_LIMIT_TTL_SECONDS,
        },
      },
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
    documents: {
      allowedExtensions: env.DOCUMENT_ALLOWED_EXTENSIONS.split(",").map((extension) =>
        extension.trim().toLowerCase(),
      ),
      maxUploadBytes: env.DOCUMENT_MAX_UPLOAD_BYTES,
    },
    storage: {
      accessKey: env.MINIO_ACCESS_KEY,
      bucket: env.MINIO_BUCKET,
      endpoint: env.MINIO_ENDPOINT,
      presignTtlSeconds: env.MINIO_PRESIGN_TTL_SECONDS,
      secretKey: env.MINIO_SECRET_KEY,
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
