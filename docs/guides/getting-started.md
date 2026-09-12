# Getting Started

WebAudit AI requires Node.js 22+, pnpm 9+, PostgreSQL, and Redis. From the repository root, install dependencies with `pnpm install`, copy `.env.example` to a local environment file without committing credentials, then start local services with `pnpm services:up`.

Run `pnpm db:migrate` and `pnpm db:seed` when local database data is needed. Start development processes with `pnpm dev`; this delegates to Turbo. See [local development](local-development.md) for separate service commands.
