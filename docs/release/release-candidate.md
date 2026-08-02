# Release Candidate and Final Gate

The repository can be called `1.0.0-rc.1` only after all BLOCKER and CRITICAL findings in the release-readiness audit are closed or the release is stopped. The final `1.0.0` gate requires:

1. Exact source version, release manifest, commit SHA, build timestamp, and image digests are recorded.
2. Full automated regression, Compose validation, and final builds pass with saved logs.
3. Clean migration and upgrade rehearsal pass; historical Prisma migrations remain unchanged.
4. Backup/restore, Qdrant recovery, and Redis/queue recovery are tested against synthetic disposable data.
5. Security, dependency, secret, and license reviews have recorded outcomes.
6. Production preflight and a non-destructive smoke test pass with real deployment secrets stored outside the repository.
7. The demo seed/reset/verify and offline fallback are exercised.
8. Benchmark/defence conclusions point to real frozen artifacts or explicitly state that no result exists.

At present this gate is **NOT READY**. No Git tag, public release, deployment, or payment action is authorized by this document.

The metadata-only fixture at `fixtures/production-preflight.env` is safe to use when testing the parser with `pnpm release:preflight -- --production docs/release/fixtures/production-preflight.env`; it is not a deployable environment file.
