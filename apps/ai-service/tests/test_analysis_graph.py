from typing import TypeVar

import pytest
from pydantic import BaseModel

from app.graphs.analysis_graph import (
    REQUIRED_REPORT_SECTIONS,
    best_risk_citation,
    citation_quote,
    citation_specificity_reasons,
    citation_validator,
    clip_at_word,
    critic_passes,
    evidence_pack,
    execute_analysis,
    grounding_metrics,
    local_critic_reasons,
)
from app.infrastructure.analysis_models import (
    AgentKind,
    AnalysisModelRuntime,
    ModelNodeConfig,
    ModelUnavailableError,
)
from app.schemas.analysis import AnalysisInput, AnalysisReport, EvidenceReference, RiskModelItem
from app.schemas.contracts import AiCitation, RetrievalEvidence

OutputModel = TypeVar("OutputModel", bound=BaseModel)


def evidence(evidence_id: str, document_id: str, snippet: str) -> RetrievalEvidence:
    return RetrievalEvidence(
        evidenceId=evidence_id,
        chunkId=f"chunk-{evidence_id}",
        documentId=document_id,
        documentVersionId=f"version-{evidence_id}",
        knowledgeBaseId="kb-1",
        snippet=snippet,
        score=0.9,
        pageStart=1,
        pageEnd=1,
        headingPath=[],
    )


def analysis_input() -> AnalysisInput:
    return AnalysisInput(
        analysisId="analysis-1",
        analysisRunId="run-1",
        threadId="analysis:run-1",
        projectId="project-1",
        userId="user-1",
        requestId="request-1",
        graphVersion="phase-5-v2",
        mode="MULTI_AGENT",
        title="Spain expansion decision",
        decisionQuestion="Should we expand beyond the Barcelona pilot?",
        objectives=["Validate a reversible expansion decision"],
        assumptions=["The pilot can be extended before nationwide spend is committed."],
        authorizedKnowledgeBaseIds=["kb-1"],
        initialRetrievalRunId="retrieval-1",
        initialEvidence=[
            evidence(
                "E1",
                "market-doc",
                "The Barcelona pilot success criteria are 150 paying customers and EUR 30000 "
                "MRR. Competition and localized Spanish messaging must be tested.",
            ),
            evidence(
                "E2",
                "financial-doc",
                "The EUR 100000 budget includes EUR 25000 for marketing and a CAC target below "
                "EUR 500. Operational break-even is estimated at approximately 250 active "
                "customers.",
            ),
            evidence(
                "E3",
                "legal-doc",
                "GDPR controls, consumer protection, employment rules and tax obligations need "
                "local Spanish legal review before launch.",
            ),
            evidence(
                "E4",
                "risk-doc",
                "Strong local competition, demand uncertainty, budget overrun and compliance "
                "delay are identified as material risks. "
                "Mitigation is to keep the Barcelona pilot reversible and release spend in stages.",
            ),
            evidence(
                "E5",
                "strategy-doc",
                "A staged Barcelona-to-Madrid expansion is preferred to immediate nationwide "
                "expansion. An extended pilot or postponed expansion remains available.",
            ),
        ],
    )


def hybrid_analysis_input() -> AnalysisInput:
    payload = analysis_input()
    return payload.model_copy(
        update={
            "evidence_mode": "HYBRID",
            "external_research_enabled": True,
            "assumptions": ["Demand is not yet validated"],
            "initial_evidence": [
                *payload.initial_evidence,
                evidence(
                    "W1",
                    "research-source-1",
                    "Spain public market context: the synthetic public dataset indicates that "
                    "market validation remains necessary before expansion.",
                ),
                evidence(
                    "W2",
                    "research-source-2",
                    "The synthetic external scenario conflicts with the internal assumption "
                    "that demand has already been validated.",
                ),
            ],
        }
    )


def citation(evidence_id: str) -> dict[str, str]:
    source = next(
        item for item in analysis_input().initial_evidence if item.evidence_id == evidence_id
    )
    quote = source.snippet.split(". ", 1)[0].rstrip(".")
    return {
        "evidenceId": evidence_id,
        "documentId": source.document_id,
        "quote": quote,
    }


