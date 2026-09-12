# Deployment

Deploy the web app, API, worker, and sandbox-runner as separate runtime boundaries. Browser provisioning remains a library in this checkout, not an independently runnable probe-pool service. Production guidance is in `infrastructure/deploy.md`; installed-capability isolation is in `infrastructure/sandbox-runner.md`.

Run `pnpm db:deploy` for production migrations. The API exposes `/health`; never treat older runbook wording as evidence that sandbox dispatch is unused.
