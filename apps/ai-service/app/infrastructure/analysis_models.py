import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.core.logging import get_logger

AgentKind = Literal["PLANNER", "SPECIALIST", "COORDINATOR", "CRITIC"]
ModelOutput = TypeVar("ModelOutput", bound=BaseModel)


class ModelUnavailableError(RuntimeError):
    pass


class ModelOutputValidationError(RuntimeError):
    pass


class ChatModelProvider(Protocol):
    provider_name: str

    async def is_available(self, model: str) -> bool: ...

    async def generate_structured(
        self,
        *,
        model: str,
        max_tokens: int,
        system_instruction: str,
        input_data: dict[str, object],
        output_schema: type[ModelOutput],
    ) -> ModelOutput: ...


@dataclass(frozen=True)
class ModelNodeConfig:
    provider: str
    model: str
    max_tokens: int


class OllamaStructuredChatModelProvider:
    provider_name = "ollama"

    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def is_available(self, model: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout_seconds, 10.0)) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            payload = response.json()
            models = payload.get("models", []) if isinstance(payload, dict) else []
            names = {
                str(item.get("name", item.get("model", "")))
                for item in models
                if isinstance(item, dict)
            }
            return model in names
        except (httpx.HTTPError, TypeError, ValueError):
            return False

    async def generate_structured(
        self,
        *,
        model: str,
        max_tokens: int,
        system_instruction: str,
        input_data: dict[str, object],
        output_schema: type[ModelOutput],
    ) -> ModelOutput:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "stream": False,
                    "format": output_schema.model_json_schema(),
                    "options": {"temperature": 0, "num_predict": max_tokens},
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {
                            "role": "user",
                            "content": json.dumps(
                                input_data, ensure_ascii=False, separators=(",", ":")
                            ),
                        },
                    ],
                },
            )
            response.raise_for_status()
        payload = response.json()
        message = payload.get("message", {}) if isinstance(payload, dict) else {}
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise ModelOutputValidationError("Model response did not contain message.content")
        try:
            return output_schema.model_validate_json(content)
        except ValidationError as error:
            raise ModelOutputValidationError(
                "Model response failed structured validation"
            ) from error