class FakeChatModelProvider:
    provider_name = "fake"

    def __init__(self, available: bool = True, quality_score: float = 0.94) -> None:
        self.available = available
        self.quality_score = quality_score
        self.calls: list[dict[str, object]] = []
        self.coordinator_input: dict[str, object] | None = None

    async def is_available(self, model: str) -> bool:
        return self.available

    async def generate_structured(
        self,
        *,
        model: str,
        max_tokens: int,
        system_instruction: str,
        input_data: dict[str, object],
        output_schema: type[OutputModel],
    ) -> OutputModel:
        name = output_schema.__name__
        self.calls.append({"schema": name, "input": input_data, "model": model})
        payload = self._payload(name, input_data)
        return output_schema.model_validate(payload)

    def _payload(self, name: str, input_data: dict[str, object]) -> dict[str, object]:
        if name == "PlannerModelOutput":
            return {
                "decisionType": "market_expansion",
                "restatedQuestion": "Whether to expand after the Barcelona pilot",
                "subQuestions": ["Which gates must be met?"],
                "marketTask": "Assess the pilot, demand, competition, and localization.",
                "financialTask": "Assess all budget, CAC, customer, and MRR gates.",
                "legalRegulatoryTask": "Assess GDPR, consumer, employment, and tax obligations.",
                "riskTask": "Build a bounded risk register with mitigations.",
                "strategyTask": "Compare the four required expansion alternatives.",
                "evidenceNeeds": ["Role-specific project evidence"],
                "requiredReportSections": REQUIRED_REPORT_SECTIONS,
                "knownConstraints": [],
                "expectedDecisionCriteria": ["Reversible gated expansion"],
                "insufficientEvidenceRisk": "LOW",
                "rationaleSummary": "Use distinct specialists and synthesize validated outputs.",
            }
        if name == "MarketSpecialistOutput":
            return {
                "summary": "Barcelona pilot evidence is promising but conditional.",
                "pilotAssessment": "The pilot has early demand signals.",
                "demandAssessment": "Demand must be validated with conversion data.",
                "competitionAssessment": "Active competition requires differentiation.",
                "localizationAssessment": "Localized Spanish messaging is required.",
                "expansionConditions": ["Validate pilot demand and localization."],
                "assumptions": ["Pilot cohorts are measurable."],
                "uncertainties": ["Madrid demand is untested."],
                "missingInformation": ["Pilot conversion and competitor benchmarks."],
                "citations": [citation("E1")],
            }
        if name == "FinancialSpecialistOutput":
            return {
                "summary": "Expansion must stay within explicit financial gates.",
                "budgetEur": 100000,
                "marketingBudgetEur": 25000,
                "cacTargetEur": 500,
                "pilotSuccessCustomers": 150,
                "breakEvenCustomers": 250,
                "mrrTargetEur": 30000,
                "budgetAssessment": "The total envelope is EUR 100000.",
                "marketingAssessment": "EUR 25000 is allocated to marketing.",
                "cacAssessment": "Proceed only with CAC below EUR 500.",
                "pilotSuccessAssessment": (
                    "The market strategy defines 150 paying customers and EUR 30000 MRR."
                ),
                "breakEvenAssessment": "Break-even requires at least 250 customers.",
                "mrrAssessment": "The operating gate is EUR 30000 MRR.",
                "assumptions": ["All metrics use the same period."],
                "uncertainties": ["Actual CAC is not yet observed."],
                "missingInformation": ["Cohort CAC and MRR trend."],
                "citations": [citation("E2")],
            }
        if name == "LegalSpecialistOutput":
            return {
                "summary": "Local review is required across four legal domains.",
                "gdpr": "Map data processing and establish GDPR controls.",
                "consumerProtection": "Review consumer terms and redress.",
                "employmentRules": "Validate Spanish employment obligations.",
                "taxObligations": "Confirm tax registrations and filings.",
                "professionalLimitations": "Obtain local legal and tax advice before launch.",
                "assumptions": ["The service operates locally in Spain."],
                "uncertainties": ["The final operating model is not fixed."],
                "missingInformation": ["Local counsel compliance sign-off."],
                "citations": [citation("E3")],
            }
        if name == "RiskSpecialistOutput":
            return {
                "summary": "The main risks are demand, financial, and compliance gates.",
                "risks": [
                    {
                        "risk": "Strong local competition in the Spanish market.",
                        "category": "MARKET",
                        "likelihood": "MEDIUM",
                        "impact": "HIGH",
                        "mitigation": "Use a staged launch with stop gates.",
                        "mitigationBasis": "EVIDENCE_BACKED",
                        "residualRisk": "MEDIUM",
                        "uncertainty": "Observed pilot demand is unavailable.",
                        "citations": [citation("E4")],
                    }
                ],
                "assumptions": ["Expansion can be paused."],
                "uncertainties": ["Residual risk depends on pilot data."],
                "missingInformation": ["Risk owners and trigger thresholds."],
                "citations": [citation("E4")],
            }
        if name == "StrategySpecialistOutput":
            return {
                "summary": "Four strategic paths differ in reversibility and evidence needs.",
                "immediateNationwide": {
                    "option": "Immediate nationwide expansion",
                    "assessment": "Reject until all gates are met.",
                    "conditions": ["All pilot and compliance gates."],
                },
                "stagedBarcelonaToMadrid": {
                    "option": "Staged Barcelona-to-Madrid expansion",
                    "assessment": "Recommended conditional option.",
                    "conditions": ["CAC, customers, MRR, and compliance confirmed."],
                },
                "extendedPilot": {
                    "option": "Extended pilot",
                    "assessment": "Use when metrics remain uncertain.",
                    "conditions": ["Collect another validated cohort."],
                },
                "postponedExpansion": {
                    "option": "Postponed expansion",
                    "assessment": "Use when gates fail.",
                    "conditions": ["Preserve capital and reassess."],
                },
                "recommendedOption": "Staged Barcelona-to-Madrid expansion",
                "recommendationRationale": "It preserves reversibility while validating gates.",
                "assumptions": ["A staged launch can be paused."],
                "uncertainties": ["Madrid execution costs are not quantified."],
                "missingInformation": ["Option-level cost and timing."],
                "citations": [citation("E5")],
            }
        if name == "CoordinatorModelOutput":
            self.coordinator_input = input_data
            return report_payload()
        if name == "CriticOutput":
            return {
                "approved": self.quality_score >= 0.7,
                "reasons": (
                    []
                    if self.quality_score >= 0.7
                    else ["The synthesis quality is below the configured threshold."]
                ),
                "qualityScore": self.quality_score,
                "groundingScore": 1.0,
            }
        raise AssertionError(f"Unexpected schema: {name}")


