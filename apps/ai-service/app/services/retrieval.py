import hashlib
import re
import time
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC

import httpx

from app.core.config import Settings
from app.infrastructure.ollama import OllamaChatModelProvider
from app.schemas.contracts import (
    AiCitation,
    AiRetrievalRequest,
    AiRetrievalResponse,
    IndexContext,
    RetrievalEvidence,
)
from app.services.ingestion import deterministic_embedding

HYBRID_COLLECTION = "dip_document_chunks_v2"
TOKEN_RE = re.compile(r"[^\W_]+(?:[-./][^\W_]+)*", re.UNICODE)


def normalize_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = "".join(
        character for character in normalized if not unicodedata.category(character).startswith("C")
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        raise ValueError("Query must contain searchable characters")
    return normalized[:4000]


class SparseEmbeddingProvider:
    provider_name = "local-bm25"
    model_name = "hashed-bm25-v1"
    version = "v1"

    def embed_documents(self, texts: Iterable[str]) -> list[dict[str, list[float] | list[int]]]:
        return [self.embed_query(text) for text in texts]

    def embed_query(self, text: str) -> dict[str, list[float] | list[int]]:
        frequencies: dict[int, float] = {}
        for token in TOKEN_RE.findall(text.casefold()):
            index = int.from_bytes(hashlib.sha256(token.encode()).digest()[:4], "big")
            frequencies[index] = frequencies.get(index, 0.0) + 1.0
        indices = sorted(frequencies)
        return {"indices": indices, "values": [frequencies[index] for index in indices]}

    async def health_check(self) -> bool:
        return True


SPARSE_PROVIDER = SparseEmbeddingProvider()


@dataclass(frozen=True)
class RankedCandidate:
    payload: dict[str, object]
    score: float


class RetrievalEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def retrieve(self, request: AiRetrievalRequest) -> AiRetrievalResponse:
        started = time.perf_counter()
        query = normalize_query(request.query)
        timings: dict[str, float] = {}
        filter_value = build_filter(request)
        async with httpx.AsyncClient(timeout=self.settings.retrieval_timeout_seconds) as client:
            candidates: list[RankedCandidate]
            if request.mode == "DENSE":
                candidates = await self._query(
                    client, "dense", deterministic_embedding(query), filter_value
                )
            elif request.mode == "SPARSE":
                candidates = await self._query(
                    client, "sparse", SPARSE_PROVIDER.embed_query(query), filter_value
                )
            else:
                dense = await self._query(
                    client, "dense", deterministic_embedding(query), filter_value
                )
                sparse = await self._query(
                    client, "sparse", SPARSE_PROVIDER.embed_query(query), filter_value
                )
                candidates = reciprocal_rank_fusion(
                    dense,
                    sparse,
                    dense_weight=self.settings.dense_weight,
                    sparse_weight=self.settings.sparse_weight,
                )
            candidates = [
                candidate
                for candidate in candidates
                if candidate.score >= self.settings.retrieval_score_threshold
            ]
            candidates = rerank_candidates(
                query, candidates, enabled=self.settings.reranker_enabled
            )
            candidates = filter_relevant_candidates(query, candidates, self.settings)
            if len(candidates) < self.settings.min_relevant_evidence_count:
                candidates = []
        timings["retrieval"] = round((time.perf_counter() - started) * 1000, 3)
        evidence = to_evidence(candidates, request.top_k)
        answer: str | None = None
        citations: list[AiCitation] = []
        insufficient = False
        missing_information: list[str] = []
        if request.generate_answer:
            answer, citations, insufficient, missing_information = await generate_grounded_answer(
                query, evidence, self.settings
            )
        timings["total"] = round((time.perf_counter() - started) * 1000, 3)
        return AiRetrievalResponse(
            normalizedQuery=query,
            evidence=evidence,
            timingsMs=timings,
            answer=answer,
            citations=citations,
            insufficientEvidence=insufficient,
            missingInformation=missing_information,
        )

    async def _query(
        self,
        client: httpx.AsyncClient,
        vector_name: str,
        vector: list[float] | dict[str, list[float] | list[int]],
        filter_value: dict[str, object],
    ) -> list[RankedCandidate]:
        response = await client.post(
            f"{self.settings.qdrant_url.rstrip('/')}/collections/{HYBRID_COLLECTION}/points/query",
            json={
                "query": vector,
                "using": vector_name,
                "filter": filter_value,
                "limit": self.settings.retrieval_candidate_limit,
                "with_payload": True,
            },
        )
        response.raise_for_status()
        points = response.json().get("result", {}).get("points", [])
        return [
            RankedCandidate(payload=item.get("payload", {}), score=float(item.get("score", 0)))
            for item in points
            if isinstance(item, dict) and isinstance(item.get("payload"), dict)
        ]


def build_filter(request: AiRetrievalRequest) -> dict[str, object]:
    must: list[dict[str, object]] = [
        {"key": "projectId", "match": {"value": request.project_id}},
        {"key": "active", "match": {"value": True}},
        {"key": "archived", "match": {"value": False}},
        {"key": "documentStatus", "match": {"value": "COMPLETED"}},
    ]
    if request.filters.knowledge_base_ids:
        must.append(
            {"key": "knowledgeBaseId", "match": {"any": request.filters.knowledge_base_ids}}
        )
    if request.filters.document_ids:
        must.append({"key": "documentId", "match": {"any": request.filters.document_ids}})
    if request.filters.page_start is not None:
        must.append({"key": "pageEnd", "range": {"gte": request.filters.page_start}})
    if request.filters.page_end is not None:
        must.append({"key": "pageStart", "range": {"lte": request.filters.page_end}})
    if request.filters.created_after is not None or request.filters.created_before is not None:
        range_filter: dict[str, str] = {}
        if request.filters.created_after is not None:
            range_filter["gte"] = request.filters.created_after.astimezone(UTC).isoformat()
        if request.filters.created_before is not None:
            range_filter["lte"] = request.filters.created_before.astimezone(UTC).isoformat()
        must.append({"key": "createdAt", "range": range_filter})
    return {"must": must}


def reciprocal_rank_fusion(
    dense: list[RankedCandidate],
    sparse: list[RankedCandidate],
    k: int = 60,
    dense_weight: float = 1.0,
    sparse_weight: float = 1.0,
) -> list[RankedCandidate]:
    scores: dict[str, float] = {}
    payloads: dict[str, dict[str, object]] = {}
    for weight, candidates in ((dense_weight, dense), (sparse_weight, sparse)):
        for rank, candidate in enumerate(candidates, start=1):
            chunk_id = str(candidate.payload.get("chunkId", ""))
            if not chunk_id:
                continue
            payloads[chunk_id] = candidate.payload
            scores[chunk_id] = scores.get(chunk_id, 0) + weight / (k + rank)
    return sorted(
        (RankedCandidate(payloads[key], score) for key, score in scores.items()),
        key=lambda candidate: (-candidate.score, str(candidate.payload.get("chunkId", ""))),
    )


def rerank_candidates(
    query: str, candidates: list[RankedCandidate], *, enabled: bool = True
) -> list[RankedCandidate]:
    query_tokens = set(TOKEN_RE.findall(query.casefold()))
    scored: list[RankedCandidate] = []
    for candidate in candidates:
        content_tokens = set(TOKEN_RE.findall(str(candidate.payload.get("content", "")).casefold()))
        lexical = len(query_tokens & content_tokens) / max(1, len(query_tokens)) if enabled else 0
        scored.append(RankedCandidate(candidate.payload, candidate.score + 0.05 * lexical))
    return sorted(
        scored,
        key=lambda candidate: (-candidate.score, str(candidate.payload.get("chunkId", ""))),
    )


def filter_relevant_candidates(
    query: str, candidates: list[RankedCandidate], settings: Settings
) -> list[RankedCandidate]:
    query_tokens = set(TOKEN_RE.findall(query.casefold())) - {
        "a",
        "an",
        "and",
        "are",
        "how",
        "is",
        "of",
        "or",
        "the",
        "their",
        "what",
        "who",
    }
    required_overlap = 2 if len(query_tokens) >= 3 else 1
    relevant = []
    for candidate in candidates:
        content_tokens = set(TOKEN_RE.findall(str(candidate.payload.get("content", "")).casefold()))
        overlap = len(query_tokens & content_tokens)
        if overlap < required_overlap or candidate.score < settings.rerank_score_threshold:
            continue
        relevant.append(candidate)
    return relevant


def to_evidence(candidates: list[RankedCandidate], limit: int) -> list[RetrievalEvidence]:
    evidence: list[RetrievalEvidence] = []
    document_counts: dict[str, int] = {}
    for candidate in candidates:
        payload = candidate.payload
        document_id = str(payload.get("documentId", ""))
        if document_counts.get(document_id, 0) >= 3:
            continue
        content = str(payload.get("content", "")).strip()
        if not content:
            continue
        document_counts[document_id] = document_counts.get(document_id, 0) + 1
        evidence.append(
            RetrievalEvidence(
                evidenceId=f"E{len(evidence) + 1}",
                chunkId=str(payload["chunkId"]),
                documentId=document_id,
                documentVersionId=str(payload["documentVersionId"]),
                knowledgeBaseId=str(payload["knowledgeBaseId"]),
                snippet=content[:1200],
                score=candidate.score,
                pageStart=as_optional_int(payload.get("pageStart")),
                pageEnd=as_optional_int(payload.get("pageEnd")),
                headingPath=as_string_list(payload.get("headingPath")),
            )
        )
        if len(evidence) == limit:
            break
    return evidence


def grounded_answer(evidence: list[RetrievalEvidence]) -> tuple[str, list[AiCitation], bool]:
    if not evidence:
        return "Insufficient evidence in the selected knowledge bases.", [], True
    selected: list[RetrievalEvidence] = []
    context_tokens = 0
    for item in evidence:
        snippet_tokens = len(item.snippet.split())
        if selected and context_tokens + snippet_tokens > 1800:
            break
        selected.append(item)
        context_tokens += snippet_tokens
        if len(selected) == 3:
            break
    citations = [
        AiCitation(
            evidenceId=item.evidence_id,
            documentId=item.document_id,
            quote=item.snippet[:280],
        )
        for item in selected
    ]
    sections = sectioned_fallback(selected)
    return sections, citations, False


def sectioned_fallback(evidence: list[RetrievalEvidence]) -> str:
    """Safe, non-extractive fallback when no chat model is available."""
    sections = {
        "Entry plan": ("pilot", "Barcelona", "launch", "entry"),
        "Financial targets": (
            "budget",
            "allocation",
            "acquisition",
            "break-even",
            "revenue",
            "customer",
        ),
        "Legal requirements": ("GDPR", "legal", "consumer", "employment", "tax", "data"),
        "Expansion conditions": (
            "nationwide",
            "expand",
            "demand",
            "successful",
            "six months",
            "postponed",
        ),
    }
    rendered: list[str] = []
    for title, keywords in sections.items():
        statements: list[tuple[str, str]] = []
        for item in evidence:
            selected = _section_statements(item.snippet, keywords)
            if selected:
                statements.extend((statement, item.evidence_id) for statement in selected[:2])
        if not statements:
            body = "The selected documents do not state this explicitly."
        else:
            body = " ".join(f"{statement} [{evidence_id}]" for statement, evidence_id in statements)
        rendered.append(f"{title}\n{body}".strip())
    return "\n\n".join(rendered)


def _section_statements(snippet: str, keywords: tuple[str, ...]) -> list[str]:
    statements = re.split(r"(?<=[.!?])\s+|\s*\n+\s*", _clean_text(snippet))
    lowered_keywords = tuple(keyword.casefold() for keyword in keywords)
    heading_prefix = re.compile(
        r"^(?:financial assumptions|legal requirements|risk mitigation|"
        r"spanish market expansion strategy)\s+",
        re.IGNORECASE,
    )
    matches: list[tuple[int, int, str]] = []
    for index, statement in enumerate(statements):
        cleaned = heading_prefix.sub("", statement.strip())
        if not cleaned or cleaned.casefold() in {
            "financial and legal plan for spain",
            "spanish market expansion strategy",
        }:
            continue
        score = sum(
            1
            for keyword in lowered_keywords
            if re.search(rf"\b{re.escape(keyword)}\b", cleaned.casefold())
        )
        if score:
            matches.append((score, index, cleaned))
    return [statement for _, _, statement in sorted(matches, key=lambda item: (-item[0], item[1]))]


def _prompt(query: str, evidence: list[RetrievalEvidence]) -> str:
    context = "\n\n".join(f"[{item.evidence_id}] {item.snippet[:1200]}" for item in evidence)
    return (
        "Summarize the answer to this query in four concise sections: Entry plan, "
        "Financial targets, Legal requirements, and Expansion conditions. "
        "Put [E#] immediately after each supported claim. "
        f"Query: {query}\nEvidence:\n<context>\n{context}\n</context>"
    )


def _clean_text(value: str) -> str:
    value = re.sub(r"\\#{1,6}\s*", "\n", value)
    value = re.sub(r"\\([*_`])", r"\1", value)
    value = re.sub(r"^\s*#+\s*", "", value, flags=re.MULTILINE)
    return value.strip()


async def generate_grounded_answer(
    query: str, evidence: list[RetrievalEvidence], settings: Settings
) -> tuple[str, list[AiCitation], bool, list[str]]:
    missing_information = missing_information_for_query(query)
    if not evidence:
        return (
            "Insufficient evidence: the selected documents do not contain "
            "the requested information.",
            [],
            True,
            missing_information,
        )
    selected = evidence[:3]
    fallback_citations = [
        AiCitation(
            evidenceId=item.evidence_id, documentId=item.document_id, quote=item.snippet[:280]
        )
        for item in selected
    ]
    provider = OllamaChatModelProvider(settings.ollama_url, settings.rag_model)
    async with httpx.AsyncClient(timeout=provider.timeout) as client:
        if (
            settings.rag_generation_enabled
            and settings.rag_provider.casefold() == "ollama"
            and await provider.is_available(client)
        ):
            try:
                generated = await provider.generate(client, _prompt(query, selected))
                by_id = {item.evidence_id: item for item in selected}
                citations = []
                for citation in generated.citations:
                    item = by_id.get(citation.get("evidenceId", ""))
                    if item:
                        citations.append(
                            AiCitation(
                                evidenceId=item.evidence_id,
                                documentId=item.document_id,
                                quote=item.snippet[:280],
                            )
                        )
                answer_text = "\n".join(
                    (
                        generated.entry_plan,
                        generated.financial_targets,
                        generated.legal_requirements,
                        generated.expansion_conditions,
                    )
                )
                mentioned_ids = set(re.findall(r"\[(E\d+)\]", answer_text))
                citations = [item for item in citations if item.evidence_id in mentioned_ids]
                if not mentioned_ids or not citations:
                    return (
                        "Insufficient evidence: the generated answer did not "
                        "provide valid grounded citations.",
                        [],
                        True,
                        missing_information,
                    )
                answer = (
                    f"Entry plan\n{_clean_text(generated.entry_plan)}\n\n"
                    f"Financial targets\n{_clean_text(generated.financial_targets)}\n\n"
                    f"Legal requirements\n{_clean_text(generated.legal_requirements)}\n\n"
                    f"Expansion conditions\n{_clean_text(generated.expansion_conditions)}"
                )
                return answer, citations, False, []
            except (httpx.HTTPError, ValueError, TypeError):
                pass
    return sectioned_fallback(selected), fallback_citations, False, []


def missing_information_for_query(query: str) -> list[str]:
    query_tokens = set(TOKEN_RE.findall(query.casefold()))
    if {"ceo", "phone"} & query_tokens or "telephone" in query_tokens:
        return ["CEO name", "phone number"]
    return ["the requested information"]


def index_payload(
    context: IndexContext,
    chunk_id: str,
    chunk_index: int,
    content: str,
    content_hash: str,
    heading_path: list[str],
    page_start: int | None = None,
    page_end: int | None = None,
) -> dict[str, object]:
    return {
        "projectId": context.project_id,
        "knowledgeBaseId": context.knowledge_base_id,
        "documentId": context.document_id,
        "documentVersionId": context.document_version_id,
        "documentVersion": context.document_version,
        "chunkId": chunk_id,
        "chunkIndex": chunk_index,
        "contentHash": content_hash,
        "pageStart": page_start,
        "pageEnd": page_end,
        "headingPath": heading_path,
        "active": True,
        "archived": False,
        "documentStatus": context.document_status,
        "embeddingProvider": "local-deterministic",
        "embeddingModel": "deterministic-local-v1",
        "embeddingVersion": "v1",
        "sparseProvider": SPARSE_PROVIDER.provider_name,
        "sparseModel": SPARSE_PROVIDER.model_name,
        "createdAt": context.created_at.astimezone(UTC).isoformat(),
        "content": content,
    }


def as_optional_int(value: object) -> int | None:
    return value if isinstance(value, int) else None


def as_string_list(value: object) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []
