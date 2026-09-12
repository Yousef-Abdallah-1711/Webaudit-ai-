# Architecture Overview

WebAudit AI is a pnpm/Turbo monorepo for auditing a target across security, SEO, performance, testing, and UI. The web app submits authenticated requests to the API; the API owns durable state in PostgreSQL and schedules work through Redis/BullMQ; workers execute the audit pipeline.

## Layers

- `apps/web` is the Next.js 15 / React 19 customer and operator UI.
- `apps/api` is the Express HTTP boundary. It validates requests, authorizes users, manages credits and billing records, persists state with Prisma, and publishes realtime updates.
- `apps/worker` consumes phase jobs, runs deterministic capabilities, requests bounded AI interpretation through the executor, persists results before emitting progress, and performs cleanup.
- `apps/sandbox-runner` hosts installed capabilities in a separate bounded process. `apps/probe-pool` currently provides browser-pool code, rather than a standalone transport.
- Shared packages hold contracts, configuration, safe networking/archive handling, capability discovery, redaction, AI-provider fallback/metering, and scoring.

## Boundaries

PostgreSQL is authoritative; Redis carries queues, limits, and notifications, while R2 stores staged archives and artifacts. Capability code is discovered through `@webaudit/capability-sdk`; core orchestration must not name individual capabilities. Deterministic checks run before AI, all model calls pass through `@webaudit/ai-executor`, and untrusted installed capability code has no API/worker credentials or direct network/file-system access.

## Related

- [Request flow](request-flow.md)
- [Folder structure](folder-structure.md)
- [Endpoint reference](../reference/endpoints.md)
