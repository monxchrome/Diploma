import asyncio
import hashlib
import json
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import Settings

ModelOutput = TypeVar("ModelOutput", bound=BaseModel)
ProviderCode = Literal["OPENAI", "ANTHROPIC", "OLLAMA"]


class ModelProviderError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class TrustedModelProfile(BaseModel):
    id: str
    provider: ProviderCode
    exact_model_id: str = Field(alias="exactModelId", min_length=1)
    family: str = Field(min_length=1)
    runtime: Literal["CLOUD", "LOCAL_OLLAMA"]
    capabilities: dict[str, bool] = Field(default_factory=dict)
    metadata: dict[str, object] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class ModelMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)


class ModelProviderRequest(BaseModel):
    model_profile: TrustedModelProfile = Field(alias="modelProfile")
    messages: list[ModelMessage] = Field(default_factory=list, max_length=100)
    system_instruction: str | None = Field(
        default=None, alias="systemInstruction", max_length=50_000
    )
    response_schema: dict[str, object] | None = Field(default=None, alias="responseSchema")
    temperature: float = Field(ge=0, le=2)
    top_p: float = Field(alias="topP", ge=0, le=1)
    max_output_tokens: int = Field(alias="maxOutputTokens", ge=1, le=16_000)
    seed: int | None = None
    stop_sequences: list[str] = Field(default_factory=list, alias="stopSequences", max_length=10)
    timeout_seconds: float = Field(alias="timeout", gt=0, le=600)
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    trace_id: str | None = Field(default=None, alias="traceId", max_length=128)
    metadata: dict[str, object] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class ModelMetadata(BaseModel):
    context_window_tokens: int | None = Field(default=None, alias="contextWindowTokens")
    digest: str | None = None
    parameter_size: str | None = Field(default=None, alias="parameterSize")
    quantization: str | None = None
    provider_version: str | None = Field(default=None, alias="providerVersion")
    runtime: str

    model_config = ConfigDict(populate_by_name=True)


class ModelProviderResult(BaseModel):
    provider: ProviderCode
    exact_model_id: str = Field(alias="exactModelId")
    model_family: str = Field(alias="modelFamily")
    runtime: str
    text: str
    structured_output: dict[str, object] | None = Field(default=None, alias="structuredOutput")
    input_tokens: int | None = Field(default=None, alias="inputTokens")
    output_tokens: int | None = Field(default=None, alias="outputTokens")
    cached_input_tokens: int | None = Field(default=None, alias="cachedInputTokens")
    reasoning_tokens: int | None = Field(default=None, alias="reasoningTokens")
    total_tokens: int | None = Field(default=None, alias="totalTokens")
    latency_ms: int = Field(alias="latencyMs", ge=0)
    time_to_first_token_ms: int | None = Field(default=None, alias="timeToFirstTokenMs")
    finish_reason: str = Field(alias="finishReason")
    provider_request_id: str | None = Field(default=None, alias="providerRequestId")
    usage_source: Literal["PROVIDER", "ESTIMATED", "UNKNOWN"] = Field(alias="usageSource")
    model_metadata: ModelMetadata = Field(alias="modelMetadata")
    raw_response_hash: str = Field(alias="rawResponseHash")
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)


class UnifiedModelProvider(Protocol):
    provider_name: ProviderCode
    provider_version: str

    async def generate_text(self, request: ModelProviderRequest) -> ModelProviderResult: ...

    async def generate_structured(
        self, request: ModelProviderRequest, output_schema: type[ModelOutput]
    ) -> tuple[ModelProviderResult, ModelOutput]: ...

    async def health_check(self, profile: TrustedModelProfile) -> dict[str, object]: ...

    async def get_model_metadata(self, profile: TrustedModelProfile) -> ModelMetadata: ...

    def estimate_tokens(self, text: str) -> int: ...


