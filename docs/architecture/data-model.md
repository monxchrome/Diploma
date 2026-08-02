# Data Model Overview

The authoritative schema is [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma). Prisma migrations `0001_init` through `0011_phase_11_benchmarking` are historical and must not be edited.

| Domain                    | Principal records                                                                                          | Integrity boundary                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Identity and access       | `User`, `AuthSession`, `Project`, `ProjectMember`, `AuditLog`                                              | Users and project membership scope access; sessions keep token hashes.                                    |
| Knowledge and retrieval   | `KnowledgeBase`, `Document`, `DocumentVersion`, `IngestionJob`, retrieval records                          | Versioned documents reference private storage; Qdrant is a derived retrieval index.                       |
| Analysis and research     | `DecisionAnalysis`, `AnalysisRun`, agent/research/evidence records                                         | Runs are statused, queued, and tied to project/evidence context.                                          |
| Billing and usage         | plans, subscriptions, webhook events, usage events/aggregates/reservations                                 | Provider events and usage are idempotent, server-owned, and account scoped.                               |
| Reports and collaboration | `ReportLineage`, `ReportSnapshot`, exports, share links, comments, mentions, notifications                 | Snapshot versions are immutable; public tokens are stored hashed and can expire/revoke.                   |
| Benchmarking              | profiles, prompts, datasets, suites, runs, invocations, evaluations, statistics, reproducibility artifacts | Frozen datasets/suites/profiles preserve experimental context; secrets and hidden reasoning are excluded. |

PostgreSQL is the source of truth. MinIO and Qdrant recovery must be coordinated with its document/version records, while Redis/BullMQ data must be reconciled through durable job state and idempotency keys. See the [recovery runbook](../operations/backup-restore.md).
