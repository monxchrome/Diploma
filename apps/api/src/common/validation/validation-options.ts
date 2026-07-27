import type { ValidationPipeOptions } from "@nestjs/common";

export const validationPipeOptions: ValidationPipeOptions = {
  forbidNonWhitelisted: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  transform: true,
  whitelist: true,
};
