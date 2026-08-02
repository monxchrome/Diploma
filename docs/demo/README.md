# Demonstration Package

`datasets/demo/release-1.0.0.json` is a deliberately synthetic source pack. `pnpm demo:verify` checks that it is versioned, synthetic, contains multiple sources, and has no simple confidential-data markers. This check does not create users, upload files, seed PostgreSQL, execute analysis, export a report, or test the UI.

## Safe partial walkthrough

1. Start an isolated environment with `NODE_ENV=demo`; never point demo configuration at production data or secrets.
2. Show the Demo environment marker and confirm `GET /api/version` reports `environment: "demo"`.
3. Explain the Northstar scenario and show the three synthetic source texts.
4. If a completed demo seed and report fixture have been implemented and verified in the chosen environment, run the documented normal product flow. Otherwise stop at the source-pack walkthrough and state that full application demo seeding is not yet available.
5. Keep fake billing only in demo/test; do not create real payment, public share, or external-provider activity for a defence demonstration.

## Offline fallback

Use the static source pack, [short demo script](short-demo-script.md), architecture diagram, and screenshots recorded from a separately verified non-production run. Do not present a static artifact as a live analysis or a benchmark result.

## Open blocker

An idempotent application-level demo seed/reset/verify flow is not present in this working tree. This is RRA-002/KI-001 and blocks final release approval.
