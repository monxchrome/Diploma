import type { BenchmarkAgentRole } from "../../generated/prisma/client";

export type BuiltInVariantTemplate = {
  architecture: "SINGLE_AGENT" | "HOMOGENEOUS_MULTI_AGENT" | "HETEROGENEOUS_MULTI_AGENT";
  code: string;
  description: string;
  roles: Array<{
    profileCode: "openai-default" | "anthropic-default" | "qwen-ollama-default";
    role: BenchmarkAgentRole;
  }>;
  title: string;
};

const multiAgentRoles: BenchmarkAgentRole[] = [
  "PLANNER",
  "MARKET_SPECIALIST",
  "FINANCE_SPECIALIST",
  "LEGAL_SPECIALIST",
  "RISK_SPECIALIST",
  "STRATEGY_SPECIALIST",
  "COORDINATOR",
  "CRITIC",
];

const homogeneous = (
  code: string,
  title: string,
  profileCode: "openai-default" | "anthropic-default" | "qwen-ollama-default",
): BuiltInVariantTemplate => ({
  architecture: "HOMOGENEOUS_MULTI_AGENT",
  code,
  description: `Pinned ${profileCode} assignment for every multi-agent role.`,
  roles: multiAgentRoles.map((role) => ({ profileCode, role })),
  title,
});

export const BUILT_IN_VARIANT_TEMPLATES: BuiltInVariantTemplate[] = [
  {
    architecture: "SINGLE_AGENT",
    code: "V1",
    description: "OpenAI single-agent baseline.",
    roles: [{ profileCode: "openai-default", role: "SINGLE_AGENT" }],
    title: "OpenAI Single",
  },
  homogeneous("V2", "OpenAI Homogeneous Multi-Agent", "openai-default"),
  {
    architecture: "SINGLE_AGENT",
    code: "V3",
    description: "Anthropic single-agent baseline.",
    roles: [{ profileCode: "anthropic-default", role: "SINGLE_AGENT" }],
    title: "Anthropic Single",
  },
  homogeneous("V4", "Anthropic Homogeneous Multi-Agent", "anthropic-default"),
  {
    architecture: "SINGLE_AGENT",
    code: "V5",
    description: "Qwen model family through the Ollama local runtime.",
    roles: [{ profileCode: "qwen-ollama-default", role: "SINGLE_AGENT" }],
    title: "Qwen Single via Ollama",
  },
  homogeneous("V6", "Qwen Homogeneous Multi-Agent via Ollama", "qwen-ollama-default"),
  {
    architecture: "HETEROGENEOUS_MULTI_AGENT",
    code: "V7",
    description: "Fixed heterogeneous cloud-provider assignment.",
    roles: [
      { profileCode: "openai-default", role: "PLANNER" },
      { profileCode: "anthropic-default", role: "MARKET_SPECIALIST" },
      { profileCode: "openai-default", role: "FINANCE_SPECIALIST" },
      { profileCode: "anthropic-default", role: "LEGAL_SPECIALIST" },
      { profileCode: "anthropic-default", role: "RISK_SPECIALIST" },
      { profileCode: "openai-default", role: "STRATEGY_SPECIALIST" },
      { profileCode: "openai-default", role: "COORDINATOR" },
      { profileCode: "anthropic-default", role: "CRITIC" },
    ],
    title: "Heterogeneous Cloud",
  },
  {
    architecture: "HETEROGENEOUS_MULTI_AGENT",
    code: "V8",
    description: "Fixed heterogeneous cloud and local Qwen assignment.",
    roles: [
      { profileCode: "openai-default", role: "PLANNER" },
      { profileCode: "qwen-ollama-default", role: "MARKET_SPECIALIST" },
      { profileCode: "openai-default", role: "FINANCE_SPECIALIST" },
      { profileCode: "anthropic-default", role: "LEGAL_SPECIALIST" },
      { profileCode: "qwen-ollama-default", role: "RISK_SPECIALIST" },
      { profileCode: "qwen-ollama-default", role: "STRATEGY_SPECIALIST" },
      { profileCode: "openai-default", role: "COORDINATOR" },
      { profileCode: "anthropic-default", role: "CRITIC" },
    ],
    title: "Heterogeneous Cloud + Local Qwen",
  },
  {
    architecture: "HETEROGENEOUS_MULTI_AGENT",
    code: "V9",
    description: "OpenAI generation roles with Anthropic independent critic.",
    roles: multiAgentRoles.map((role) => ({
      profileCode: role === "CRITIC" ? "anthropic-default" : "openai-default",
      role,
    })),
    title: "OpenAI Generation + Anthropic Critic",
  },
  {
    architecture: "HETEROGENEOUS_MULTI_AGENT",
    code: "V10",
    description: "Anthropic generation roles with OpenAI independent critic.",
    roles: multiAgentRoles.map((role) => ({
      profileCode: role === "CRITIC" ? "openai-default" : "anthropic-default",
      role,
    })),
    title: "Anthropic Generation + OpenAI Critic",
  },
];
