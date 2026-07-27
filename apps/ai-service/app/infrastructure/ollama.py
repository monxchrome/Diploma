from dataclasses import dataclass


@dataclass(frozen=True)
class OllamaSettings:
    base_url: str
