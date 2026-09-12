# Local Development

`infrastructure/docker-compose.yml` supplies local PostgreSQL on host port 5442 and Redis on 6389. `pnpm services:up` starts them and `pnpm services:down` stops them. The web app uses port 3000, the API uses port 3001, and sandbox-runner uses port 3003; the worker has no public HTTP port.

Use `pnpm dev` for the workspace development command. The API entry point is `apps/api/src/index.ts`, the worker entry point is `apps/worker/src/index.ts`, and the web entry layout is `apps/web/app/layout.tsx`.
