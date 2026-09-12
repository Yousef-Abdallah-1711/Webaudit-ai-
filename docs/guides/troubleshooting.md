# Troubleshooting

Validate local dependencies first: PostgreSQL/Redis must be reachable at the configured URLs, migrations must match `apps/api/prisma/schema.prisma`, and AI tests must use fixture mode. Run targeted Vitest projects with `pnpm exec vitest run --project unit <test-file> --no-file-parallelism`.

For a stuck scan, inspect the persisted scan state and relevant BullMQ phase job. Do not blindly retry a failed phase: a phase may already have performed billed provider work. Check cancellation, timeout, and refund paths before recovery.
