# Usage Metering

`UsageEvent` is immutable and unique by idempotency key. It records analysis runs, agent-mode runs, research queries/pages/bytes, experiment runs, storage, export operations, model-token telemetry, and estimated model cost when it is available.

Events update an account aggregate and, for project work, a project aggregate in the same transaction. `UsageService.rebuildAggregates` recreates aggregates from ledger entries. FREE uses UTC calendar months; an effective paid subscription uses its provider subscription period.