class RepairingRiskChatModelProvider(FakeChatModelProvider):
    def _payload(self, name: str, input_data: dict[str, object]) -> dict[str, object]:
        payload = super()._payload(name, input_data)
        risk_calls = sum(item["schema"] == "RiskSpecialistOutput" for item in self.calls)
        if name == "RiskSpecialistOutput" and risk_calls == 1:
            first_risk = dict(payload["risks"][0])  # type: ignore[index]
            first_risk["residualRisk"] = "LOW"
            second_risk = {
                **first_risk,
                "risk": "Compliance review is delayed.",
            }
            payload["risks"] = [first_risk, second_risk]
        return payload


class RepairingCriticChatModelProvider(FakeChatModelProvider):
    def _payload(self, name: str, input_data: dict[str, object]) -> dict[str, object]:
        payload: dict[str, object] = super()._payload(name, input_data)
        critic_calls = sum(item["schema"] == "CriticOutput" for item in self.calls)
        if name == "CriticOutput" and critic_calls == 1:
            payload = {
                "approved": False,
                "reasons": list[str](),
                "qualityScore": 0.25,
                "groundingScore": 1.0,
            }
        return payload


def report_payload() -> dict[str, object]:
    risk = {
        "risk": "Pilot demand does not generalize.",
        "category": "MARKET",
        "likelihood": "MEDIUM",
        "impact": "HIGH",
        "mitigation": "Use a staged launch with stop gates.",
        "mitigationBasis": "EVIDENCE_BACKED",
        "residualRisk": "MEDIUM",
        "uncertainty": "Observed pilot demand is unavailable.",
        "citations": [citation("E4")],
    }
    alternatives = [
        "Immediate nationwide expansion: reject until gates are met.",
        "Staged Barcelona-to-Madrid expansion: recommended after validation.",
        "Extended pilot: collect another cohort.",
        "Postponed expansion: preserve capital if gates fail.",
    ]
    sections = [
        {"title": "Recommended option", "content": alternatives[1]},
        {
            "title": "Recommendation rationale",
            "content": "A staged path preserves reversibility and limits unvalidated spend.",
        },
        {"title": "Alternatives", "content": " Four options were assessed separately."},
        {
            "title": "Market assessment",
            "content": "Pilot demand is promising; competition and localization remain gates. [E1]",
        },
        {
            "title": "Financial assessment",
            "content": (
                "EUR 100000 total and EUR 25000 marketing require CAC below EUR 500, "
                "250 customers, and EUR 30000 MRR. [E2]"
            ),
        },
        {
            "title": "Legal assessment",
            "content": "GDPR, consumer, employment, and tax controls need local review. [E3]",
        },
        {"title": "Risk register", "content": "Demand risk is MEDIUM likelihood and HIGH impact."},
        {
            "title": "Implementation roadmap",
            "content": (
                "Finish the pilot, validate gates, obtain compliance sign-off, then stage Madrid."
            ),
        },
        {"title": "Decision criteria", "content": "CAC, customers, MRR, and compliance gates."},
        {"title": "Assumptions", "content": "Expansion can be paused."},
        {"title": "Uncertainties", "content": "Madrid demand is untested."},
        {"title": "Missing information", "content": "Cohort metrics and counsel sign-off."},
        {"title": "Confidence", "content": "MEDIUM pending gate validation."},
    ]
    return {
        "executiveSummary": "Do not begin an immediate nationwide expansion.",
        "recommendedOption": "Staged Barcelona-to-Madrid expansion after pilot validation.",
        "conditionalDecision": {
            "immediateNationwide": False,
            "pilotCity": "Barcelona",
            "nextStage": "Barcelona-to-Madrid",
            "cacMaxEur": 500,
            "pilotSuccessCustomers": 150,
            "pilotMrrEur": 30000,
            "operationalBreakEvenReferenceCustomers": 250,
            "breakEvenIsExpansionGate": False,
            "complianceReviewRequired": True,
        },
        "recommendation": (
            "Do not begin immediate nationwide expansion. Complete the Barcelona pilot and "
            "expand only after CAC below EUR 500, at least 250 customers, EUR 30000 MRR, and "
            "compliance criteria are confirmed."
        ),
        "recommendationRationale": "The staged option is reversible and evidence-gated.",
        "marketAssessment": sections[3]["content"],
        "financialAssessment": sections[4]["content"],
        "legalAssessment": sections[5]["content"],
        "sections": sections,
        "alternatives": alternatives,
        "riskRegister": [risk],
        "implementationRoadmap": [
            "Complete Barcelona pilot.",
            "Validate financial and compliance gates.",
            "Launch Madrid in a controlled stage.",
        ],
        "decisionCriteria": [
            "CAC below EUR 500.",
            "At least 250 customers.",
            "EUR 30000 MRR.",
            "Compliance sign-off.",
        ],
        "assumptions": ["Expansion can be paused."],
        "uncertainties": ["Madrid demand and execution cost."],
        "missingInformation": ["Cohort metrics and local counsel sign-off."],
        "confidence": "MEDIUM",
        "citations": [
            citation("E1"),
            citation("E2"),
            citation("E3"),
            citation("E4"),
            citation("E5"),
        ],
        "insufficientEvidence": False,
        "limitations": [],
        "qualityGatePassed": True,
        "qualityScore": 0.9,
        "groundingScore": 1.0,
    }


