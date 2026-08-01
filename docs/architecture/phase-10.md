# Phase 10 Architecture

Phase 10 adds immutable report snapshots, private document export, unlisted secure sharing and anchored collaboration without changing the decision engine. A successful `AnalysisRun` creates exactly one initial `ReportSnapshot`; failed and cancelled runs do not. Re-running an analysis creates a new run and the next version in the same `ReportLineage`.

```text
Completed AnalysisRun -> server-side sanitizer -> immutable ReportSnapshot
                                            -> content hash + audit event
Snapshot -> BullMQ report-export -> trusted renderer -> private MinIO artifact
Snapshot (published only) -> token hash -> unlisted shared report
```

Snapshot content is an allowlisted, normalized report contract. It has stable `section:*` anchors and preserves the existing `E…` and `W…` evidence identifiers. Snapshot persistence excludes runtime UI state, model prompts, chain of thought, raw document content, object keys, signed URLs, provider credentials and rejected prompt-injection text. The SHA-256 content hash is deterministic over canonical safe content and is an integrity identifier, not a legal digital signature.

Exports use a single bounded BullMQ queue. PDF, DOCX, Markdown and print HTML are rendered from a snapshot only. Artifacts are private, use server-owned storage keys and receive a signed download URL only on an authorized download request; neither object keys nor signed URLs are returned in public payloads. Export creation is idempotent for the same requester, snapshot, format, template and options.

Share tokens are CSPRNG values returned only at creation or rotation. PostgreSQL stores only a SHA-256 token hash and an eight-character diagnostic prefix. Public views are minimal, read-only and `noindex`; they never disclose source files, raw evidence, project membership, analysis identifiers, prompts or private metadata. Revocation and expiry take effect on the next request. View limits use an atomic update.

Comments are attached to a snapshot, never a DOM position. General, section, citation and evidence-summary anchors are validated server-side. Snapshot versions do not automatically carry comments forward. Mentions are limited to project members and create in-app notifications without storing the comment body in notification metadata. Phase 10 uses polling/query invalidation because the existing application has no realtime collaboration transport.

Brand profiles are account-owner scoped and a project selects one allowed profile. Snapshot-specific branding is deliberately not mutable; arbitrary CSS, HTML, remote images, scripts and font uploads are not supported.

The initial Phase 10 database change is `0010_phase_10_report_collaboration`. It does not modify historical migrations. Existing completed runs obtain snapshots lazily through the idempotent analysis snapshot endpoint; new successful runs receive them automatically.

Report entitlements are introduced in the new `phase-10-v1` plan catalog. The Phase 8 catalog remains intact; subscriptions that still point to an older catalog resolve the new fields to secure `false`/zero defaults until their catalog version is explicitly moved forward.

Current intentionally bounded limitations: password-protected shares, email notification delivery, realtime cursor/editor collaboration, report HTML/CSS editing, and external logo upload/derivative processing are not implemented. Phase 11 model benchmarking and Phase 12 release/defense material remain out of scope.
