import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";
import type { HealthService } from "./health.service";

describe("HealthController", () => {
  it("returns live health", () => {
    const configService = new ConfigService({
      app: {
        environment: "test",
        serviceName: "api",
      },
    });
    const healthService = {
      getReadiness: () => Promise.resolve("ok" as const),
    } satisfies Partial<HealthService>;
    const controller = new HealthController(configService, healthService as HealthService);

    expect(controller.getLive()).toMatchObject({
      environment: "test",
      service: "api",
      status: "ok",
    });
  });
});