def fake_runtime(provider: FakeChatModelProvider) -> AnalysisModelRuntime:
    agents: tuple[AgentKind, ...] = ("PLANNER", "SPECIALIST", "COORDINATOR", "CRITIC")
    configs: dict[AgentKind, ModelNodeConfig] = {
        agent: ModelNodeConfig(provider="fake", model=f"fake-{agent.lower()}", max_tokens=2000)
        for agent in agents
    }
    return AnalysisModelRuntime(provider=provider, configs=configs)


async def test_all_model_nodes_are_called_without_fallback() -> None:
    provider = FakeChatModelProvider()
    response = await execute_analysis(analysis_input(), fake_runtime(provider))
    called = [str(item["schema"]) for item in provider.calls]

    assert called.count("PlannerModelOutput") == 1
    assert called.count("MarketSpecialistOutput") == 1
    assert called.count("FinancialSpecialistOutput") == 1
    assert called.count("LegalSpecialistOutput") == 1
    assert called.count("RiskSpecialistOutput") == 1
    assert called.count("StrategySpecialistOutput") == 1
    assert called.count("CoordinatorModelOutput") == 1
    assert called.count("CriticOutput") == 1
    assert all(result.status == "COMPLETED" for result in response.specialist_results)


async def test_specialist_outputs_materially_differ_and_coordinator_uses_them() -> None:
    provider = FakeChatModelProvider()
    response = await execute_analysis(analysis_input(), fake_runtime(provider))
    bodies = {" ".join(result.findings) for result in response.specialist_results}

    assert len(bodies) == 5
    assert provider.coordinator_input is not None
    assert "specialistOutputs" in provider.coordinator_input
    assert "evidencePack" not in provider.coordinator_input


async def test_selected_external_evidence_reaches_coordinator() -> None:
    provider = FakeChatModelProvider()
    response = await execute_analysis(hybrid_analysis_input(), fake_runtime(provider))

    assert provider.coordinator_input is not None
    external = provider.coordinator_input["externalEvidence"]
    assert {item["evidenceId"] for item in external} == {"W1", "W2"}  # type: ignore[index]
    internal = provider.coordinator_input["internalEvidence"]
    assert {item["evidenceId"] for item in internal} == {  # type: ignore[index]
        "E1",
        "E2",
        "E3",
        "E4",
        "E5",
    }
    assert {
        item.evidence_id for result in response.specialist_results for item in result.citations
    } <= {
        "E1",
        "E2",
        "E3",
        "E4",
        "E5",
    }


async def test_supported_external_claim_receives_w_citation() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )

    context = next(
        item for item in response.report.external_context if "market validation" in item.claim
    )
    assert [item.evidence_id for item in context.citations] == ["W1"]
    assert any(item.evidence_id == "W1" for item in response.report.citations)


async def test_w_citation_is_not_added_to_an_unsupported_claim() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )

    assert "W1" not in response.report.financial_assessment
    assert any("W2" in item.claim for item in response.report.external_context)


async def test_aligned_external_assumption_does_not_create_conflict() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )

    assert not response.report.evidence_conflicts
    assert any("W2" in item.claim for item in response.report.external_context)


async def test_current_validated_assumption_creates_w2_conflict() -> None:
    request = hybrid_analysis_input().model_copy(
        update={"assumptions": ["Demand has already been validated."]}
    )
    response = await execute_analysis(request, fake_runtime(FakeChatModelProvider()))

    assert response.report.evidence_conflicts
    conflict = response.report.evidence_conflicts[0]
    assert conflict.citations[0].evidence_id == "W2"
    assert "demand has already been validated" in conflict.internal_position.casefold()


async def test_external_conflict_lowers_confidence_or_adds_limitation() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )

    assert response.report.confidence != "HIGH" or response.report.limitations


