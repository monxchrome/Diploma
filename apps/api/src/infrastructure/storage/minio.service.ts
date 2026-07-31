import { createHash, createHmac } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

const algorithm = "AWS4-HMAC-SHA256";
const region = "us-east-1";
const service = "s3";

@Injectable()
export class MinioService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async objectExists(key: string): Promise<{ contentLength: number }> {
    const url = this.objectUrl(key);
    const headers = this.signHeaders("HEAD", url, "UNSIGNED-PAYLOAD");
    const response = await fetch(url, { headers, method: "HEAD" });
    if (response.status === 404) {
      return { contentLength: -1 };
    }
    if (!response.ok) {
      throw new ServiceUnavailableException("Object storage is unavailable");
    }
    return { contentLength: Number(response.headers.get("content-length") ?? -1) };
  }

  async removeObject(key: string): Promise<void> {
    const url = this.objectUrl(key);
    const headers = this.signHeaders("DELETE", url, "UNSIGNED-PAYLOAD");
    const response = await fetch(url, { headers, method: "DELETE" });
    if (response.status === 404 || response.ok) return;
    throw new ServiceUnavailableException("Object storage is unavailable");
  }

  createUploadUrl(
    key: string,
    contentType: string,
  ): { expiresAt: Date; requiredHeaders: Record<string, string>; uploadUrl: string } {
    const expiresIn = this.config.getOrThrow<number>("storage.presignTtlSeconds");
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const url = new URL(this.objectUrl(key));
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const credential = `${this.config.getOrThrow<string>("storage.accessKey")}/${scope}`;
    const requiredHeaders = { "content-type": contentType };
    url.searchParams.set("X-Amz-Algorithm", algorithm);
    url.searchParams.set("X-Amz-Credential", credential);
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");
    const canonicalRequest = [
      "PUT",
      url.pathname,
      canonicalQuery(url),
      `content-type:${contentType}\nhost:${url.host}\n`,
      "content-type;host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const signature = this.signature(dateStamp, scope, canonicalRequest, amzDate);
    url.searchParams.set("X-Amz-Signature", signature);
    return { expiresAt, requiredHeaders, uploadUrl: url.toString() };
  }

  private objectUrl(key: string): string {
    const endpoint = this.config.getOrThrow<string>("storage.endpoint").replace(/\/$/, "");
    return `${endpoint}/${this.config.getOrThrow<string>("storage.bucket")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private signHeaders(method: string, rawUrl: string, payloadHash: string): Record<string, string> {
    const url = new URL(rawUrl);
    const amzDate = formatAmzDate(new Date());
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonical = [
      method,
      url.pathname,
      "",
      `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      "host;x-amz-content-sha256;x-amz-date",
      payloadHash,
    ].join("\n");
    return {
      Authorization: `${algorithm} Credential=${this.config.getOrThrow<string>("storage.accessKey")}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${this.signature(dateStamp, scope, canonical, amzDate)}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
  }

  private signature(
    dateStamp: string,
    scope: string,
    canonicalRequest: string,
    amzDate: string,
  ): string {
    const stringToSign = [algorithm, amzDate, scope, sha256(canonicalRequest)].join("\n");
    const secret = this.config.getOrThrow<string>("storage.secretKey");
    const kDate = hmac(`AWS4${secret}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(hmac(kService, "aws4_request"), stringToSign).toString("hex");
  }
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}
function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
