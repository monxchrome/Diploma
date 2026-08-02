import { describe, expect, it } from "vitest";

import { BUILT_IN_VARIANT_TEMPLATES } from "./benchmark-templates";

describe("BUILT_IN_VARIANT_TEMPLATES", () => {
  it("contains the fixed V1–V10 research matrix", () => {
    expect(BUILT_IN_VARIANT_TEMPLATES.map((template) => template.code)).toEqual([
      "V1",
      "V2",
      "V3",
      "V4",
      "V5",
      "V6",
      "V7",
      "V8",
      "V9",
      "V10",
    ]);
    expect(
      BUILT_IN_VARIANT_TEMPLATES.find((template) => template.code === "V8")?.roles,
    ).toContainEqual({
      profileCode: "qwen-ollama-default",
      role: "RISK_SPECIALIST",
    });
  });
});
