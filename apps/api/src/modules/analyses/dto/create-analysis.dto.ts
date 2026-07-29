import { CreateAnalysisRequestSchema, type CreateAnalysisRequest } from "@dip/contracts";
import { BadRequestException } from "@nestjs/common";

import { ErrorCodes } from "../../../common/errors/error-codes";

export function parseCreateAnalysis(value: unknown): CreateAnalysisRequest {
  const parsed = CreateAnalysisRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: ErrorCodes.ValidationError,
      message: "Analysis input is invalid",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}
