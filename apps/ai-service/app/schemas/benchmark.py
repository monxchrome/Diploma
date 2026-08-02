from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.infrastructure.model_providers import ModelProviderResult, TrustedModelProfile


class BenchmarkAssignment(BaseModel):
    role: Literal[
        "SINGLE_AGENT",
        "PLANNER",
        "MARKET_SPECIALIST",
        "FINANCE_SPECIALIST",
        "LEGAL_SPECIALIST",
        "RISK_SPECIALIST",
        "STRATEGY_SPECIALIST",
        "COORDINATOR",
        "CRITIC",
    ]
    model_profile: TrustedModelProfile = Field(alias="modelProfile")
    prompt_version_id: str = Field(alias="promptVersionId")
    prompt_hash: str = Field(alias="promptHash")
    temperature: float = Field(ge=0, le=2)
    top_p: float = Field(alias="topP", ge=0, le=1)
    max_output_tokens: int = Field(alias="maxOutputTokens", ge=1, le=16_000)
    seed: int | None = None
    timeout_seconds: float = Field(alias="timeoutSeconds", gt=0, le=600)
    enabled: bool = True
    order: int = Field(ge=0)

    model_config = ConfigDict(populate_by_name=True)


class BenchmarkCaseInput(BaseModel):
    code: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=8_000)
    scenario: str = Field(min_length=1, max_length=12_000)
    objectives: list[str] = Field(default_factory=list, max_length=30)
    constraints: list[str] = Field(default_factory=list, max_length=30)
    assumptions: list[str] = Field(default_factory=list, max_length=30)


class BenchmarkExecutionRequest(BaseModel):
    benchmark_run_id: str = Field(alias="benchmarkRunId")
    case_run_id: str = Field(alias="caseRunId")
    protocol: Literal["CONTROLLED_EVIDENCE", "END_TO_END"]
    case: BenchmarkCaseInput
    evidence_package: dict[str, object] = Field(alias="evidencePackage")
    assignments: list[BenchmarkAssignment] = Field(min_length=1, max_length=9)
    request_id: str = Field(alias="requestId")
    trace_id: str | None = Field(default=None, alias="traceId")

    model_config = ConfigDict(populate_by_name=True)


class BenchmarkDecisionOutput(BaseModel):
    recommendation: str = Field(min_length=1, max_length=6_000)
    rationale: str = Field(min_length=1, max_length=8_000)
    risks: list[str] = Field(default_factory=list, max_length=20)
    alternatives: list[str] = Field(default_factory=list, max_length=20)
    missing_information: list[str] = Field(
        default_factory=list, alias="missingInformation", max_length=20
    )
    citations: list[str] = Field(default_factory=list, max_length=100)
    confidence: Literal["LOW", "MEDIUM", "HIGH"]

    model_config = ConfigDict(populate_by_name=True)


class BenchmarkInvocationResponse(BaseModel):
    role: str
    sequence_index: int = Field(alias="sequenceIndex")
    prompt_version_id: str = Field(alias="promptVersionId")
    result: ModelProviderResult

    model_config = ConfigDict(populate_by_name=True)


class BenchmarkExecutionResponse(BaseModel):
    output: BenchmarkDecisionOutput
    draft: BenchmarkDecisionOutput | None = None
    critique: BenchmarkDecisionOutput | None = None
    invocations: list[BenchmarkInvocationResponse]
    metrics: dict[str, float | int | None]
    warnings: list[str] = Field(default_factory=list)
