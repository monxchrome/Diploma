import hashlib
import hmac
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.schemas.contracts import AiIngestionRequest, AiIngestionResponse
from app.services.ingestion import build_response, deterministic_embedding

router = APIRouter(prefix="/v1/internal", tags=["internal"])


@router.post("/ingestions", response_model=AiIngestionResponse)
async def ingest(
    payload: AiIngestionRequest,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> AiIngestionResponse:
    settings = get_settings()
    if internal_secret != settings.ingestion_internal_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal authentication failed"
        )
    if ".." in payload.storage_key.split("/") or payload.storage_key.startswith("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage key")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix="dip-ingestion-", suffix=Path(payload.storage_key).suffix
    )
    os.close(descriptor)
    file_path = Path(temporary_name)
    try:
        await _download_object(file_path, payload.storage_key)
        if file_path.stat().st_size > settings.document_max_upload_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Document exceeds configured size limit",
            )
        response = build_response(file_path, payload.declared_mime_type)
        await _index_chunks(response)
        return response
    finally:
        file_path.unlink(missing_ok=True)


async def _download_object(destination: Path, storage_key: str) -> None:
    settings = get_settings()
    endpoint = settings.minio_endpoint.rstrip("/")
    path = f"/{settings.minio_bucket}/{quote(storage_key, safe='/')}"
    parsed = urlparse(endpoint)
    host = parsed.netloc
    now = datetime.now(UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date = now.strftime("%Y%m%d")
    payload_hash = "UNSIGNED-PAYLOAD"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        (
            "GET",
            path,
            "",
            f"host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n",
            signed_headers,
            payload_hash,
        )
    )
    scope = f"{date}/us-east-1/s3/aws4_request"
    string_to_sign = "\n".join(
        (
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        )
    )
    secret = settings.minio_secret_key.get_secret_value()
    signing_key = _sign(
        _sign(_sign(_sign(f"AWS4{secret}".encode(), date), "us-east-1"), "s3"), "aws4_request"
    )
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    authorization = (
        f"AWS4-HMAC-SHA256 Credential={settings.minio_access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    headers = {
        "Authorization": authorization,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    async with (
        httpx.AsyncClient(timeout=60.0) as client,
        client.stream("GET", f"{endpoint}{path}", headers=headers) as response,
    ):
        if response.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Uploaded object was not found"
            )
        response.raise_for_status()
        declared_size = int(response.headers.get("content-length", "0"))
        if declared_size > settings.document_max_upload_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Document exceeds configured size limit",
            )
        downloaded = 0
        with destination.open("wb") as target:
            async for block in response.aiter_bytes():
                downloaded += len(block)
                if downloaded > settings.document_max_upload_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Document exceeds configured size limit",
                    )
                target.write(block)


def _sign(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode(), hashlib.sha256).digest()


async def _index_chunks(response: AiIngestionResponse) -> None:
    collection = "dip_document_chunks_v1"
    base_url = get_settings().qdrant_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        create = await client.put(
            f"{base_url}/collections/{collection}",
            json={"vectors": {"size": response.embedding_dimension, "distance": "Cosine"}},
        )
        if create.status_code not in {status.HTTP_200_OK, status.HTTP_409_CONFLICT}:
            create.raise_for_status()
        points = [
            {
                "id": chunk.vector_point_id,
                "vector": deterministic_embedding(chunk.content, response.embedding_dimension),
                "payload": {"contentHash": chunk.content_hash, "tokenCount": chunk.token_count},
            }
            for chunk in response.chunks
        ]
        indexed = await client.put(
            f"{base_url}/collections/{collection}/points?wait=true", json={"points": points}
        )
        indexed.raise_for_status()
