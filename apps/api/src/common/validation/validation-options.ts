import type { ValidationPipeOptions } from "@nestjs/common";

export const validationPipeOptions: ValidationPipeOptions = {
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
};