class BaseModelProvider:
    provider_name: ProviderCode
    provider_version: str

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.settings = settings
        self.transport = transport

    def estimate_tokens(self, text: str) -> int:
        return max(1, (len(text) + 3) // 4)

    async def generate_structured(
        self, request: ModelProviderRequest, output_schema: type[ModelOutput]
    ) -> tuple[ModelProviderResult, ModelOutput]:
        result = await self._generate(
            request.model_copy(update={"response_schema": output_schema.model_json_schema()})
        )
        try:
            parsed = output_schema.model_validate_json(result.text)
        except ValidationError as error:
            raise ModelProviderError(
                "STRUCTURED_OUTPUT_INVALID", "Structured output validation failed"
            ) from error
        return result.model_copy(
            update={"structured_output": parsed.model_dump(by_alias=True)}
        ), parsed

    async def generate_text(self, request: ModelProviderRequest) -> ModelProviderResult:
        return await self._generate(request.model_copy(update={"response_schema": None}))

    async def _generate(self, request: ModelProviderRequest) -> ModelProviderResult:
        attempts = self.settings.benchmark_provider_retry_attempts + 1
        last_error: ModelProviderError | None = None
        for attempt in range(attempts):
            try:
                return await self._generate_once(request)
            except ModelProviderError as error:
                last_error = error
                if not error.retryable or attempt + 1 >= attempts:
                    raise
                await asyncio.sleep(
                    self.settings.benchmark_provider_retry_delay_ms * (2**attempt) / 1_000
                )
        raise last_error or ModelProviderError("PROVIDER_ERROR", "Provider call failed")

    async def _generate_once(self, request: ModelProviderRequest) -> ModelProviderResult:
        raise NotImplementedError

    def _assert_profile(self, profile: TrustedModelProfile) -> None:
        if profile.provider != self.provider_name:
            raise ModelProviderError(
                "PROFILE_PROVIDER_MISMATCH", "Trusted profile provider mismatch"
            )
        if _is_floating_model_alias(profile.exact_model_id):
            raise ModelProviderError("FLOATING_MODEL_ALIAS", "A pinned exact model ID is required")

    def _hash(self, value: object) -> str:
        return hashlib.sha256(
            json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            )
        ).hexdigest()

    async def _post(
        self,
        url: str,
        payload: dict[str, object],
        headers: dict[str, str],
        timeout_seconds: float,
    ) -> tuple[dict[str, object], httpx.Headers]:
        try:
            async with httpx.AsyncClient(
                timeout=timeout_seconds, transport=self.transport
            ) as client:
                response = await client.post(url, json=payload, headers=headers)
            if response.status_code >= 400:
                raise self._http_error(response)
            value = response.json()
            if not isinstance(value, dict):
                raise ModelProviderError(
                    "MALFORMED_RESPONSE", "Provider response must be an object"
                )
            return _object(value), response.headers
        except httpx.TimeoutException as error:
            raise ModelProviderError(
                "TIMEOUT", "Provider request timed out", retryable=True
            ) from error
        except httpx.TransportError as error:
            raise ModelProviderError(
                "NETWORK_ERROR", "Provider network request failed", retryable=True
            ) from error
        except ValueError as error:
            raise ModelProviderError(
                "MALFORMED_RESPONSE", "Provider response was not valid JSON"
            ) from error

    def _http_error(self, response: httpx.Response) -> ModelProviderError:
        retryable = response.status_code in {408, 409, 429, 500, 502, 503, 504}
        return ModelProviderError(
            f"HTTP_{response.status_code}",
            f"Provider returned HTTP {response.status_code}",
            retryable=retryable,
        )


