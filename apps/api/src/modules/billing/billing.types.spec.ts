import { describe, expect, it } from "vitest";

import { EntitlementsSchema, PLAN_CATALOG } from "./billing.types";

describe("Phase 8 plan catalog", () => {
  it("contains validated FREE, PRO, and TEAM definitions without provider IDs", () => {
    for (const plan of Object.values(PLAN_CATALOG)) {
      expect(EntitlementsSchema.parse(plan.entitlements)).toEqual(plan.entitlements);
      expect(JSON.stringify(plan)).not.toContain("price_");
    }
  });

  it("does not make external research or experiments available on FREE", () => {
    expect(PLAN_CATALOG.FREE.entitlements.externalResearchAvailable).toBe(false);
    expect(PLAN_CATALOG.FREE.entitlements.experimentsAvailable).toBe(false);
  });
});
