from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.contracts import AiCitation, RetrievalEvidence

AnalysisMode = Literal["SINGLE_AGENT", "MULTI_AGENT"]
SpecialistType = Literal["MARKET", "FINANCIAL", "LEGAL_REGULATORY", "RISK", "STRATEGY"]


class AnalysisInput(BaseModel):
    analysis_id: str = Field(alias="analysisId")
    analysis_run_id: str = Field(alias="analysisRunId")
    thread_id: str = Field(alias="threadId")
    project_id: str = Field(alias="projectId")
    user_id: str = Field(alias="userId")
    request_id: str = Field(alias="requestId")
    graph_version: str = Field(alias="graphVersion")
    mode: AnalysisMode
    title: str = Field(min_length=1, max_length=200)
    question: str = Field(alias="decisionQuestion", min_length=1, max_length=4000)
    objectives: list[str] = Field(default_factory=list, max_length=20)
    constraints: list[str] = Field(default_factory=list, max_length=20)
    assumptions: list[str] = Field(default_factory=list, max_length=20)
    time_horizon: str | None = Field(default=None, alias="timeHorizon")
    target_market: str | None = Field(default=None, alias="targetMarket")
    currency: str | None = None
    authorized_knowledge_base_ids: list[str] = Field(
        alias="authorizedKnowledgeBaseIds", min_length=1
    )
    authorized_document_ids: list[str] = Field(default_factory=list, alias="authorizedDocumentIds")
    requested_specialists: list[SpecialistType] = Field(
        default_factory=list, alias="requestedSpecialists"
    )
    additional_context: str | None = Field(default=None, alias="additionalContext", max_length=4000)
    initial_retrieval_run_id: str = Field(alias="initialRetrievalRunId")
    initial_evidence: list[RetrievalEvidence] = Field(default_factory=list, alias="initialEvidence")

    model_config = ConfigDict(populate_by_name=True)


class AnalysisPlan(BaseModel):
    decision_type: str = Field(alias="decisionType")
    restated_question: str = Field(alias="restatedQuestion")
    sub_questions: list[str] = Field(alias="subQuestions")
    selected_specialists: list[str] = Field(alias="selectedSpecialists")
    specialist_tasks: dict[str, str] = Field(alias="specialistTasks")
    evidence_needs: list[str] = Field(alias="evidenceNeeds")
    required_report_sections: list[str] = Field(alias="requiredReportSections")
    known_constraints: list[str] = Field(alias="knownConstraints")
    expected_decision_criteria: list[str] = Field(alias="expectedDecisionCriteria")
    insufficient_evidence_risk: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        alias="insufficientEvidenceRisk"
    )
    rationale_summary: str = Field(alias="rationaleSummary", max_length=1000)

    model_config = ConfigDict(populate_by_name=True)


class PlannerModelOutput(BaseModel):
    decision_type: str = Field(alias="decisionType", min_length=1)
    restated_question: str = Field(alias="restatedQuestion", min_length=1)
    sub_questions: list[str] = Field(alias="subQuestions", min_length=1)
    market_task: str = Field(alias="marketTask", min_length=1)
    financial_task: str = Field(alias="financialTask", min_length=1)
    legal_regulatory_task: str = Field(alias="legalRegulatoryTask", min_length=1)
    risk_task: str = Field(alias="riskTask", min_length=1)
    strategy_task: str = Field(alias="strategyTask", min_length=1)
    evidence_needs: list[str] = Field(alias="evidenceNeeds", min_length=1)
    required_report_sections: list[str] = Field(alias="requiredReportSections", min_length=1)
    known_constraints: list[str] = Field(alias="knownConstraints")
    expected_decision_criteria: list[str] = Field(alias="expectedDecisionCriteria", min_length=1)
    insufficient_evidence_risk: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        alias="insufficientEvidenceRisk"
    )
    rationale_summary: str = Field(alias="rationaleSummary", min_length=1, max_length=1000)

    model_config = ConfigDict(populate_by_name=True)


