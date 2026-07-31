# ADR 0040: Quota reservations

Operations reserve capacity before invoking costly work and finalize actual consumption afterward. PostgreSQL advisory locks make the committed-usage plus reservation check safe under concurrent requests. Reservations expire and are explicitly released on failure or cancellation.
