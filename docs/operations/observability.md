# Observability and Alerting Guide

Current code provides structured API logging through Pino, structured AI logging, request IDs, and live/readiness/dependency/billing health endpoints. API logs redact authorization, cookies, passwords, and response cookies. This repository does not contain a production metrics or alert-delivery backend configuration.

Operators must configure their approved monitoring system to probe:

- `/api/health/live` for process liveness;
- `/api/health/ready` for API dependencies;
- `/api/health/billing` for configured billing readiness;
- `/api/version` to correlate a safe release identity;
- `/health/live` and `/health/ready` on the internal AI service.

Set alert thresholds from measured normal behaviour, not invented targets. At minimum, route sustained readiness failure, repeated worker failures, storage/database capacity pressure, backup failure, and error-rate escalation to an on-call owner. Test alert delivery after configuration and retain evidence. Alert delivery is **not tested** in this repository audit.
