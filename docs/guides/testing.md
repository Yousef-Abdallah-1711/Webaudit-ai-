# Testing

Use a separate `TEST_DATABASE_URL` for database-backed tests and serialize suites that share the database, Redis, or queues. Do not use live AI providers: automated tests use `AI_MODE=fixtures`.

- `pnpm test` runs unit, contract, and integration projects.
- `pnpm test:adverse` runs hostile/failure guarantees.
- `pnpm test:visual` runs visual/CSS checks.
- `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` are workspace gates.
- `pnpm --filter @webaudit/web test:e2e` runs browser E2E; read `apps/web/tests/README.md` first.
