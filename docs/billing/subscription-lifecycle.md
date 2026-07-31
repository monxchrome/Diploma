# Subscription Lifecycle

Subscription states are NONE, TRIALING, ACTIVE, PAST_DUE, UNPAID, PAUSED, CANCELLED, INCOMPLETE, and EXPIRED. ACTIVE and TRIALING are paid. PAST_DUE follows a bounded provider-period grace policy and displays a warning. A cancellation scheduled at period end remains paid until that end. Other non-effective states fall back to FREE creation limits.

Downgrade, payment failure, and cancellation never delete projects, documents, analyses, reports, experiments, or evidence. Accounts over a new lower limit can still read and delete existing data.
