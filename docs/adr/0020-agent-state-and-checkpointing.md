# ADR 0020: Agent state and checkpointing

Persist sanitized run checkpoints in PostgreSQL through NestJS persistence. A checkpoint is tied to an immutable run and graph version; incompatible versions do not resume silently.