async def test_quality_gate_response_lists_exact_failed_checks() -> None:
    response = await execute_analysis(
        analysis_input(), fake_runtime(FakeChatModelProvider(quality_score=0.25))
    )

    failed = {
        item.check: item.detail for item in response.report.quality_gate_checks if not item.passed
    }
    assert "quality score minimum" in failed
    assert "0.25" in failed["quality score minimum"]
    assert "0.70" in failed["quality score minimum"]


async def test_risk_categories_match_risk_type() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )
    competition = response.report.risk_register[0]
    assert "competition" in competition.risk.casefold()
    assert competition.category == "MARKET"


async def test_mitigation_cannot_be_both_evidence_backed_and_analytical() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    for risk in response.report.risk_register:
        assert not (
            risk.mitigation_basis == "ANALYTICAL_RECOMMENDATION"
            and "evidence_backed" in risk.mitigation.casefold()
        )


async def test_empty_report_sections_are_omitted() -> None:
    payload = analysis_input().model_copy(update={"assumptions": []})
    response = await execute_analysis(payload, fake_runtime(FakeChatModelProvider()))

    assert "Assumptions" not in {section.title for section in response.report.sections}


async def test_internal_only_creates_no_w_evidence() -> None:
    payload = analysis_input().model_copy(
        update={
            "initial_evidence": [
                *analysis_input().initial_evidence,
                evidence(
                    "W1",
                    "research-source-1",
                    "Public context says market validation remains necessary before expansion.",
                ),
            ],
            "evidence_mode": "INTERNAL_ONLY",
            "external_research_enabled": False,
        }
    )
    provider = FakeChatModelProvider()
    response = await execute_analysis(payload, fake_runtime(provider))

    assert not response.report.external_context
    assert not any(item.evidence_id.startswith("W") for item in response.report.citations)
    coordinator = provider.coordinator_input
    assert coordinator is not None and coordinator["externalEvidence"] == []


async def test_financial_output_contains_required_structured_metrics() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    result = next(item for item in response.specialist_results if item.specialist == "FINANCIAL")
    text = " ".join(result.findings)

    for value in ("100000", "25000", "500", "250", "30000"):
        assert value in text


async def test_risk_output_has_bounded_levels_and_mitigation() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    result = next(item for item in response.specialist_results if item.specialist == "RISK")

    assert result.risk_register
    assert all(item.likelihood in {"LOW", "MEDIUM", "HIGH"} for item in result.risk_register)
    assert all(item.impact in {"LOW", "MEDIUM", "HIGH"} for item in result.risk_register)
    assert all(item.mitigation for item in result.risk_register)


async def test_invalid_uniform_risk_output_gets_one_validation_repair() -> None:
    provider = RepairingRiskChatModelProvider()
    response = await execute_analysis(analysis_input(), fake_runtime(provider))
    risk_calls = [item for item in provider.calls if item["schema"] == "RiskSpecialistOutput"]
    result = next(item for item in response.specialist_results if item.specialist == "RISK")

    assert len(risk_calls) == 2
    assert risk_calls[1]["input"]["validationRepair"] is True  # type: ignore[index]
    assert any(item.residual_risk != "LOW" for item in result.risk_register)


async def test_strategy_contains_four_distinct_alternatives() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    result = next(item for item in response.specialist_results if item.specialist == "STRATEGY")

    assert len(result.alternatives) == 4
    assert any("nationwide" in item.casefold() for item in result.alternatives)
    assert any("barcelona-to-madrid" in item.casefold() for item in result.alternatives)


async def test_model_unavailable_fails_without_generating_fallback() -> None:
    provider = FakeChatModelProvider(available=False)

    with pytest.raises(ModelUnavailableError, match="unavailable"):
        await execute_analysis(analysis_input(), fake_runtime(provider))

    assert provider.calls == []


async def test_critic_rejects_duplicate_specialists_and_evidence_template() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    duplicate = response.specialist_results[0].model_copy(update={"specialist": "FINANCIAL"})
    report = response.report.model_copy(
        update={"market_assessment": "Evidence indicates repeated source text."}
    )
    reasons = local_critic_reasons(
        report,
        [response.specialist_results[0], duplicate],
        analysis_input().initial_evidence,
    )

    assert any("duplicated" in reason.casefold() for reason in reasons)
    assert any("evidence indicates" in reason.casefold() for reason in reasons)


def test_critic_model_rejection_gets_one_revision_then_local_gates_decide() -> None:
    assert not critic_passes(
        model_approved=False,
        model_reasons=["Revise the narrative."],
        local_reasons=[],
        revision_count=0,
        quality_score=0.9,
        grounding_score=1.0,
        min_quality_score=0.7,
        min_grounding_score=0.7,
    )
    assert not critic_passes(
        model_approved=False,
        model_reasons=["Revise the narrative."],
        local_reasons=[],
        revision_count=1,
        quality_score=0.9,
        grounding_score=1.0,
        min_quality_score=0.7,
        min_grounding_score=0.7,
    )
    assert not critic_passes(
        model_approved=True,
        model_reasons=[],
        local_reasons=["Specialist outputs are materially duplicated."],
        revision_count=1,
        quality_score=0.9,
        grounding_score=1.0,
        min_quality_score=0.7,
        min_grounding_score=0.7,
    )


