import { loadApiEnv, loadCorsOrigins } from "./env.schema";

export default function configuration() {
  const env = loadApiEnv();

  return {
    analysis: {
      checkpointRetentionDays: env.ANALYSIS_CHECKPOINT_RETENTION_DAYS,
      graphVersion: env.ANALYSIS_GRAPH_VERSION,
      jobAttempts: env.ANALYSIS_JOB_ATTEMPTS,
      jobTimeoutMs: env.ANALYSIS_JOB_TIMEOUT_MS,
      maxConcurrentPerProject: env.ANALYSIS_MAX_CONCURRENT_PER_PROJECT,
      maxConcurrentPerUser: env.ANALYSIS_MAX_CONCURRENT_PER_USER,
      maxDurationSeconds: env.ANALYSIS_MAX_DURATION_SECONDS,
      maxEvidencePerSpecialist: env.ANALYSIS_MAX_EVIDENCE_PER_SPECIALIST,
      maxRetrievalQueries: env.ANALYSIS_MAX_RETRIEVAL_QUERIES,
      maxRevisions: env.ANALYSIS_MAX_REVISIONS,
      maxSpecialists: env.ANALYSIS_MAX_SPECIALISTS,
      maxTotalContextTokens: env.ANALYSIS_MAX_TOTAL_CONTEXT_TOKENS,
      maxTotalOutputTokens: env.ANALYSIS_MAX_TOTAL_OUTPUT_TOKENS,
      minQualityScore: env.ANALYSIS_MIN_QUALITY_SCORE,
      minGroundingScore: env.ANALYSIS_MIN_GROUNDING_SCORE,
      allowDegradedReport: env.ANALYSIS_ALLOW_DEGRADED_REPORT,
      queueConcurrency: env.ANALYSIS_QUEUE_CONCURRENCY,
      queueName: env.ANALYSIS_QUEUE_NAME,
      rateLimit: env.ANALYSIS_RATE_LIMIT,
    },
    research: {
      enabled: env.EXTERNAL_RESEARCH_ENABLED,
      defaultMode: env.EXTERNAL_RESEARCH_DEFAULT_MODE,
      provider: env.RESEARCH_PROVIDER,
      maximumQueries: env.RESEARCH_MAX_QUERIES,
      maximumResultsPerQuery: env.RESEARCH_RESULTS_PER_QUERY,
      maximumFetchedPages: env.RESEARCH_MAX_FETCHED_PAGES,
      maximumPageBytes: env.RESEARCH_MAX_PAGE_BYTES,
      maximumTotalBytes: env.RESEARCH_MAX_TOTAL_BYTES,
      maximumRedirects: env.RESEARCH_MAX_REDIRECTS,
      fetchTimeoutSeconds: env.RESEARCH_FETCH_TIMEOUT_SECONDS,
      totalTimeoutSeconds: env.RESEARCH_TOTAL_TIMEOUT_SECONDS,
      maximumContextTokens: env.RESEARCH_MAX_CONTEXT_TOKENS,
      cacheTtlSeconds: env.RESEARCH_CACHE_TTL_SECONDS,
      policyVersion: env.RESEARCH_POLICY_VERSION,
      allowedSchemes: env.RESEARCH_ALLOWED_SCHEMES.split(",").map((value) => value.trim()),
      allowedContentTypes: env.RESEARCH_ALLOWED_CONTENT_TYPES.split(",").map((value) =>
        value.trim(),
      ),
      blockPrivateNetworks: env.RESEARCH_BLOCK_PRIVATE_NETWORKS,
      domainAllowlist: env.RESEARCH_DOMAIN_ALLOWLIST.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      domainDenylist: env.RESEARCH_DOMAIN_DENYLIST.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      queueName: env.RESEARCH_QUEUE_NAME,
      queueConcurrency: env.RESEARCH_QUEUE_CONCURRENCY,
      jobAttempts: env.RESEARCH_JOB_ATTEMPTS,
      jobTimeoutMs: env.RESEARCH_JOB_TIMEOUT_MS,
    },
    experiments: {
      queueName: env.EXPERIMENT_QUEUE_NAME,
      queueConcurrency: env.EXPERIMENT_QUEUE_CONCURRENCY,
      maximumVariants: env.EXPERIMENT_MAX_VARIANTS,
      maximumCases: env.EXPERIMENT_MAX_CASES,
      maximumRepetitions: env.EXPERIMENT_MAX_REPETITIONS,
      maximumRuns: env.EXPERIMENT_MAX_RUNS,
      jobTimeoutMs: env.EXPERIMENT_JOB_TIMEOUT_MS,
      maximumEstimatedCost: env.EXPERIMENT_MAX_ESTIMATED_COST,
      rubricVersion: env.EVALUATION_RUBRIC_VERSION,
      llmJudge: {
        enabled: env.EVALUATION_LLM_JUDGE_ENABLED,
        provider: env.EVALUATION_LLM_JUDGE_PROVIDER,
        model: env.EVALUATION_LLM_JUDGE_MODEL,
      },
    },
    aiService: {
      ingestionSecret: env.INGESTION_INTERNAL_SECRET,
      ingestionTimeoutMs: env.INGESTION_TIMEOUT_MS,
      url: env.AI_SERVICE_URL,
    },
    app: {
      baseUrl: env.APP_BASE_URL,
      bodyLimit: env.BODY_LIMIT,
      environment: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      port: env.PORT,
      serviceName: env.SERVICE_NAME,
      trustedProxyCount: env.TRUSTED_PROXY_COUNT,
      version: env.APP_VERSION,
      workerOnly: env.APP_WORKER_ONLY,
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
    csrf: {
      enabled: env.CSRF_ENABLED,
    },
    billing: {
      allowFakeInProductionUnsafe: env.BILLING_ALLOW_FAKE_IN_PRODUCTION_UNSAFE,
      currency: env.BILLING_CURRENCY,
      enabled: env.BILLING_ENABLED,
      fakeProviderEnabled: env.BILLING_FAKE_PROVIDER_ENABLED,
      fakeWebhookSecret: env.BILLING_FAKE_WEBHOOK_SECRET,
      planCatalogVersion: env.BILLING_PLAN_CATALOG_VERSION,
      provider: env.BILLING_PROVIDER,
      stripe: {
        cancelUrl: env.STRIPE_CANCEL_URL,
        portalReturnUrl: env.STRIPE_PORTAL_RETURN_URL,
        priceIds: { PRO: env.STRIPE_PRO_PRICE_ID, TEAM: env.STRIPE_TEAM_PRICE_ID },
        secretKey: env.STRIPE_SECRET_KEY,
        successUrl: env.STRIPE_SUCCESS_URL,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      },
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
      enabled: env.RATE_LIMIT_ENABLED,
      policyVersion: env.RATE_LIMIT_POLICY_VERSION,
      authPerMinute: env.RATE_LIMIT_AUTH_PER_MINUTE,
      apiReadPerMinute: env.RATE_LIMIT_API_READ_PER_MINUTE,
      apiWritePerMinute: env.RATE_LIMIT_API_WRITE_PER_MINUTE,
      analysisPerHour: env.RATE_LIMIT_ANALYSIS_PER_HOUR,
      experimentPerHour: env.RATE_LIMIT_EXPERIMENT_PER_HOUR,
      exportPerHour: env.RATE_LIMIT_EXPORT_PER_HOUR,
      limit: env.RATE_LIMIT_LIMIT,
      researchPerHour: env.RATE_LIMIT_RESEARCH_PER_HOUR,
      ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
      uploadPerHour: env.RATE_LIMIT_UPLOAD_PER_HOUR,
      webhookPerMinute: env.RATE_LIMIT_WEBHOOK_PER_MINUTE,
    },
    redis: {
      url: env.REDIS_URL,
    },
    services: {
      qdrantUrl: env.QDRANT_URL,
    },
    usage: {
      aggregationIntervalSeconds: env.USAGE_AGGREGATION_INTERVAL_SECONDS,
      billingPeriodTimezone: env.USAGE_BILLING_PERIOD_TIMEZONE,
      enabled: env.USAGE_METERING_ENABLED,
      reservationTtlSeconds: env.USAGE_RESERVATION_TTL_SECONDS,
    },
    webhooks: {
      bodyLimit: env.WEBHOOK_BODY_LIMIT,
    },
  };
}

export type ApiConfiguration = ReturnType<typeof configuration>;
