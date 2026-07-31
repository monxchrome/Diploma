from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EvidenceMode = Literal["INTERNAL_ONLY", "EXTERNAL_ONLY", "HYBRID"]
ResearchStatus = Literal[
    "QUEUED",
    "PLANNING",
    "SEARCHING",
    "FETCHING",
    "EXTRACTING",
    "COMPLETED",
    "COMPLETED_WITH_LIMITATIONS",
    "FAILED",
    "CANCELLED",
]


class ResearchPolicy(BaseModel):
    enabled: bool
    policy_version: str = Field(alias="policyVersion", min_length=1, max_length=100)
    provider: str = Field(min_length=1, max_length=50)
    maximum_queries: int = Field(alias="maximumQueries", ge=1, le=5)
    maximum_results_per_query: int = Field(alias="maximumResultsPerQuery", ge=1, le=20)
    maximum_fetched_pages: int = Field(alias="maximumFetchedPages", ge=1, le=20)
    maximum_page_bytes: int = Field(alias="maximumPageBytes", ge=1_024, le=5_000_000)
    maximum_total_bytes: int = Field(alias="maximumTotalBytes", ge=1_024, le=20_000_000)
    maximum_context_tokens: int = Field(alias="maximumContextTokens", ge=256, le=100_000)
    total_timeout_seconds: float = Field(alias="totalTimeoutSeconds", gt=0, le=300)
    allowed_schemes: list[Literal["http", "https"]] = Field(alias="allowedSchemes")
    allowed_content_types: list[str] = Field(alias="allowedContentTypes", min_length=1)
    block_private_networks: bool = Field(alias="blockPrivateNetworks")
    domain_allowlist: list[str] = Field(default_factory=list, alias="domainAllowlist")
    domain_denylist: list[str] = Field(default_factory=list, alias="domainDenylist")
    failure_mode: Literal["LIMITATION", "FAIL_CLOSED"] = Field(alias="failureMode")

    model_config = ConfigDict(populate_by_name=True)


class ResearchExecutionRequest(BaseModel):
    research_run_id: str = Field(alias="researchRunId")
    analysis_run_id: str = Field(alias="analysisRunId")
    project_id: str = Field(alias="projectId")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    evidence_mode: EvidenceMode = Field(alias="evidenceMode")
    decision_question: str = Field(alias="decisionQuestion", min_length=1, max_length=4_000)
    evidence_gaps: list[str] = Field(default_factory=list, alias="evidenceGaps", max_length=10)
    research_country: str | None = Field(default=None, alias="researchCountry", max_length=2)
    research_languages: list[str] = Field(
        default_factory=list, alias="researchLanguages", max_length=10
    )
    published_after: datetime | None = Field(default=None, alias="publishedAfter")
    published_before: datetime | None = Field(default=None, alias="publishedBefore")
    preferred_domains: list[str] = Field(
        default_factory=list, alias="preferredDomains", max_length=30
    )
    excluded_domains: list[str] = Field(
        default_factory=list, alias="excludedDomains", max_length=30
    )
    source_types: list[str] = Field(default_factory=list, alias="sourceTypes", max_length=8)
    maximum_external_sources: int | None = Field(
        default=None, alias="maximumExternalSources", ge=1, le=20
    )
    policy: ResearchPolicy

    model_config = ConfigDict(populate_by_name=True)


class ResearchPlan(BaseModel):
    research_required: bool = Field(alias="researchRequired")
    research_objective: str = Field(alias="researchObjective", max_length=1_000)
    evidence_gaps: list[str] = Field(alias="evidenceGaps", max_length=10)
    search_queries: list[str] = Field(alias="searchQueries", max_length=5)
    expected_source_types: list[str] = Field(alias="expectedSourceTypes", max_length=8)
    preferred_domains: list[str] = Field(alias="preferredDomains", max_length=30)
    freshness_requirement: str = Field(alias="freshnessRequirement", max_length=200)
    country: str | None
    languages: list[str] = Field(max_length=10)
    stop_conditions: list[str] = Field(alias="stopConditions", max_length=10)
    rationale_summary: str = Field(alias="rationaleSummary", max_length=1_000)

    model_config = ConfigDict(populate_by_name=True)


class SearchResult(BaseModel):
    title: str
    url: str
    displayed_url: str = Field(alias="displayedUrl")
    snippet: str
    provider_rank: int = Field(alias="providerRank", ge=1)
    published_at: datetime | None = Field(default=None, alias="publishedAt")
    source_type: str | None = Field(default=None, alias="sourceType")
    language: str | None = None
    provider_metadata: dict[str, object] = Field(default_factory=dict, alias="providerMetadata")

    model_config = ConfigDict(populate_by_name=True)