async def test_inconsistent_critic_rejection_gets_one_validation_repair() -> None:
    provider = RepairingCriticChatModelProvider()
    response = await execute_analysis(analysis_input(), fake_runtime(provider))

    assert response.report.quality_gate_passed is True
    assert response.report.quality_score == pytest.approx(0.94)
    assert [item["schema"] for item in provider.calls].count("CriticOutput") == 2


async def test_report_contains_all_required_structures() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    titles = {section.title for section in response.report.sections}

    assert set(REQUIRED_REPORT_SECTIONS[1:]).issubset(titles)
    assert len(response.report.alternatives) >= 4


async def test_report_quality_and_decision_readiness_are_independent() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))

    assert response.report.quality_gate_passed is True
    assert response.report.report_quality_score >= 0.7
    assert response.report.grounding_score >= 0.7
    assert response.report.decision_ready is False
    assert response.report.decision_readiness == "LOW"
    assert response.report.evidence_sufficiency_score < response.report.report_quality_score
    assert response.report.confidence == "LOW"
    assert any(not check.passed for check in response.report.readiness_checks)


async def test_readiness_failure_does_not_zero_a_grounded_report() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))

    assert response.report.report_quality_score == pytest.approx(0.94)
    assert response.report.quality_score == pytest.approx(0.94)
    assert response.report.decision_readiness_score < response.report.report_quality_score
    assert "Use ." not in response.report.model_dump_json()
    assert all(
        risk.mitigation_basis in {"EVIDENCE_BACKED", "ANALYTICAL_RECOMMENDATION"}
        for risk in response.report.risk_register
    )


def test_hybrid_evidence_pack_preserves_internal_and_external_items() -> None:
    request = hybrid_analysis_input()
    pack = evidence_pack("MARKET", request.initial_evidence)
    assert {item.evidence_id for item in pack} >= {"E1", "W1", "W2"}


async def test_unsupported_numeric_claim_lowers_grounding() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report.model_copy(
        update={"executive_summary": "The budget is EUR 999999 and CAC is EUR 1."}
    )
    grounding, _, unsupported, _, _ = grounding_metrics(report, analysis_input().initial_evidence)
    assert unsupported > 0
    assert grounding < 1.0
    assert response.report.risk_register
    assert response.report.implementation_roadmap
    assert response.report.missing_information


def test_thematic_similarity_does_not_validate_external_risk_claims() -> None:
    request = hybrid_analysis_input()
    w1 = next(item for item in request.initial_evidence if item.evidence_id == "W1")
    risk = RiskModelItem(
        risk="Strong local competition",
        category="MARKET",
        likelihood="MEDIUM",
        impact="HIGH",
        mitigation="Validate competitors before spend.",
        mitigationBasis="ANALYTICAL_RECOMMENDATION",
        residualRisk="MEDIUM",
        uncertainty="Competitor evidence is not available yet.",
        citations=[EvidenceReference(evidenceId="W1", documentId=w1.document_id)],
    )
    assert best_risk_citation(risk, request.initial_evidence, risk.citations) == []


def test_internal_risk_receives_matching_evidence_citation() -> None:
    request = analysis_input()
    e4 = next(item for item in request.initial_evidence if item.evidence_id == "E4")
    risk = RiskModelItem(
        risk="Strong local competition",
        category="MARKET",
        likelihood="MEDIUM",
        impact="HIGH",
        mitigation="Validate competitors before spend.",
        mitigationBasis="ANALYTICAL_RECOMMENDATION",
        residualRisk="MEDIUM",
        uncertainty="Competitor evidence is not available yet.",
        citations=[EvidenceReference(evidenceId="E4", documentId=e4.document_id)],
    )
    assert best_risk_citation(risk, request.initial_evidence, risk.citations)[0].evidence_id == "E4"


async def test_final_metrics_reject_thematic_w1_risk_citation() -> None:
    response = await execute_analysis(
        hybrid_analysis_input(), fake_runtime(FakeChatModelProvider())
    )
    w1 = next(item for item in hybrid_analysis_input().initial_evidence if item.evidence_id == "W1")
    bad_risk = response.report.risk_register[0].model_copy(
        update={
            "risk": "Strong local competition",
            "citations": [
                AiCitation(
                    evidenceId="W1",
                    documentId=w1.document_id,
                    quote=w1.snippet,
                )
            ],
        }
    )
    report = response.report.model_copy(update={"risk_register": [bad_risk]})
    grounding, validity, unsupported, _, _ = grounding_metrics(
        report, hybrid_analysis_input().initial_evidence
    )
    assert citation_specificity_reasons(report, hybrid_analysis_input().initial_evidence)
    assert validity < 1.0
    assert unsupported > 0
    assert grounding < 1.0


async def test_uncited_document_identified_claim_reduces_evidence_coverage() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report.model_copy(
        update={"market_assessment": "The documents identify strong local competition as a risk."}
    )
    _, _, unsupported, _, coverage = grounding_metrics(report, analysis_input().initial_evidence)
    assert unsupported > 0
    assert coverage < 1.0