class OpenAIModelProvider(BaseModelProvider):
    provider_name: ProviderCode = "OPENAI"

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        super().__init__(settings, transport)
        self.provider_version = settings.openai_api_version

    async def health_check(self, profile: TrustedModelProfile) -> dict[str, object]:
        self._assert_profile(profile)
        return {
            "configured": bool(self.settings.openai_api_key.get_secret_value()),
            "provider": self.provider_name,
            "providerVersion": self.provider_version,
            "status": "ok" if self.settings.openai_api_key.get_secret_value() else "unavailable",
        }

    async def get_model_metadata(self, profile: TrustedModelProfile) -> ModelMetadata:
        self._assert_profile(profile)
        return ModelMetadata(runtime="CLOUD", providerVersion=self.provider_version)

    async def _generate_once(self, request: ModelProviderRequest) -> ModelProviderResult:
        self._assert_profile(request.model_profile)
        api_key = self.settings.openai_api_key.get_secret_value()
        if not api_key:
            raise ModelProviderError(
                "CREDENTIALS_UNAVAILABLE", "OpenAI credentials are unavailable"
            )
        messages: list[dict[str, str]] = []
        if request.system_instruction:
            messages.append({"role": "system", "content": request.system_instruction})
        messages.extend(message.model_dump() for message in request.messages)
        payload: dict[str, object] = {
            "model": request.model_profile.exact_model_id,
            "messages": messages,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "max_completion_tokens": request.max_output_tokens,
        }
        if request.seed is not None:
            payload["seed"] = request.seed
        if request.stop_sequences:
            payload["stop"] = request.stop_sequences
        if request.response_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "benchmark_output",
                    "strict": True,
                    "schema": request.response_schema,
                },
            }
        started = time.perf_counter()
        response, headers = await self._post(
            "https://api.openai.com/v1/chat/completions",
            payload,
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            request.timeout_seconds,
        )
        choice = _first_object(response.get("choices"))
        message = _object(choice.get("message"))
        text = _text(message.get("content"))
        if not text:
            raise ModelProviderError("MALFORMED_RESPONSE", "OpenAI response had no message content")
        usage = _object(response.get("usage"))
        prompt_details = _object(usage.get("prompt_tokens_details"))
        completion_details = _object(usage.get("completion_tokens_details"))
        input_tokens = _int_or_none(usage.get("prompt_tokens"))
        output_tokens = _int_or_none(usage.get("completion_tokens"))
        cached = _int_or_none(prompt_details.get("cached_tokens"))
        reasoning = _int_or_none(completion_details.get("reasoning_tokens"))
        return self._result(
            request,
            text=text,
            response=response,
            latency_ms=_elapsed_ms(started),
            finish_reason=_string(choice.get("finish_reason"), "UNKNOWN") or "UNKNOWN",
            provider_request_id=headers.get("x-request-id"),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_input_tokens=cached,
            reasoning_tokens=reasoning,
            usage_source="PROVIDER"
            if input_tokens is not None or output_tokens is not None
            else "UNKNOWN",
        )

    def _result(
        self,
        request: ModelProviderRequest,
        *,
        text: str,
        response: dict[str, object],
        latency_ms: int,
        finish_reason: str,
        provider_request_id: str | None,
        input_tokens: int | None,
        output_tokens: int | None,
        cached_input_tokens: int | None,
        reasoning_tokens: int | None,
        usage_source: Literal["PROVIDER", "ESTIMATED", "UNKNOWN"],
    ) -> ModelProviderResult:
        total = (
            input_tokens + output_tokens
            if input_tokens is not None and output_tokens is not None
            else None
        )
        return ModelProviderResult(
            provider=self.provider_name,
            exactModelId=request.model_profile.exact_model_id,
            modelFamily=request.model_profile.family,
            runtime=request.model_profile.runtime,
            text=text,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cachedInputTokens=cached_input_tokens,
            reasoningTokens=reasoning_tokens,
            totalTokens=total,
            latencyMs=latency_ms,
            timeToFirstTokenMs=None,
            finishReason=finish_reason,
            providerRequestId=provider_request_id,
            usageSource=usage_source,
            modelMetadata=ModelMetadata(runtime="CLOUD", providerVersion=self.provider_version),
            rawResponseHash=self._hash(response),
            createdAt=datetime.now(UTC),
        )


