from dataclasses import dataclass


@dataclass(frozen=True)
class QdrantSettings:
    url: str