async def test_citations_are_valid_and_unknown_ids_are_rejected() -> None:
    payload = analysis_input()
    response = await execute_analysis(payload, fake_runtime(FakeChatModelProvider()))
    sources = {item.evidence_id: item for item in payload.initial_evidence}
    for item in response.report.citations:
        assert item.quote in sources[item.evidence_id].snippet

    invalid_report = response.report.model_copy(
        update={
            "citations": [
                *response.report.citations,
                AiCitation(evidenceId="unknown", documentId="document", quote="unsupported"),
            ]
        }
    )
    with pytest.raises(ValueError, match="Unknown evidence ID"):
        citation_validator(
            {
                "request": payload,
                "runtime": fake_runtime(FakeChatModelProvider()),
                "report": invalid_report,
                "specialist_results": response.specialist_results,
                "critic_passed": True,
                "checkpoints": [],
            }
        )


def test_evidence_clipping_never_splits_a_word() -> None:
    text = ("business customer validation " * 300).strip()
    clipped = clip_at_word(text, 257)

    assert text.startswith(clipped)
    assert clipped.endswith(("business", "customer", "validation"))
    assert not clipped.endswith(("busi", "cus"))


def test_citation_quote_removes_internal_escaped_markdown_at_word_boundaries() -> None:
    snippet = (
        "Financial and Legal Plan for Spain \\## Financial assumptions "
        "The planned marketing allocation is 25000 EUR for business customers."
    )
    quote = citation_quote(snippet, 95)

    assert quote in snippet
    assert "\\#" not in quote
    assert not quote.endswith(("busi", "cus"))


def test_raw_evidence_majority_and_missing_structures_are_rejected() -> None:
    payload = analysis_input()
    report = AnalysisReport.model_validate(report_payload())
    copied = " ".join(item.snippet for item in payload.initial_evidence)
    degraded = report.model_copy(
        update={
            "market_assessment": copied,
            "financial_assessment": copied,
            "legal_assessment": copied,
            "sections": [],
            "alternatives": [],
            "risk_register": [],
            "implementation_roadmap": [],
            "decision_criteria": [],
            "missing_information": [],
        }
    )
    reasons = local_critic_reasons(degraded, [], payload.initial_evidence)

    assert any("raw evidence" in reason.casefold() for reason in reasons)
    assert any("alternatives" in reason.casefold() for reason in reasons)
    assert any("risk register" in reason.casefold() for reason in reasons)
    assert any("roadmap" in reason.casefold() for reason in reasons)
    assert any("missing information" in reason.casefold() for reason in reasons)


def test_critic_rejects_placeholder_roadmap_criteria_and_wrong_option() -> None:
    payload = analysis_input()
    report = AnalysisReport.model_validate(report_payload()).model_copy(
        update={
            "recommended_option": "immediateNationwideExpansion",
            "implementation_roadmap": ["marketAssessment financialAssessment"],
            "decision_criteria": ["marketAssessment financialAssessment"],
        }
    )
    reasons = local_critic_reasons(report, [], payload.initial_evidence)

    assert any("roadmap" in reason.casefold() for reason in reasons)
    assert any("criteria" in reason.casefold() for reason in reasons)
    assert any("recommended option" in reason.casefold() for reason in reasons)


async def test_unsupported_benchmark_claim_is_rejected() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report.model_copy(
        update={
            "market_assessment": (
                f"{response.report.market_assessment} The target is aligned with industry "
                "benchmarks for similar software market entries."
            )
        }
    )

    reasons = local_critic_reasons(
        report, response.specialist_results, analysis_input().initial_evidence
    )

    assert any("benchmark" in reason.casefold() for reason in reasons)


async def test_unsupported_feasibility_claim_is_rejected() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report.model_copy(
        update={
            "financial_assessment": (
                f"{response.report.financial_assessment} The budget is sufficient and the "
                "MRR target is achievable."
            )
        }
    )

    reasons = local_critic_reasons(
        report, response.specialist_results, analysis_input().initial_evidence
    )

    assert any("feasibility" in reason.casefold() for reason in reasons)


async def test_insufficient_risk_word_is_not_misread_as_sufficient_claim() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report.model_copy(
        update={
            "financial_assessment": (
                f"{response.report.financial_assessment} "
                "Evidence-backed risk: observed margin data is insufficient for a forecast."
            )
        }
    )

    reasons = local_critic_reasons(
        report, response.specialist_results, analysis_input().initial_evidence
    )

    assert not any("feasibility" in reason.casefold() for reason in reasons)


async def test_pilot_target_is_not_confused_with_break_even_reference() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    report = response.report

    assert "150 paying customers" in report.recommendation
    assert "250 active customers" in report.recommendation
    assert "not an expansion gate" in report.recommendation

    confused = report.model_copy(
        update={"recommendation": "Expand only after the expansion gate reaches 250 customers."}
    )
    reasons = local_critic_reasons(
        confused, response.specialist_results, analysis_input().initial_evidence
    )
    assert any("250-customer" in reason.casefold() for reason in reasons)


