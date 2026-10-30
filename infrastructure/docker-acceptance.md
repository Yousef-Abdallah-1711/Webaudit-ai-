# Docker acceptance stack — runbook

A disposable, isolated, production-shaped stack for verifying the real application through Docker. It is **not** a deployment:
production uses `docker-compose.production.yml`. The acceptance stack uses the same Dockerfiles and the same runtime
database identities, with throwaway infrastructure and its own Compose project (`fahes-accept`), volumes, networks and ports.
It never touches the shared development containers (`webaudit-postgres`, `webaudit-pgbouncer`, `webaudit-redis`).

## Prerequisites
- Docker Engine with Compose v2 (verified with the Docker Desktop shipped on the maintainer machine), about 10 GB free disk
  for images and build cache, and free host ports `4530` (API), `4531` (web), `9191` (MinIO S3).
  Override with `ACCEPT_API_PORT`, `ACCEPT_WEB_PORT`, `ACCEPT_MINIO_PORT`.
- PostgreSQL and Redis publish **no** host port; reach them with `docker compose exec`.

## Services
| Service | Role | Image |
|---|---|---|
| postgres, redis | isolated data stores (own volumes) | `postgres:16-alpine`, `redis:7-alpine` |
| migrate | `prisma migrate deploy` once (administrator login) | built from `apps/api/Dockerfile` |
| provision-runtime-roles | creates the API / worker / orchestrator logins and grants | `postgres:16-alpine` |
| api | HTTP + WebSocket API, connects as `webaudit_api_runtime` | built (`apps/api/Dockerfile`) |
| worker | the orchestrator process (phases, sweeps, plan-unit barrier, passive completion), connects as `webaudit_orchestrator_runtime` | built (`apps/worker/Dockerfile`) |
| fixture | loopback target served inside the worker's network namespace (`127.0.0.1:8080`) | `nginx:1.27-alpine` |
| web | Next.js frontend | built (`apps/web/Dockerfile`) |
| minio | S3 emulator, **emulator acceptance only (DEC-075), never R2** | `minio` pinned release |

Mail: the stack uses the console mailer (`EMAIL_TRANSPORT` unset outside production); verification links appear in `docker compose logs api`. The SMTP client requires implicit TLS by design and an SMTP sink such as Mailpit offers none, so the SMTP path is not exercised here.

Not included, by design: `apps/probe-pool` (a library), `apps/sandbox-runner` (admin custom capabilities, out of scope), any
SPEC 010-012 engine host (no production engine exists; the worker logs `no execution engines registered`), the TLS proxy.

## Build and start
```sh
sh infrastructure/acceptance-env.sh                 # random throwaway secrets -> .env.acceptance (git-ignored)
docker compose -f infrastructure/docker-compose.acceptance.yml --env-file .env.acceptance up -d --build
```
SPEC 009 plan path: add `SCAN_EXECUTION_PLANS=on` to `.env.acceptance` (it stays empty/off by default) and
`docker compose ... up -d api worker`. Never set it in a production env file without separate owner approval.

## Health
```sh
C="docker compose -f infrastructure/docker-compose.acceptance.yml --env-file .env.acceptance"
$C ps                                               # api and web must be (healthy); migrate and provision exit 0
curl -s http://127.0.0.1:4530/health                # {"ok":true}
curl -sI http://127.0.0.1:4531/ | head -1
$C exec redis redis-cli ping
$C exec postgres pg_isready -U webaudit
$C exec redis redis-cli keys 'worker:heartbeat:*'   # the worker heartbeat the worker healthcheck reads
```

## Logs
`$C logs -f api`, `web`, `worker` (orchestrator), `postgres`, `redis`, `minio`, `migrate`, `provision-runtime-roles`.

## Migrations
The stack applies every checked-in migration to its OWN fresh database via the `migrate` service (`prisma migrate deploy`),
then provisions the logins. `prisma db push` is never used. Upgrading a shared or production database is a separate,
owner-approved procedure (see the shared-database migration proposal in the SPEC 009 Docker report); this stack never
touches the shared development database.

## Restart one service
`$C restart api` (or `worker`, `web`). Restarting `worker` also restarts the `fixture` sidecar that shares its network namespace:
`$C up -d worker fixture`.

## Stop and reset
- Stop, keep data: `$C down`
- Disposable reset (deletes ONLY this project's volumes): `$C down -v`
Never run `docker system prune` or `down -v` against another project.

## Troubleshooting
- Port already in use: set the `ACCEPT_*_PORT` variables.
- `migrate` fails: `$C logs migrate`; the database is empty and disposable, so `down -v` and retry.
- API unhealthy: `$C logs api`; a missing secret aborts with a named variable.
- Permission-denied lines in api/worker logs: a runtime login lacks a grant; do not widen grants blindly, record the object and
  operation and review `provision-runtime-db-roles.sql`.
- Worker idle: confirm `$C exec redis redis-cli keys 'worker:heartbeat:*'` and that `SAFE_NET_ALLOW_TARGETS` matches the target origin.
- Scans of the fixture are refused by the SSRF guard: use `http://127.0.0.1:8080/` exactly (the allow-listed origin).
