import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { VersionController } from "./version.controller";

describe("VersionController", () => {
  it("returns only safe release metadata", () => {
    const controller = new VersionController(
      new ConfigService({
        app: { environment: "test", version: "1.0.0" },
        release: {
          apiSchemaVersion: "v1",
          buildTimestamp: "2026-08-02T00:00:00.000Z",
          commitSha: "abc123",
          databaseSchemaVersion: "0011_phase_11_benchmarking",
          dirty: false,
          featureSetVersion: "phase-12",
        },
      }),
    );

    expect(controller.getVersion()).toEqual({
      apiSchemaVersion: "v1",
      buildTimestamp: "2026-08-02T00:00:00.000Z",
      commitSha: "abc123",
      databaseSchemaVersion: "0011_phase_11_benchmarking",
      dirty: false,
      environment: "test",
      featureSetVersion: "phase-12",
      version: "1.0.0",
    });
  });
});
