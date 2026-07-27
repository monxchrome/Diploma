import { createHmac, timingSafeEqual } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import { ErrorCodes } from "../../../common/errors/error-codes";
import type { User } from "../../../generated/prisma/client";

const JwtHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT"),
});

const AccessTokenPayloadSchema = z.object({
  email: z.string().email(),
  exp: z.number().int(),
  iat: z.number().int(),
  role: z.enum(["USER", "ADMIN"]),
  sid: z.string().uuid(),
  sub: z.string().uuid(),
});

export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

@Injectable()
export class AccessTokenService {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  sign(user: User, sessionId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = parseDurationSeconds(
      this.configService.getOrThrow<string>("auth.accessTtl"),
    );
    const payload: AccessTokenPayload = {
      email: user.email,
      exp: now + ttlSeconds,
      iat: now,
      role: user.globalRole,
      sid: sessionId,
      sub: user.id,
    };
    const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
    const body = encodeBase64Url(payload);
    const signature = this.signPart(`${header}.${body}`);

    return `${header}.${body}.${signature}`;
  }

  verify(token: string): AccessTokenPayload {
    return verifyAccessToken(token, this.configService.getOrThrow<string>("auth.accessSecret"));
  }

  private signPart(value: string): string {
    return signJwtPart(value, this.configService.getOrThrow<string>("auth.accessSecret"));
  }
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw unauthorized();
  }

  const [headerPart, payloadPart, signature] = parts;

  if (!headerPart || !payloadPart || !signature) {
    throw unauthorized();
  }

  const expectedSignature = signJwtPart(`${headerPart}.${payloadPart}`, secret);

  if (!safeEqual(signature, expectedSignature)) {
    throw unauthorized();
  }

  const decodedHeader = decodeBase64UrlJson(headerPart);
  const decodedPayload = decodeBase64UrlJson(payloadPart);

  if (!decodedHeader.success || !decodedPayload.success) {
    throw unauthorized();
  }

  const parsedHeader = JwtHeaderSchema.safeParse(decodedHeader.value);
  const parsedPayload = AccessTokenPayloadSchema.safeParse(decodedPayload.value);

  if (!parsedHeader.success || !parsedPayload.success) {
    throw unauthorized();
  }

  const payload = parsedPayload.data;

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw unauthorized();
  }

  return payload;
}

export function parseDurationSeconds(value: string): number {
  const unit = value.at(-1);
  const amount = Number(value.slice(0, -1));

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Invalid duration: ${value}`);
  }

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 24 * 60 * 60;
    default:
      throw new Error(`Invalid duration unit: ${value}`);
  }
}

function signJwtPart(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCodes.Unauthorized,
    message: "Invalid access token",
  });
}

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

type DecodeResult = { success: true; value: unknown } | { success: false };

function decodeBase64UrlJson(value: string): DecodeResult {
  try {
    return {
      success: true,
      value: JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown,
    };
  } catch {
    return {
      success: false,
    };
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
