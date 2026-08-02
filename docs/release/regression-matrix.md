# Release Regression Matrix

The existing phase architecture documents remain the acceptance source. This matrix specifies release evidence; it does not claim the rows have passed.

| Area      | Critical regression                               | Automated evidence             | Manual evidence                        | Current status |
| --------- | ------------------------------------------------- | ------------------------------ | -------------------------------------- | -------------- |
| Phase 1   | Web → API → AI smoke                              | Root tests and health scripts  | `/api/status`                          | NOT EXECUTED   |
| Phase 2   | Registration, session refresh, project RBAC       | API/web auth tests             | New-user flow                          | NOT EXECUTED   |
| Phase 3   | Private upload and queued ingestion               | API/AI tests                   | Upload and reprocess                   | NOT EXECUTED   |
| Phase 4   | Dense/sparse/hybrid grounded answer               | API/AI retrieval tests         | Ask with citations                     | NOT EXECUTED   |
| Phase 5   | Single/multi-agent run, cancellation, idempotency | API/AI graph tests             | Focused and multi-perspective analysis | NOT EXECUTED   |
| Phase 6   | Controlled web policy and experiments             | API/AI research tests          | Unsafe source rejection                | NOT EXECUTED   |
| Phase 7–8 | Quotas, fake billing, webhook isolation           | Billing tests                  | Fake/test upgrade only                 | NOT EXECUTED   |
| Phase 9   | Conversation-first responsive UX                  | Web tests                      | Keyboard, mobile, screen reader sample | NOT EXECUTED   |
| Phase 10  | Snapshot/export/share/comments                    | API/web report tests           | Revoke share and mention notification  | NOT EXECUTED   |
| Phase 11  | Frozen benchmark/reproducibility workflow         | Benchmark tests                | Fixture controlled suite only          | NOT EXECUTED   |
| Phase 12  | Version/preflight/static demo assets              | Version unit tests and scripts | `/api/version`, release checklist      | PARTIAL        |

No test must be marked passed merely because its command exists. Preserve failure logs and include known failures in [known issues](known-issues.md).
