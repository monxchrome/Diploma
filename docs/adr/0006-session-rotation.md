# ADR 0006: Session Rotation

## Status

Accepted

## Decision

Represent each browser refresh session with an `AuthSession` row. The client receives an opaque token formatted as a session id plus random secret. The client does not interpret this value. The server uses the session id to find the row and verifies the HMAC hash of the full token.

Every refresh replaces the stored hash and refresh cookie. If an old token is presented after rotation, the API revokes the full `familyId` to contain replay risk.

## Consequences

- Only one concurrent refresh can rotate a session successfully.
- A replayed old refresh token is detectable even after its hash has been replaced.
- Session listing and revocation can operate on stable session ids without exposing refresh secrets.
- The implementation favors replay containment over allowing multiple simultaneous refresh successes.