class ResearchQueryOutput(BaseModel):
    id: str
    query_index: int = Field(alias="queryIndex", ge=0)
    query: str
    purpose: str
    country: str | None
    languages: list[str]
    published_after: datetime | None = Field(alias="publishedAfter")
    published_before: datetime | None = Field(alias="publishedBefore")
    status: Literal["COMPLETED", "FAILED", "CANCELLED"]
    result_count: int = Field(alias="resultCount", ge=0)
    duration_ms: int | None = Field(alias="durationMs")
    error_code: str | None = Field(alias="errorCode")
    results: list[SearchResult] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class ResearchSourceOutput(BaseModel):
    id: str
    normalized_url: str = Field(alias="normalizedUrl")
    domain: str
    canonical_url: str | None = Field(default=None, alias="canonicalUrl")
    title: str
    publisher: str | None = None
    author: str | None = None
    source_type: str | None = Field(default=None, alias="sourceType")
    language: str | None = None
    pipeline_status: Literal[
        "SEARCH_RESULT_SELECTED_FOR_FETCH",
        "FETCHED",
        "EXTRACTED",
        "SECURITY_REJECTED",
        "ACCEPTED_AS_EVIDENCE",
    ] = Field(alias="pipelineStatus")
    prompt_injection_detected: bool = Field(alias="promptInjectionDetected")
    accepted_as_evidence: bool = Field(alias="acceptedAsEvidence")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    embedded_citation_ids_ignored: bool = Field(alias="embeddedCitationIdsIgnored")
    followed_embedded_urls: int = Field(alias="followedEmbeddedUrls", ge=0)
    exposed_secrets: bool = Field(alias="exposedSecrets")

    model_config = ConfigDict(populate_by_name=True)


class ResearchSnapshotOutput(BaseModel):
    id: str
    research_source_id: str = Field(alias="researchSourceId")
    content_hash: str = Field(alias="contentHash", min_length=64, max_length=64)
    fetch_status: Literal["FETCHED", "REJECTED", "FAILED"] = Field(alias="fetchStatus")
    http_status: int | None = Field(default=None, alias="httpStatus")
    content_type: str | None = Field(default=None, alias="contentType")
    published_at: datetime | None = Field(default=None, alias="publishedAt")
    retrieved_at: datetime = Field(alias="retrievedAt")
    extracted_title: str | None = Field(default=None, alias="extractedTitle")
    extracted_text: str = Field(alias="extractedText", max_length=20_000)
    extracted_metadata: dict[str, object] = Field(alias="extractedMetadata")
    credibility_assessment: dict[str, object] = Field(alias="credibilityAssessment")
    extraction_version: str = Field(alias="extractionVersion")
    fetch_duration_ms: int | None = Field(default=None, alias="fetchDurationMs")
    extracted_character_count: int = Field(alias="extractedCharacterCount", ge=0)
    warnings: list[str]
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")

    model_config = ConfigDict(populate_by_name=True)


class ExternalEvidenceOutput(BaseModel):
    evidence_id: str = Field(alias="evidenceId", pattern=r"^W[1-9]\d*$")
    research_source_id: str = Field(alias="researchSourceId")
    research_snapshot_id: str = Field(alias="researchSnapshotId")
    title: str
    publisher: str | None = None
    url: str
    source_type: str | None = Field(default=None, alias="sourceType")
    published_at: datetime | None = Field(default=None, alias="publishedAt")
    retrieved_at: datetime = Field(alias="retrievedAt")
    extracted_text: str = Field(alias="extractedText", max_length=20_000)
    selected_excerpt: str = Field(alias="selectedExcerpt", min_length=1, max_length=4_000)
    relevance_score: float | None = Field(default=None, alias="relevanceScore", ge=0, le=1)
    credibility_assessment: dict[str, object] = Field(alias="credibilityAssessment")
    freshness_status: str = Field(alias="freshnessStatus")
    query_ids: list[str] = Field(alias="queryIds")
    content_hash: str = Field(alias="contentHash", min_length=64, max_length=64)
    warnings: list[str]

    model_config = ConfigDict(populate_by_name=True)


class ResearchExecutionResponse(BaseModel):
    status: ResearchStatus
    plan: ResearchPlan
    queries: list[ResearchQueryOutput]
    sources: list[ResearchSourceOutput]
    snapshots: list[ResearchSnapshotOutput]
    external_evidence: list[ExternalEvidenceOutput] = Field(alias="externalEvidence")
    total_fetched_bytes: int = Field(alias="totalFetchedBytes", ge=0)
    total_extracted_characters: int = Field(alias="totalExtractedCharacters", ge=0)
    total_duration_ms: int = Field(alias="totalDurationMs", ge=0)
    search_duration_ms: int = Field(alias="searchDurationMs", ge=0)
    fetch_duration_ms: int = Field(alias="fetchDurationMs", ge=0)
    extraction_duration_ms: int = Field(alias="extractionDurationMs", ge=0)
    warnings: list[str]
    failure_code: str | None = Field(default=None, alias="failureCode")
    failure_message: str | None = Field(default=None, alias="failureMessage")

    model_config = ConfigDict(populate_by_name=True)