class EvidenceReference(BaseModel):
    evidence_id: str = Field(alias="evidenceId", min_length=1)
    document_id: str = Field(alias="documentId", min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class MarketSpecialistOutput(BaseModel):
    summary: str = Field(min_length=1)
    pilot_assessment: str = Field(alias="pilotAssessment", min_length=1)
    demand_assessment: str = Field(alias="demandAssessment", min_length=1)
    competition_assessment: str = Field(alias="competitionAssessment", min_length=1)
    localization_assessment: str = Field(alias="localizationAssessment", min_length=1)
    expansion_conditions: list[str] = Field(alias="expansionConditions", min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")
    citations: list[EvidenceReference] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class FinancialSpecialistOutput(BaseModel):
    summary: str = Field(min_length=1)
    budget_eur: Literal[100_000] = Field(alias="budgetEur")
    marketing_budget_eur: Literal[25_000] = Field(alias="marketingBudgetEur")
    cac_target_eur: Literal[500] = Field(alias="cacTargetEur")
    pilot_success_customers: Literal[150] = Field(alias="pilotSuccessCustomers")
    break_even_customers: Literal[250] = Field(alias="breakEvenCustomers")
    mrr_target_eur: Literal[30_000] = Field(alias="mrrTargetEur")
    budget_assessment: str = Field(alias="budgetAssessment", min_length=1)
    marketing_assessment: str = Field(alias="marketingAssessment", min_length=1)
    cac_assessment: str = Field(alias="cacAssessment", min_length=1)
    pilot_success_assessment: str = Field(alias="pilotSuccessAssessment", min_length=1)
    break_even_assessment: str = Field(alias="breakEvenAssessment", min_length=1)
    mrr_assessment: str = Field(alias="mrrAssessment", min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")
    citations: list[EvidenceReference] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class LegalSpecialistOutput(BaseModel):
    summary: str = Field(min_length=1)
    gdpr: str = Field(min_length=1)
    consumer_protection: str = Field(alias="consumerProtection", min_length=1)
    employment_rules: str = Field(alias="employmentRules", min_length=1)
    tax_obligations: str = Field(alias="taxObligations", min_length=1)
    professional_limitations: str = Field(alias="professionalLimitations", min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")
    citations: list[EvidenceReference] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class StrategyAlternative(BaseModel):
    option: str = Field(min_length=1)
    assessment: str = Field(min_length=1)
    conditions: list[str] = Field(default_factory=list)


class StrategySpecialistOutput(BaseModel):
    summary: str = Field(min_length=1)
    immediate_nationwide: StrategyAlternative = Field(alias="immediateNationwide")
    staged_barcelona_to_madrid: StrategyAlternative = Field(alias="stagedBarcelonaToMadrid")
    extended_pilot: StrategyAlternative = Field(alias="extendedPilot")
    postponed_expansion: StrategyAlternative = Field(alias="postponedExpansion")
    recommended_option: str = Field(alias="recommendedOption", min_length=1)
    recommendation_rationale: str = Field(alias="recommendationRationale", min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")
    citations: list[EvidenceReference] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class ReportSection(BaseModel):
    title: str
    content: str


class RiskModelItem(BaseModel):
    risk: str
    category: str
    likelihood: Literal["LOW", "MEDIUM", "HIGH"]
    impact: Literal["LOW", "MEDIUM", "HIGH"]
    mitigation: str
    mitigation_basis: Literal["EVIDENCE_BACKED", "ANALYTICAL_RECOMMENDATION"] = Field(
        alias="mitigationBasis"
    )
    residual_risk: Literal["LOW", "MEDIUM", "HIGH"] = Field(alias="residualRisk")
    uncertainty: str = Field(min_length=1)
    citations: list[EvidenceReference] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class RiskSpecialistOutput(BaseModel):
    summary: str = Field(min_length=1)
    risks: list[RiskModelItem] = Field(min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")
    citations: list[EvidenceReference] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class RiskItem(BaseModel):
    risk: str
    category: str
    likelihood: Literal["LOW", "MEDIUM", "HIGH"]
    impact: Literal["LOW", "MEDIUM", "HIGH"]
    mitigation: str
    mitigation_basis: Literal["EVIDENCE_BACKED", "ANALYTICAL_RECOMMENDATION"] = Field(
        alias="mitigationBasis"
    )
    residual_risk: Literal["LOW", "MEDIUM", "HIGH"] = Field(alias="residualRisk")
    uncertainty: str = Field(min_length=1)
    citations: list[AiCitation] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class SpecialistResult(BaseModel):
    specialist: SpecialistType
    status: Literal["COMPLETED", "DEGRADED", "FAILED", "SKIPPED"]
    summary: str
    findings: list[str]
    assumptions: list[str]
    uncertainties: list[str] = Field(alias="uncertainties")
    missing_information: list[str] = Field(alias="missingInformation")
    citations: list[AiCitation]
    risk_register: list[RiskItem] = Field(default_factory=list, alias="riskRegister")
    alternatives: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class ConditionalRecommendationDecision(BaseModel):
    immediate_nationwide: Literal[False] = Field(alias="immediateNationwide")
    pilot_city: Literal["Barcelona"] = Field(alias="pilotCity")
    next_stage: Literal["Barcelona-to-Madrid"] = Field(alias="nextStage")
    cac_max_eur: Literal[500] = Field(alias="cacMaxEur")
    pilot_success_customers: Literal[150] = Field(alias="pilotSuccessCustomers")
    pilot_mrr_eur: Literal[30_000] = Field(alias="pilotMrrEur")
    operational_break_even_reference_customers: Literal[250] = Field(
        alias="operationalBreakEvenReferenceCustomers"
    )
    break_even_is_expansion_gate: Literal[False] = Field(alias="breakEvenIsExpansionGate")
    compliance_review_required: Literal[True] = Field(alias="complianceReviewRequired")

    model_config = ConfigDict(populate_by_name=True)


class CoordinatorModelOutput(BaseModel):
    executive_summary: str = Field(alias="executiveSummary", min_length=1)
    conditional_decision: ConditionalRecommendationDecision = Field(alias="conditionalDecision")
    assumptions: list[str] = Field(min_length=1)
    uncertainties: list[str] = Field(min_length=1)
    missing_information: list[str] = Field(alias="missingInformation", min_length=1)
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    insufficient_evidence: bool = Field(alias="insufficientEvidence")

    model_config = ConfigDict(populate_by_name=True)


class AnalysisReport(BaseModel):
    executive_summary: str = Field(alias="executiveSummary")
    recommended_option: str = Field(alias="recommendedOption")
    recommendation: str
    recommendation_rationale: str = Field(alias="recommendationRationale")
    market_assessment: str = Field(alias="marketAssessment")
    financial_assessment: str = Field(alias="financialAssessment")
    legal_assessment: str = Field(alias="legalAssessment")
    sections: list[ReportSection]
    alternatives: list[str]
    risk_register: list[RiskItem] = Field(alias="riskRegister")
    implementation_roadmap: list[str] = Field(alias="implementationRoadmap")
    decision_criteria: list[str] = Field(alias="decisionCriteria")
    assumptions: list[str]
    uncertainties: list[str]
    missing_information: list[str] = Field(alias="missingInformation")
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    citations: list[AiCitation]
    insufficient_evidence: bool = Field(alias="insufficientEvidence")
    limitations: list[str] = Field(default_factory=list)
    quality_gate_passed: bool = Field(alias="qualityGatePassed")
    quality_score: float = Field(alias="qualityScore", ge=0, le=1)
    grounding_score: float = Field(alias="groundingScore", ge=0, le=1)

    model_config = ConfigDict(populate_by_name=True)


class CriticOutput(BaseModel):
    approved: bool
    reasons: list[str] = Field(default_factory=list)
    quality_score: float = Field(alias="qualityScore", ge=0, le=1)
    grounding_score: float = Field(alias="groundingScore", ge=0, le=1)

    model_config = ConfigDict(populate_by_name=True)


class AnalysisExecutionResponse(BaseModel):
    plan: AnalysisPlan | None
    specialist_results: list[SpecialistResult] = Field(alias="specialistResults")
    report: AnalysisReport
    checkpoints: list[str]
    current_stage: str = Field(alias="currentStage")

    model_config = ConfigDict(populate_by_name=True)