class AnalysisModelRuntime:
    def __init__(
        self,
        *,
        provider: ChatModelProvider,
        configs: dict[AgentKind, ModelNodeConfig],
    ) -> None:
        self.provider = provider
        self.configs = configs
        self.logger = get_logger()

    @classmethod
    def from_settings(cls, settings: Settings) -> "AnalysisModelRuntime":
        configs: dict[AgentKind, ModelNodeConfig] = {
            "PLANNER": ModelNodeConfig(
                settings.agent_planner_provider,
                settings.agent_planner_model,
                settings.agent_planner_max_tokens,
            ),
            "SPECIALIST": ModelNodeConfig(
                settings.agent_specialist_provider,
                settings.agent_specialist_model,
                settings.agent_specialist_max_tokens,
            ),
            "COORDINATOR": ModelNodeConfig(
                settings.agent_coordinator_provider,
                settings.agent_coordinator_model,
                settings.agent_coordinator_max_tokens,
            ),
            "CRITIC": ModelNodeConfig(
                settings.agent_critic_provider,
                settings.agent_critic_model,
                settings.agent_critic_max_tokens,
            ),
        }
        providers = {config.provider.casefold() for config in configs.values()}
        if providers != {"ollama"}:
            configured = ", ".join(sorted(providers))
            raise ModelUnavailableError(
                f"Unsupported Phase 5 model provider configuration: {configured}"
            )
        return cls(
            provider=OllamaStructuredChatModelProvider(
                settings.ollama_url, settings.agent_model_timeout_seconds
            ),
            configs=configs,
        )

    async def ensure_available(self, analysis_run_id: str) -> None:
        availability: dict[str, bool] = {}
        for agent_type, config in self.configs.items():
            key = f"{config.provider}:{config.model}"
            if key not in availability:
                availability[key] = (
                    config.provider.casefold() == self.provider.provider_name.casefold()
                    and await self.provider.is_available(config.model)
                )
            if not availability[key]:
                self._log(
                    analysis_run_id=analysis_run_id,
                    node_name="model_preflight",
                    agent_type=agent_type,
                    config=config,
                    validation_status="UNAVAILABLE",
                    output_length=0,
                )
                raise ModelUnavailableError(
                    f"Phase 5 {agent_type.lower()} model is unavailable "
                    f"({config.provider}/{config.model})"
                )

    async def invoke(
        self,
        *,
        analysis_run_id: str,
        node_name: str,
        agent_type: AgentKind,
        system_instruction: str,
        input_data: dict[str, object],
        output_schema: type[ModelOutput],
        validator: Callable[[ModelOutput], None] | None = None,
    ) -> ModelOutput:
        config = self.configs[agent_type]
        try:
            output = await self.provider.generate_structured(
                model=config.model,
                max_tokens=config.max_tokens,
                system_instruction=system_instruction,
                input_data=input_data,
                output_schema=output_schema,
            )
            validated = output_schema.model_validate(output.model_dump(by_alias=True))
        except (ValidationError, ModelOutputValidationError) as error:
            self._log(
                analysis_run_id=analysis_run_id,
                node_name=node_name,
                agent_type=agent_type,
                config=config,
                validation_status="INVALID",
                output_length=0,
                validation_stage="STRUCTURED_SCHEMA",
                validation_reason_code="SCHEMA_MISMATCH",
            )
            raise ModelOutputValidationError(
                f"Phase 5 {node_name} output failed structured validation"
            ) from error
        except Exception:
            self._log(
                analysis_run_id=analysis_run_id,
                node_name=node_name,
                agent_type=agent_type,
                config=config,
                validation_status="ERROR",
                output_length=0,
                validation_stage="MODEL_CALL",
                validation_reason_code="PROVIDER_ERROR",
            )
            raise
        if validator is not None:
            try:
                validator(validated)
            except ValueError as error:
                self._log(
                    analysis_run_id=analysis_run_id,
                    node_name=node_name,
                    agent_type=agent_type,
                    config=config,
                    validation_status="INVALID",
                    output_length=len(validated.model_dump_json(by_alias=True)),
                    validation_stage="SEMANTIC",
                    validation_reason_code=_validation_reason_code(error),
                )
                raise ModelOutputValidationError(
                    f"Phase 5 {node_name} output failed semantic validation"
                ) from error
        self._log(
            analysis_run_id=analysis_run_id,
            node_name=node_name,
            agent_type=agent_type,
            config=config,
            validation_status="VALID",
            output_length=len(validated.model_dump_json(by_alias=True)),
            validation_stage="COMPLETE",
            validation_reason_code=None,
        )
        return validated

    def _log(
        self,
        *,
        analysis_run_id: str,
        node_name: str,
        agent_type: AgentKind,
        config: ModelNodeConfig,
        validation_status: str,
        output_length: int,
        validation_stage: str = "PREFLIGHT",
        validation_reason_code: str | None = None,
    ) -> None:
        self.logger.info(
            "analysis_model_node",
            analysisRunId=analysis_run_id,
            nodeName=node_name,
            agentType=agent_type,
            provider=config.provider,
            model=config.model,
            usedFallback=False,
            outputValidationStatus=validation_status,
            outputLength=output_length,
            validationStage=validation_stage,
            validationReasonCode=validation_reason_code,
        )


def _validation_reason_code(error: ValueError) -> str:
    message = str(error).casefold()
    if "unknown evidence id" in message:
        return "UNKNOWN_EVIDENCE_ID"
    if "invalid document id" in message:
        return "DOCUMENT_ID_MISMATCH"
    if "evidence indicates" in message:
        return "FORBIDDEN_TEMPLATE"
    if "markdown" in message:
        return "RAW_MARKDOWN"
    if "financial specialist" in message:
        return "FINANCIAL_GATE_MISMATCH"
    return "SEMANTIC_POSTCONDITION_FAILED"
