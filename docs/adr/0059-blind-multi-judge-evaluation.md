# ADR 0059: Blind multi-judge evaluation

## Decision

Treat human and LLM judge evaluation as blinded, versioned measurements with randomized display order.

## Consequences

Variant/provider labels are hidden from evaluators; disagreement and uncertainty remain reportable instead of collapsing into an unqualified score.
