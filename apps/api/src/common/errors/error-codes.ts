export const ErrorCodes = {
  ExternalServiceError: "EXTERNAL_SERVICE_ERROR",
  InternalServerError: "INTERNAL_SERVER_ERROR",
  ValidationError: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
