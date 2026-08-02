# Security Review — Release Candidate

## Reviewed controls

| Area                          | Static evidence                                                                                                                            | Status                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Transport and exposure        | Caddy is the only production port publisher; internal services use the internal network.                                                   | Static review only               |
| Authentication and sessions   | Secure HttpOnly refresh cookie configuration, session rotation, throttling, and production secret validation are implemented.              | Requires E2E verification        |
| Authorization                 | Project membership/RBAC checks and server-owned entitlement checks are part of API services.                                               | Requires regression verification |
| Secrets                       | API/AI support `*_FILE` Docker secrets and logging redaction; no values are returned from version/health endpoints.                        | Static secret scan pending       |
| Upload/retrieval/web research | Private object storage, bounded inputs, controlled fetcher, and private-network blocking are implemented.                                  | Requires hostile-input tests     |
| Reports and sharing           | Snapshots, short-lived downloads, hashed share tokens, expiry/revocation controls, and server sanitization are implemented.                | Requires E2E verification        |
| Containers                    | App images use non-root users; Compose drops capabilities, enables no-new-privileges, and uses read-only root filesystems where supported. | Requires built-image inspection  |

## Findings and release position

No penetration test, independent code review, secret-manager inspection, vulnerability scan, or production smoke test was performed in this audit. The release must not claim certification or the absence of vulnerabilities. Open security-relevant release items are RRA-005, RRA-006, RRA-008, and KI-004. See [threat model](threat-model.md), [privacy review](privacy-review.md), and [release audit](../release/release-readiness-audit.md).