class AnthropicModelProvider(BaseModelProvider):
    provider_name: ProviderCode = "ANTHROPIC"

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        super().__init__(settings, transport)
        self.provider_version = settings.anthropic_api_version

    async def health_check(self, profile: TrustedModelProfile) -> dict[str, object]:
        self._assert_profile(profile)
        return {
            "configured": bool(self.settings.anthropic_api_key.get_secret_value()),
            "provider": self.provider_name,
            "providerVersion": self.provider_version,
            "status": "ok" if self.settings.anthropic_api_key.get_secret_value() else "unavailable",
        }

    async def get_model_metadata(self, profile: TrustedModelProfile) -> ModelMetadata:
        self._assert_profile(profile)
        return ModelMetadata(runtime="CLOUD", providerVersion=self.provider_version)

    async def _generate_once(self, request: ModelProviderRequest) -> ModelProviderResult:
        self._assert_profile(request.model_profile)
        api_key = self.settings.anthropic_api_key.get_secret_value()
        if not api_key:
            raise ModelProviderError(
                "CREDENTIALS_UNAVAILABLE", "Anthropic credentials are unavailable"
            )
        messages = [message.model_dump() for message in request.messages]
        if request.response_schema is not None:
            schema = json.dumps(request.response_schema, ensure_ascii=False, separators=(",", ":"))
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Return only JSON matching this schema. "
                        "Do not include reasoning or markdown. "
                        f"Schema: {schema}"
                    ),
                }
            )
        payload: dict[str, object] = {
            "model": request.model_profile.exact_model_id,
            "max_tokens": request.max_output_tokens,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "messages": messages,
        }
        if request.system_instruction:
            payload["system"] = request.system_instruction
        if request.stop_sequences:
            payload["stop_sequences"] = request.stop_sequences
        started = time.perf_counter()
        response, headers = await self._post(
            "https://api.anthropic.com/v1/messages",
            payload,
            {
                "x-api-key": api_key,
                "anthropic-version": self.provider_version,
                "content-type": "application/json",
            },
            request.timeout_seconds,
        )
        text = "".join(
            _string(item.get("text"), "") or ""
            for item in _object_list(response.get("content"))
            if _string(item.get("type"), "") == "text"
        )
        if not text:
            raise ModelProviderError("MALFORMED_RESPONSE", "Anthropic response had no text content")
        usage = _object(response.get("usage"))
        input_tokens = _int_or_none(usage.get("input_tokens"))
        output_tokens = _int_or_none(usage.get("output_tokens"))
        cached = _int_or_none(usage.get("cache_read_input_tokens"))
        total = (
            input_tokens + output_tokens
            if input_tokens is not None and output_tokens is not None
            else None
        )
        return ModelProviderResult(
            provider=self.provider_name,
            exactModelId=request.model_profile.exact_model_id,
            modelFamily=request.model_profile.family,
            runtime=request.model_profile.runtime,
            text=text,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cachedInputTokens=cached,
            reasoningTokens=None,
            totalTokens=total,
            latencyMs=_elapsed_ms(started),
            timeToFirstTokenMs=None,
            finishReason=_string(response.get("stop_reason"), "UNKNOWN") or "UNKNOWN",
            providerRequestId=headers.get("request-id"),
            usageSource="PROVIDER" if total is not None else "UNKNOWN",
            modelMetadata=ModelMetadata(runtime="CLOUD", providerVersion=self.provider_version),
            rawResponseHash=self._hash(response),
            createdAt=datetime.now(UTC),
        )


