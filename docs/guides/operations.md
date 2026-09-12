# Operations

PostgreSQL is the system of record. Redis backs BullMQ, notifications, and limits; R2 holds staged archives and artifacts. Use structured, redacted logs from API, worker, and sandbox-runner to investigate a scan, and inspect persisted scan/module/execution/invocation records for durable state.

Retention, email lifecycle work, workspace destruction, and artifact cleanup are owned by API storage/auth services and worker workspace flows. Never terminate another operator's live stack to run diagnostics.
