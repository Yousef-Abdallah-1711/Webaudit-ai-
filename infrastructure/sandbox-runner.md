# `apps/sandbox-runner` — deployment runbook

This is the first document in `infrastructure/` besides `docker-compose.yml` (which is dev-only
Postgres/Redis, not an application service) — there is no existing per-app deployment-doc convention
here to follow, so this reads like the module-header comments in `apps/sandbox-runner/src/` do:
dense, and every claim justified rather than asserted.

## Why a separate deployment, not a shared process

From `CLAUDE.md`:

> `sandbox-runner` and `probe-pool` are separate deployments because a security boundary is only
> real if it is a deployment. Do not collapse them.

And from `specs/001-webaudit-mvp-baseline/research.md`'s R1, restated in full because it is the
whole reason this file exists:

> **Three nested boundaries, not one.** Untrusted capabilities execute in a dedicated
> `sandbox-runner` service, which is the only component permitted to load unreviewed code:
>
> 1. **Service boundary** — `sandbox-runner` is deployed as its own service with **no network
>    egress and no database credentials**. It holds no secrets to steal and has nowhere to send
>    them. It receives work and returns results over a single inbound channel; it never dials out.
> 2. **Process boundary** — each execution is a fresh short-lived Node child process started with
>    the **Node permission model** (`--permission`, with no `--allow-fs-read`, no
>    `--allow-fs-write`, no `--allow-child-process`, no `--allow-worker`), an empty environment, an
>    empty working directory, and OS resource limits. Separate process means a separate heap
>    (Principle V's explicit requirement) and `SIGKILL` as an unconditional stop.
> 3. **Language boundary** — the capability is invoked through a thin harness that passes input as
>    structured data and returns findings as structured data. No module resolution is exposed to
>    the capability beyond an allowlisted shim.

This document is about boundary 1 only — boundaries 2 and 3 are `apps/sandbox-runner/src/
child-harness/*` and `apps/sandbox-runner/src/limits/*` (Session 7's isolation mechanism; not
touched here). A service boundary that is merely a `require()` away from the platform's real
credentials — same process, same container, same deploy — is not a boundary at all, regardless of
how careful the process/language layers underneath it are. It has to be its own deployment for the
"no database credentials" property to be a fact about the environment rather than a fact about
today's code.

## Exact environment variables this process reads

Two, and nothing else:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SANDBOX_RUNNER_PORT` (or `PORT` as a fallback) | The port `serve.ts` binds to. | `3003` |
| `SANDBOX_RUNNER_HOST` | The interface `serve.ts` binds to. | `127.0.0.1` |

**`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY` must
never be set on this deployment.** This is not a policy that has to be remembered — it is confirmed
by construction, in two independent ways:

1. `apps/sandbox-runner/package.json` has no dependency on `@prisma/client`, `ioredis`, or
   `bullmq` (or any other database/queue client) — there is nothing in this package that could read
   those variables even if they were set.
2. No source file under `apps/sandbox-runner/src/` contains the literal name `DATABASE_URL`,
   `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, or `ENCRYPTION_KEY` anywhere.

`apps/sandbox-runner/tests/adverse/deployment-isolation.test.ts` asserts both of these directly
against the real `package.json` and the real `src/` tree, every time the adverse suite runs — this
is what keeps the claim true over time rather than true only on the day this document was written.
A future change that adds a database client to this package, or that copy-pastes a config file
referencing one of these names "just in case," fails that suite before it fails anything in
production.

## Network policy

**Outbound: deny-all, zero exceptions.** The host process itself (`src/host/server.ts`, driven by
`src/serve.ts`) never makes an outbound network call of any kind — it only listens on one inbound
port and forks local child processes. Those children are what actually run an uploaded capability's
code, and they are given zero network permission by the `--permission` flag Session 7 already wires
up (`apps/sandbox-runner/src/host/server.ts`'s `executeOne`) — no `--allow-net` of any kind is ever
passed. A network policy at the machine/container level that also denies all outbound traffic from
this deployment is a second, independent enforcement of the same property boundary 2 already
enforces at the process level — belt and braces, not a substitute for it.

**Inbound: allow only from `apps/api`'s deployment**, on the configured port
(`SANDBOX_RUNNER_PORT`/`PORT`), restricted to:

- `POST /execute` — the one real work-dispatch route (`contracts/realtime-and-internal.md` §3).
- `GET /health` — for the load balancer's or orchestrator's own health checks. No auth, no body; a
  liveness probe must not depend on anything this process could ever be missing.

Nothing else should be able to reach this deployment's inbound port at all — not other services, not
the public internet, not even other internal deployments besides `apps/api`.

## Process requirements

- **Node ≥ 22.** The entire process-boundary mechanism (`--permission`) is a Node 22 feature; this
  is not a floor picked for convenience, it is the version the isolation guarantee depends on.
  `package.json`'s root `engines.node` already states `>=22` for the same reason.
- **Ability to fork local child processes** — ordinary OS process-spawning (`node:child_process`
  `fork`), unrelated to network egress. A sandboxed runtime, container policy, or seccomp profile
  that blocks `fork()`/`clone()` entirely would break this service; one that blocks outbound
  sockets is exactly what's wanted. Do not conflate the two capabilities when configuring a
  container's syscall or capability restrictions.

## Runbook

```sh
pnpm install --frozen-lockfile
pnpm --filter @webaudit/sandbox-runner start
```

Health check: `GET http://<host>:<port>/health` → `200 {"status":"ok"}`.

`pnpm --filter @webaudit/sandbox-runner start` runs `node --env-file-if-exists=../../.env --import
tsx src/serve.ts` (see that package's own `package.json`) — `--env-file-if-exists` is a no-op if no
`.env` is present, which is the expected shape of a real deployment: `SANDBOX_RUNNER_PORT` and
`SANDBOX_RUNNER_HOST` are supplied by the deployment platform's own environment configuration, not a
committed file.

## Known gaps — verify on first real deploy

Two findings are specific to the Windows machine Session 7's implementation was developed and
tested on, and are unverified against the real (expected Linux) deployment target:

**(a) `fork(bundlePath, [], { env: {} })` measurably still leaks roughly 11 real OS-required
environment variables on Windows, despite the empty `env` object passed to it.** This was observed
directly while building the process-boundary mechanism (`apps/sandbox-runner/src/host/server.ts`'s
`executeOne`) — `env: {}` is what the code passes, and what the API contract promises ("an empty
environment"), but the actual child process's environment was not empty in practice on Windows.
Confirm this does not reproduce on Linux — Windows requires several system variables
(`SystemRoot`, `PATH`'s equivalent for DLL loading, etc.) for a process to start at all in a way
POSIX does not universally share, so this may be a Windows-only artifact of `child_process.fork`'s
implementation. If it *does* reproduce on Linux, replace the empty-object approach with an explicit
env allowlist (start from nothing, add back only what's provably required to boot Node, and audit
that list) rather than continuing to rely on an empty object that isn't actually empty.

**(b) `--allow-fs-read`/`--allow-fs-write` glob matching produced a garbled resource path for
certain glob forms on Windows.** Worked around in `executeOne`'s `readAllowlist` construction with
narrow, explicit directory paths (`${dir}${path.sep}*`, built from real resolved paths) rather than
a broader glob pattern — the root cause in Node's permission-model glob matcher on Windows was not
investigated further, only worked around. What matters for this deployment is that **the
workaround, not the root cause, is what ships** — confirm on first real (Linux) deploy that the
narrow explicit-path form still correctly grants read access to exactly the harness bundle and the
two `node_modules` trees `executeOne` needs (see that function's own module comment for why those
three, specifically), and that removing the workaround in favour of the "more natural" glob form
that failed on Windows is not attempted without first confirming the original bug was Windows-
specific.
