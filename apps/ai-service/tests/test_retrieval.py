from typing import Any

from app.infrastructure.ollama import GeneratedGroundedAnswer
from app.schemas.contracts import AiRetrievalRequest
from app.services.retrieval import (
    RankedCandidate,
    build_filter,
    filter_relevant_candidates,
    generate_grounded_answer,
    grounded_answer,
    normalize_query,
    reciprocal_rank_fusion,
)


def test_normalize_query_preserves_identifiers_and_removes_controls() -> None:
    assert normalize_query("  Article-12\u0000  USD 1,000 ") == "Article-12 USD 1,000"


def test_filter_always_contains_project_and_lifecycle_constraints() -> None:
    request = AiRetrievalRequest(projectId="project-a", query="invoice")
    filter_value = str(build_filter(request))
    for expected in ("projectId", "active", "archived", "documentStatus"):
        assert expected in filter_value


def test_rrf_deduplicates_and_has_stable_order() -> None:
    dense = [RankedCandidate({"chunkId": "a"}, 0.9), RankedCandidate({"chunkId": "b"}, 0.8)]
    sparse = [RankedCandidate({"chunkId": "b"}, 1.0), RankedCandidate({"chunkId": "a"}, 0.7)]
    assert [item.payload["chunkId"] for item in reciprocal_rank_fusion(dense, sparse)] == ["a", "b"]


def test_grounded_answer_has_bounded_context() -> None:
    from app.schemas.contracts import RetrievalEvidence

    evidence = [
        RetrievalEvidence(
            evidenceId=f"E{index}",
            chunkId=f"chunk-{index}",
            documentId="document",
            documentVersionId="version",
            knowledgeBaseId="knowledge-base",
            snippet="word " * 900,
            score=1,
            pageStart=None,
            pageEnd=None,
            headingPath=[],
        )
        for index in range(1, 4)
    ]
    answer, citations, insufficient = grounded_answer(evidence)
    assert len(answer.split()) <= 500
    assert 1 <= len(citations) <= 2
    assert not insufficient


async def test_available_chat_provider_prevents_chunk_concatenation(
    monkeypatch: Any,
) -> None:
    import app.services.retrieval as retrieval
    from app.core.config import Settings
    from app.schemas.contracts import RetrievalEvidence

    evidence = [
        RetrievalEvidence(
            evidenceId="E1",
            chunkId="c1",
            documentId="d1",
            documentVersionId="v1",
            knowledgeBaseId="k1",
            snippet="raw evidence one",
            score=1,
            pageStart=None,
            pageEnd=None,
            headingPath=[],
        ),
        RetrievalEvidence(
            evidenceId="E2",
            chunkId="c2",
            documentId="d2",
            documentVersionId="v2",
            knowledgeBaseId="k1",
            snippet="raw evidence two",
            score=0.9,
            pageStart=None,
            pageEnd=None,
            headingPath=[],
        ),
    ]

    class FakeProvider:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.timeout = 1

        async def is_available(self, client: Any) -> bool:
            return True

        async def generate(self, client: Any, prompt: str) -> GeneratedGroundedAnswer:
            return GeneratedGroundedAnswer(
                entry_plan="Run a six-month Barcelona pilot [E2]",
                financial_targets="Budget 100000 EUR [E2]",
                legal_requirements="Review GDPR and tax requirements [E1]",
                expansion_conditions="Expand after sustainable demand [E1][E2]",
                citations=[{"evidenceId": "E1"}, {"evidenceId": "E2"}],
            )

    monkeypatch.setattr(retrieval, "OllamaChatModelProvider", FakeProvider)
    answer, _, insufficient, _ = await retrieval.generate_grounded_answer(
        "summarize", evidence, Settings()
    )
    assert "Entry plan" in answer and "Financial targets" in answer
    assert "raw evidence one\n\nraw evidence two" not in answer
    assert "\\#" not in answer
    assert not insufficient


async def test_unrelated_query_returns_insufficient_evidence_and_no_citations() -> None:
    from app.core.config import Settings
    answer, citations, insufficient, missing = await generate_grounded_answer(
        "Who is the CEO and what is their phone number?", [], Settings()
    )
    assert insufficient
    assert citations == []
    assert missing == ["CEO name", "phone number"]
    assert "Insufficient evidence" in answer


def test_irrelevant_top_k_chunks_are_filtered_before_citation() -> None:
    from app.core.config import Settings

    candidates = [
        RankedCandidate({"chunkId": "c1", "content": "Spanish market expansion"}, 0.8),
    ]
    assert filter_relevant_candidates("CEO phone number", candidates, Settings()) == []