async def test_low_critic_score_cannot_finish_as_normal_completed() -> None:
    provider = FakeChatModelProvider(quality_score=0.25)
    response = await execute_analysis(analysis_input(), fake_runtime(provider))

    assert response.report.quality_score == 0.25
    assert response.report.quality_gate_passed is False
    assert response.report.insufficient_evidence is True
    assert response.report.limitations
    assert [item["schema"] for item in provider.calls].count("CriticOutput") == 2
    assert [item["schema"] for item in provider.calls].count("CoordinatorModelOutput") == 2


async def test_legal_assessment_excludes_unrelated_financial_repetition() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    legal = response.report.legal_assessment.casefold()

    assert all(term in legal for term in ("gdpr", "consumer", "employment", "tax"))
    assert not any(term in legal for term in ("100000", "25000", " mrr", " cac", "eur 200"))


async def test_assumptions_do_not_duplicate_evidence_facts() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))

    assert response.report.assumptions == [
        "User assumption: The pilot can be extended before nationwide spend is committed."
    ]
    duplicated = response.report.model_copy(
        update={"assumptions": ["GDPR controls are required before launch."]}
    )
    reasons = local_critic_reasons(
        duplicated, response.specialist_results, analysis_input().initial_evidence
    )
    assert any("assumptions duplicate" in reason.casefold() for reason in reasons)


async def test_uncertainties_are_descriptive_statements() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))

    assert all(
        len(item.split()) >= 5 and item.endswith((".", "!", "?"))
        for item in response.report.uncertainties
    )
    terse = response.report.model_copy(update={"uncertainties": ["Unknown"]})
    reasons = local_critic_reasons(
        terse, response.specialist_results, analysis_input().initial_evidence
    )
    assert any("descriptive statements" in reason.casefold() for reason in reasons)


async def test_citation_validates_the_specific_claim() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    invalid = response.report.model_copy(
        update={"decision_criteria": ["The approved budget is EUR 99999. [E2]"]}
    )

    reasons = local_critic_reasons(
        invalid, response.specialist_results, analysis_input().initial_evidence
    )

    assert any("specific numeric claim" in reason.casefold() for reason in reasons)


async def test_uncited_analytical_inference_is_explicitly_labelled() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))

    assert response.report.recommendation_rationale.startswith("Analytical inference:")
    assert "[E" not in response.report.recommendation_rationale


async def test_residual_risks_are_not_all_forced_to_low() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    source = response.report.risk_register[0]
    all_low = response.report.model_copy(
        update={
            "risk_register": [
                source.model_copy(update={"residual_risk": "LOW"}),
                source.model_copy(
                    update={"risk": "Compliance delay remains unresolved.", "residual_risk": "LOW"}
                ),
            ]
        }
    )

    reasons = local_critic_reasons(
        all_low, response.specialist_results, analysis_input().initial_evidence
    )

    assert any("residual risk" in reason.casefold() for reason in reasons)


async def test_full_customer_acquisition_cost_phrase_maps_to_specific_citation() -> None:
    payload = analysis_input()
    financial_plan = evidence(
        "E2",
        "financial-doc",
        "\\# Financial and Legal Plan for Spain \\## Financial assumptions "
        "The total planned budget is 100000 EUR and the marketing allocation is 25000 EUR. "
        "The target customer acquisition cost is below 500 EUR per paying customer. "
        "Operational break-even is expected after reaching approximately 250 active business "
        "customers. \\## Legal requirements GDPR and local tax obligations require review.",
    )
    payload = payload.model_copy(
        update={
            "initial_evidence": [
                financial_plan if item.evidence_id == "E2" else item
                for item in payload.initial_evidence
            ]
        }
    )

    response = await execute_analysis(payload, fake_runtime(FakeChatModelProvider()))
    financial = next(item for item in response.specialist_results if item.specialist == "FINANCIAL")
    cac_finding = next(item for item in financial.findings if "CAC below EUR 500" in item)

    assert cac_finding == "Source fact: CAC below EUR 500 is a stated target. [E2]"
    assert any(
        citation.evidence_id == "E2"
        and "customer acquisition cost is below 500 EUR" in citation.quote
        for citation in financial.citations
    )
    assert "source support was not retrieved" not in response.report.financial_assessment


async def test_document_identified_risk_levels_and_unsupported_mitigation_are_analytical() -> None:
    response = await execute_analysis(analysis_input(), fake_runtime(FakeChatModelProvider()))
    risk_result = next(item for item in response.specialist_results if item.specialist == "RISK")
    risk = risk_result.risk_register[0]
    section = next(
        item.content for item in response.report.sections if item.title == "Risk register"
    )

    assert risk.risk == (
        "The documents identify strong local competition as a risk, but no competitor research "
        "is currently available"
    )
    assert risk.mitigation_basis == "ANALYTICAL_RECOMMENDATION"
    assert "Evidence-backed risk:" not in section
    assert "likelihood (analytical assessment)" in section
    assert "impact (analytical assessment)" in section
    assert "residual risk (analytical assessment)" in section
