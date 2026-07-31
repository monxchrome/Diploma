# ADR 0038: Plan catalog versioning

Subscriptions retain a plan code and version. A catalog update is represented by a new configured version, so historical paid subscriptions do not silently inherit changed limits. Definitions must remain available while a subscription references them.
