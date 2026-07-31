import {
  CreateExperimentRequestSchema,
  ExperimentCaseRequestSchema,
  ExperimentVariantRequestSchema,
  HumanEvaluationScoresSchema,
  type CreateExperimentRequest,
} from "@dip/contracts";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { ErrorCodes } from "../../../common/errors/error-codes";

const EvaluationRequestSchema = z.object({
  scores: HumanEvaluationScoresSchema,
  notes: z.string().trim().max(4_000).optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: ErrorCodes.ValidationError,
      message,
      details: result.error.flatten(),
    });
  }
  return result.data;
}

export function parseCreateExperiment(value: unknown): CreateExperimentRequest {
  return parse(CreateExperimentRequestSchema, value, "Experiment input is invalid");
}

export function parseExperimentVariant(value: unknown) {
  return parse(ExperimentVariantRequestSchema, value, "Experiment variant is invalid");
}

export function parseExperimentCase(value: unknown) {
  return parse(ExperimentCaseRequestSchema, value, "Experiment case is invalid");
}

export function parseHumanEvaluation(value: unknown) {
  return parse(EvaluationRequestSchema, value, "Human evaluation is invalid");
}
