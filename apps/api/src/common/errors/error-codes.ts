export const ErrorCodes = {
  AccessDenied: "ACCESS_DENIED",
  DuplicateResource: "DUPLICATE_RESOURCE",
  ExternalServiceError: "EXTERNAL_SERVICE_ERROR",
  InvalidCredentials: "INVALID_CREDENTIALS",
  InternalServerError: "INTERNAL_SERVER_ERROR",
  NotFound: "NOT_FOUND",
  SessionInvalid: "SESSION_INVALID",
  Unauthorized: "UNAUTHORIZED",
  ValidationError: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
