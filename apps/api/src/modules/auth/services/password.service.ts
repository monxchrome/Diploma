import { randomBytes } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { argon2id, argon2Verify } from "hash-wasm";

import { ErrorCodes } from "../../../common/errors/error-codes";

@Injectable()
export class PasswordService {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  validatePasswordPolicy(password: string): void {
    const minLength = this.configService.getOrThrow<number>("auth.passwordMinLength");
    const checks = [
      password.length >= minLength,
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ];

    if (checks.some((passes) => !passes)) {
      throw new BadRequestException({
        code: ErrorCodes.ValidationError,
        message:
          "Password must meet the configured length and include lowercase, uppercase, number, and symbol characters",
      });
    }
  }

  async hashPassword(password: string): Promise<string> {
    return argon2id({
      hashLength: 32,
      iterations: 2,
      memorySize: 19_456,
      outputType: "encoded",
      parallelism: 1,
      password,
      salt: randomBytes(16),
    });
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return argon2Verify({
      hash: passwordHash,
      password,
    });
  }
}
