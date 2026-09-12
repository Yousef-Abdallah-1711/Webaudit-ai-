# Folder Structure

| Location | Responsibility |
| --- | --- |
| `apps/web/` | Next.js customer and operator interfaces. |
| `apps/api/` | Express routes, middleware, Prisma access, services, storage, billing, and realtime. |
| `apps/worker/` | BullMQ consumers, orchestration, module execution, reverify/readiness workflows. |
| `apps/sandbox-runner/` | Isolated installed-capability execution host and limits. |
| `apps/probe-pool/` | Browser provisioning/pooling library. |
| `packages/` | Shared contracts and isolated platform concerns. |
| `infrastructure/` | Local Docker services and production/sandbox deployment material. |
| `apps/api/prisma/` | Schema, migrations, and generated client output (the schema/migrations are source; generated client output is not). |
| `docs/` | Source-verified documentation, reviews, and engineering plans. |

Key packages are `types`, `config`, `capability-sdk`, `capabilities-vendored`, `ai-executor`, `redaction`, `safe-net`, `safe-archive`, and `scoring`. The `var/` tree, dependency/build outputs, `.playwright-mcp/`, and the `showcase-*` workspaces are not part of the WebAudit application documentation scope.
