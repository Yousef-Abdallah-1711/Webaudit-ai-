# Lifecycle Cleanup, Browser, and Network Security

## Overview

The platform confines external access, safely handles archives, and removes temporary workspaces/artifacts on every terminal lifecycle path. These are shared controls used by intake and audit execution.

## Source and flow

SSRF-safe fetch/DNS/socket/browser-proxy logic is in `packages/safe-net/src/`; Chromium pool code is `apps/probe-pool/src/browser/pool.ts`; archive guards are `packages/safe-archive/`. Lifecycle cleanup spans `apps/api/src/services/email/`, `services/auth/cleanup.service.ts`, `services/storage/`, and `apps/worker/src/workspace/`.

## Constraints and verification

Every hop preserves SSRF controls; archives enforce path, compression-ratio, and size bounds. Workspace destruction is required after completion, failure, timeout, and cancellation. Run safe-net/archive adverse tests and worker workspace/retention/email tests.
