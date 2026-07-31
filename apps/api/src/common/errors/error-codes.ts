export const ErrorCodes = {
  AccessDenied: "ACCESS_DENIED",
  BillingUnavailable: "BILLING_UNAVAILABLE",
  DuplicateResource: "DUPLICATE_RESOURCE",
  ExternalServiceError: "EXTERNAL_SERVICE_ERROR",
  InvalidCredentials: "INVALID_CREDENTIALS",
  InvalidWebhook: "INVALID_WEBHOOK",
  InvalidDocument: "INVALID_DOCUMENT",
  UploadNotFound: "UPLOAD_NOT_FOUND",
  InternalServerError: "INTERNAL_SERVER_ERROR",
  NotFound: "NOT_FOUND",
  SessionInvalid: "SESSION_INVALID",
  QuotaExceeded: "QUOTA_EXCEEDED",
  RateLimited: "RATE_LIMITED",
  Unauthorized: "UNAUTHORIZED",
  ValidationError: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
