import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type Redis from "ioredis";

import { ErrorCodes } from "../errors/error-codes";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.constants";

type RateLimitPolicy = { limit: number; name: string; windowSeconds: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.getOrThrow<boolean>("rateLimit.enabled")) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const policy = this.policyFor(request);
    if (!policy) return true;
    const subject = requestSubject(request);
    const projectId = projectFromPath(request.path);
    const bucket = Math.floor(Date.now() / (policy.windowSeconds * 1_000));
    const key = `rate-limit:${this.config.getOrThrow<string>("rateLimit.policyVersion")}:${policy.name}:${subject}:${projectId ?? "none"}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, policy.windowSeconds);
    const ttl = Math.max(await this.redis.ttl(key), 0);
    response.setHeader("RateLimit-Limit", policy.limit);
    response.setHeader("RateLimit-Remaining", Math.max(policy.limit - count, 0));
    response.setHeader("RateLimit-Reset", Math.ceil((Date.now() + ttl * 1_000) / 1_000));
    if (count <= policy.limit) return true;
    response.setHeader("Retry-After", ttl || policy.windowSeconds);
    throw new HttpException(
      {
        code: ErrorCodes.RateLimited,
        message: "Rate limit exceeded. Please retry after the indicated delay.",
        retryAfter: ttl || policy.windowSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private policyFor(request: Request): RateLimitPolicy | null {
    const path = request.path;
    if (
      path.startsWith("/api/health") ||
      path.startsWith("/api/system") ||
      path.startsWith("/docs")
    )
      return null;
    if (path.startsWith("/api/webhooks/"))
      return this.perMinute("webhook", "rateLimit.webhookPerMinute");
    if (path.startsWith("/api/auth/"))
      return this.perMinute("authentication", "rateLimit.authPerMinute");
    if (path.includes("/billing/checkout") || path.includes("/billing/portal"))
      return this.perMinute("billing", "rateLimit.apiWritePerMinute");
    if (path.includes("upload-intent") || path.includes("complete-upload"))
      return this.perHour("upload", "rateLimit.uploadPerHour");
    if (path.includes("/analyses")) return this.perHour("analysis", "rateLimit.analysisPerHour");
    if (path.includes("/experiments")) {
      return path.includes("export.")
        ? this.perHour("export", "rateLimit.exportPerHour")
        : this.perHour("experiments", "rateLimit.experimentPerHour");
    }
    return request.method === "GET" || request.method === "HEAD"
      ? this.perMinute("api-read", "rateLimit.apiReadPerMinute")
      : this.perMinute("api-write", "rateLimit.apiWritePerMinute");
  }

  private perMinute(name: string, path: string): RateLimitPolicy {
    return { limit: this.config.getOrThrow<number>(path), name, windowSeconds: 60 };
  }

  private perHour(name: string, path: string): RateLimitPolicy {
    return { limit: this.config.getOrThrow<number>(path), name, windowSeconds: 3_600 };
  }
}

function projectFromPath(path: string): string | null {
  return path.match(/\/projects\/([0-9a-f-]{36})/i)?.[1] ?? null;
}

function requestSubject(request: Request): string {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const payload = token?.split(".")[1];
  if (payload) {
    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        sub?: unknown;
      };
      if (typeof decoded.sub === "string" && /^[0-9a-f-]{36}$/i.test(decoded.sub))
        return `user:${decoded.sub}`;
    } catch {
      // The authorization guard remains the authority for token validity.
    }
  }
  return `ip:${request.ip || request.socket.remoteAddress || "unknown"}`;
}
