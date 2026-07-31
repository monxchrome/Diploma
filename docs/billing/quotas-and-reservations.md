# Quotas and Reservations

Resource creation checks happen before expensive provider calls. Monthly runs, storage, research capacity, experiments, and concurrent slots are reserved with a deterministic key. PostgreSQL advisory locks serialize checks for an account, period, and metric. The check includes committed account aggregate usage plus active reservations.

Completion finalizes only actual consumed quantity. Cancellation, failure, and zero-consumption operations release reservations. Expired reservations are excluded and can be cleaned through `QuotaService.expireReservations`. Rejections use `QUOTA_EXCEEDED` with safe resource, usage, limit, reset time, and upgrade options only.
