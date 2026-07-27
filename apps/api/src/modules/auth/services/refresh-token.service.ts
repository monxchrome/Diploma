import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { parseDurationSeconds } from "./access-token.service";

export type CreatedRefreshToken = {
  expiresAt: Date;
  familyId: string;
  hash: string;
  sessionId: string;
  token: string;
};

export type ParsedRefreshToken = {
  sessionId: string;
  token: string;
};

@Injectable()
export class RefreshTokenService {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  create(
    sessionId: string = randomUUID(),
    familyId: string = randomUUID(),
    now = new Date(),
  ): CreatedRefreshToken {
    const token = `${sessionId}.${randomBytes(48).toString("base64url")}`;
    const ttlSeconds = parseDurationSeconds(
      this.configService.getOrThrow<string>("auth.refreshTtl"),
    );

    return {
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      familyId,
      hash: this.hashToken(token),
      sessionId,
      token,
    };
  }

  parse(token: string): ParsedRefreshToken | null {
    const [sessionId, secret, extra] = token.split(".");

    if (!sessionId || !secret || extra) {
      return null;
    }

    return {
      sessionId,
      token,
    };
  }

  hashToken(token: string): string {
    return createHmac("sha256", this.configService.getOrThrow<string>("auth.refreshPepper"))
      .update(token)
      .digest("base64url");
  }

  hashIp(ip: string | undefined): string | null {
    if (!ip) {
      return null;
    }

    return createHmac("sha256", this.configService.getOrThrow<string>("auth.refreshPepper"))
      .update(ip)
      .digest("base64url");
  }

  matches(candidateHash: string, storedHash: string): boolean {
    const candidate = Buffer.from(candidateHash);
    const stored = Buffer.from(storedHash);

    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }

  getCookie(request: Request): string | null {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const cookieName = this.configService.getOrThrow<string>("auth.cookie.name");
    const pairs = cookieHeader.split(";");

    for (const pair of pairs) {
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (name === cookieName) {
        return decodeURIComponent(value);
      }
    }

    return null;
  }

  setCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.configService.getOrThrow<string>("auth.cookie.name"), token, {
      domain: this.configService.get<string | undefined>("auth.cookie.domain"),
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: this.configService.getOrThrow<"lax" | "none" | "strict">("auth.cookie.sameSite"),
      secure: this.configService.getOrThrow<boolean>("auth.cookie.secure"),
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.configService.getOrThrow<string>("auth.cookie.name"), {
      domain: this.configService.get<string | undefined>("auth.cookie.domain"),
      httpOnly: true,
      path: "/",
      sameSite: this.configService.getOrThrow<"lax" | "none" | "strict">("auth.cookie.sameSite"),
      secure: this.configService.getOrThrow<boolean>("auth.cookie.secure"),
    });
  }
}