class OllamaModelProvider(BaseModelProvider):
    provider_name: ProviderCode = "OLLAMA"
    provider_version = "unknown"

    async def health_check(self, profile: TrustedModelProfile) -> dict[str, object]:
        self._assert_profile(profile)
        try:
            async with httpx.AsyncClient(timeout=10, transport=self.transport) as client:
                version_response = await client.get(
                    f"{self.settings.ollama_url.rstrip('/')}/api/version"
                )
                tags_response = await client.get(f"{self.settings.ollama_url.rstrip('/')}/api/tags")
            if not version_response.is_success or not tags_response.is_success:
                return {"provider": self.provider_name, "status": "unavailable"}
            tags = _object(tags_response.json())
            installed = {
                _string(item.get("name"), _string(item.get("model"), ""))
                for item in _object_list(tags.get("models"))
            }
            version = _string(_object(version_response.json()).get("version"), "unknown")
            return {
                "available": profile.exact_model_id in installed,
                "provider": self.provider_name,
                "providerVersion": version,
                "status": "ok" if profile.exact_model_id in installed else "unavailable",
            }
        except (httpx.HTTPError, ValueError):
            return {"provider": self.provider_name, "status": "unavailable"}

    async def get_model_metadata(self, profile: TrustedModelProfile) -> ModelMetadata:
        self._assert_profile(profile)
        try:
            response, _ = await self._post(
                f"{self.settings.ollama_url.rstrip('/')}/api/show",
                {"model": profile.exact_model_id},
                {"Content-Type": "application/json"},
                min(self.settings.ollama_request_timeout_seconds, 30),
            )
            details = _object(response.get("details"))
            return ModelMetadata(
                runtime="LOCAL_OLLAMA",
                digest=_string(response.get("digest"), None),
                parameterSize=_string(details.get("parameter_size"), None),
                quantization=_string(details.get("quantization_level"), None),
                contextWindowTokens=_int_or_none(
                    _object(response.get("model_info")).get("general.context_length")
                ),
                providerVersion=self.provider_version,
            )
        except ModelProviderError:
            return ModelMetadata(runtime="LOCAL_OLLAMA", providerVersion=self.provider_version)

    async def _generate_once(self, request: ModelProviderRequest) -> ModelProviderResult:
        self._assert_profile(request.model_profile)
        payload: dict[str, object] = {
            "model": request.model_profile.exact_model_id,
            "stream": False,
            "messages": [
                *(
                    [{"role": "system", "content": request.system_instruction}]
                    if request.system_instruction
                    else []
                ),
                *(message.model_dump() for message in request.messages),
            ],
            "options": {
                "temperature": request.temperature,
                "top_p": request.top_p,
                "num_predict": request.max_output_tokens,
                **({"seed": request.seed} if request.seed is not None else {}),
            },
        }
        if request.response_schema is not None:
            payload["format"] = request.response_schema
        if request.stop_sequences:
            options = _object(payload["options"])
            options["stop"] = request.stop_sequences
            payload["options"] = options
        started = time.perf_counter()
        response, _ = await self._post(
            f"{self.settings.ollama_url.rstrip('/')}/api/chat",
            payload,
            {"Content-Type": "application/json"},
            request.timeout_seconds,
        )
        message = _object(response.get("message"))
        text = _string(message.get("content"), "")
        if not text:
            raise ModelProviderError("MALFORMED_RESPONSE", "Ollama response had no message content")
        input_tokens = _int_or_none(response.get("prompt_eval_count"))
        output_tokens = _int_or_none(response.get("eval_count"))
        total = (
            input_tokens + output_tokens
            if input_tokens is not None and output_tokens is not None
            else None
        )
        metadata = await self.get_model_metadata(request.model_profile)
        return ModelProviderResult(
            provider=self.provider_name,
            exactModelId=request.model_profile.exact_model_id,
            modelFamily=request.model_profile.family,
            runtime="LOCAL_OLLAMA",
            text=text,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cachedInputTokens=None,
            reasoningTokens=None,
            totalTokens=total,
            latencyMs=_elapsed_ms(started),
            timeToFirstTokenMs=None,
            finishReason="STOP" if _bool(response.get("done")) else "UNKNOWN",
            providerRequestId=None,
            usageSource="PROVIDER" if total is not None else "UNKNOWN",
            modelMetadata=metadata,
            rawResponseHash=self._hash(response),
            createdAt=datetime.now(UTC),
        )


class ModelProviderRegistry:
    def __init__(self, settings: Settings) -> None:
        self.providers: dict[ProviderCode, UnifiedModelProvider] = {
            "OPENAI": OpenAIModelProvider(settings),
            "ANTHROPIC": AnthropicModelProvider(settings),
            "OLLAMA": OllamaModelProvider(settings),
        }

    def for_profile(self, profile: TrustedModelProfile) -> UnifiedModelProvider:
        return self.providers[profile.provider]


def _elapsed_ms(started: float) -> int:
    return max(0, round((time.perf_counter() - started) * 1_000))


def _is_floating_model_alias(model_id: str) -> bool:
    return model_id.casefold().strip().endswith((":latest", "-latest", "/latest"))


def _object(value: object) -> dict[str, object]:
    return dict(value) if isinstance(value, Mapping) else {}


def _object_list(value: object) -> list[dict[str, object]]:
    return [_object(item) for item in value] if isinstance(value, list) else []


def _first_object(value: object) -> dict[str, object]:
    items = _object_list(value)
    return items[0] if items else {}


def _string(value: object, fallback: str | None) -> str | None:
    return value if isinstance(value, str) else fallback


def _text(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_string(_object(item).get("text"), "") or "" for item in value)
    return ""


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) and value >= 0 else None


def _bool(value: object) -> bool:
    return value is True
