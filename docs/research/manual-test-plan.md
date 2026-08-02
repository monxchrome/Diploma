# Manual Test Plan

1. Configure pinned server-side profiles and verify provider health without exposing credentials.
2. Run the idempotent Phase 11 seed, create a suite from V1–V10 templates, attach frozen synthetic evidence and freeze it.
3. Estimate and run controlled V1/V2 with three repetitions and a saved seed; verify identical evidence hashes, no retrieval/research activity, randomized but repeatable order and unique CaseRuns.
4. Inspect safe invocation metadata, failures, metrics, paired statistics and limitations.
5. Repeat with end-to-end protocol and verify distinct evidence snapshots and protocol labelling.
6. Enable blinded human evaluation, assign a task, submit one score and confirm duplicate submission is rejected.
7. Request a reproducibility ZIP and verify that its private, short-lived link contains the manifest, structured outputs, safe accounting, evaluations and statistics—but no secret, raw payload or hidden reasoning.
