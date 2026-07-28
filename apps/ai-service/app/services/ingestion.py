import hashlib
import html
import re
import uuid
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from app.schemas.contracts import AiIngestionResponse, IngestionChunk

MAX_DOCX_ENTRIES = 2_000
MAX_DOCX_UNCOMPRESSED_BYTES = 100_000_000
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html",
    "text/markdown",
    "text/plain",
}


@dataclass(frozen=True)
class ParsedDocument:
    mime_type: str
    parser_name: str
    text: str


class _SafeHtmlText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "iframe", "object", "embed"}:
            self.skip_depth += 1
        if self.skip_depth == 0 and tag in {
            "p",
            "br",
            "li",
            "tr",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
        }:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "iframe", "object", "embed"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            self.parts.append(data)


def inspect_and_parse(path: Path, declared_mime_type: str) -> ParsedDocument:
    detected = detect_mime(path)
    if detected not in ALLOWED_MIME_TYPES or detected != declared_mime_type:
        raise ValueError("The document type does not match the upload intent")
    if detected == "application/pdf":
        raise ValueError("PDF parsing requires the configured Docling adapter")
    if detected == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return ParsedDocument(detected, "stdlib-docx", _parse_docx(path))
    raw = path.read_text(encoding="utf-8", errors="replace")
    if detected == "text/html":
        parser = _SafeHtmlText()
        parser.feed(raw)
        raw = "".join(parser.parts)
    return ParsedDocument(detected, "safe-text", normalize_text(raw))


def build_response(
    path: Path, declared_mime_type: str, document_version_id: str
) -> AiIngestionResponse:
    parsed = inspect_and_parse(path, declared_mime_type)
    chunks = chunk_text(parsed.text, document_version_id=document_version_id)
    if not chunks:
        raise ValueError("The document does not contain indexable text")
    checksum = _sha256_file(path)
    return AiIngestionResponse(
        checksumSha256=checksum,
        detectedMimeType=parsed.mime_type,
        parserName=parsed.parser_name,
        parserVersion="v1",
        characterCount=len(parsed.text),
        tokenCount=sum(chunk.token_count for chunk in chunks),
        embeddingModel="deterministic-local-v1",
        embeddingDimension=64,
        chunks=chunks,
    )


def chunk_text(
    text: str, document_version_id: str = "legacy", limit: int = 1_200, overlap: int = 160
) -> list[IngestionChunk]:
    words = text.split()
    chunks: list[IngestionChunk] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + limit)
        content = " ".join(words[start:end]).strip()
        if content:
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            chunks.append(
                IngestionChunk(
                    content=content,
                    tokenCount=len(content.split()),
                    chunkIndex=len(chunks),
                    contentHash=content_hash,
                    vectorPointId=str(
                        uuid.uuid5(
                            uuid.NAMESPACE_URL,
                            f"{document_version_id}:{len(chunks)}:{content_hash}",
                        )
                    ),
                    headingPath=[],
                    metadata={"chunkerVersion": "v1"},
                )
            )
        if end == len(words):
            break
        start = end - overlap
    return chunks


def deterministic_embedding(content: str, dimension: int = 64) -> list[float]:
    values = [0.0] * dimension
    for token in content.lower().split():
        digest = hashlib.sha256(token.encode()).digest()
        index = digest[0] % dimension
        values[index] += -1.0 if digest[1] & 1 else 1.0
    magnitude = sum(value * value for value in values) ** 0.5
    return [value / magnitude if magnitude else 0.0 for value in values]


def detect_mime(path: Path) -> str:
    with path.open("rb") as source:
        sample = source.read(512)
    prefix = sample[:8]
    if prefix.startswith(b"%PDF-"):
        return "application/pdf"
    if prefix.startswith(b"PK\x03\x04"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    raw = sample.lstrip().lower()
    if raw.startswith(b"<!doctype html") or raw.startswith(b"<html"):
        return "text/html"
    return "text/markdown" if path.suffix.lower() in {".md", ".markdown"} else "text/plain"


def normalize_text(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", html.unescape(value).replace("\r\n", "\n")).strip()


def _parse_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if (
            len(infos) > MAX_DOCX_ENTRIES
            or sum(item.file_size for item in infos) > MAX_DOCX_UNCOMPRESSED_BYTES
        ):
            raise ValueError("DOCX archive exceeds safe limits")
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    return normalize_text(
        "\n".join(node.text or "" for node in root.iter() if node.tag.endswith("}t"))
    )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
