# Production Readiness Phases 1–4 Full Test-Coverage Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-browser coverage and evidence for the completed Phase 1–4 production-readiness work, while recording any untestable or genuinely defective behavior honestly.

**Architecture:** Reuse the existing `startStack`, `registerAndVerify`, `loginViaUi`, and fixture-site helpers. Extend existing E2E specs where a flow already exists; create focused specs for payment, settings, report actions, admin mutations, and usage. Run shared database suites serially, then perform manual live-stack browser checks with console/network capture.

**Tech Stack:** Playwright, Next.js, Express, Prisma/Postgres, Redis, Vitest, fixture AI mode.

**Spec:** `docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md`, Groups A–F in the pasted user request.

## Global Constraints

- Preserve unrelated working-tree changes; never use broad staging, reset, stash, or checkout commands.
- Use `AI_MODE=fixtures` for automated tests and `TEST_DATABASE_URL` for database-backed suites.
- Serialize shared Postgres/Redis test runs with `--no-file-parallelism`.
- Do not claim manual MCP coverage unless MCP actually connected; use headed Playwright as the explicit fallback.
- Any production defect requires a failing regression test before the fix.

---

### Task 1: Baseline and existing-coverage inventory

**Files:**
- Read: `docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md`
- Read: `apps/web/tests/e2e/support/stack.ts`, `apps/web/tests/e2e/support/auth.ts`
- Test: relevant existing E2E and Vitest suites

- [ ] Record the exact DONE/open status for T256–T291 and map existing specs to Groups A–F.
- [ ] Confirm Docker Postgres/Redis health and identify whether another session is using the shared test resources.
- [ ] Run a focused baseline of the existing E2E specs that already cover report, billing, admin, usage, and auth flows.

### Task 2: Group B payment and receipt E2E

**Files:**
- Create or modify: `apps/web/tests/e2e/dashboard/payment-and-receipts.spec.ts`
- Read: `apps/api/tests/integration/checkout-flow.test.ts` and billing UI/API routes

- [ ] Write a real-browser test for checkout initiation, stub webhook confirmation, updated balance/subscription, receipt display/download, and cross-user receipt ownership refusal.
- [ ] Run the new spec against the real stack and fix only defects proven by a failing test.

### Task 3: Group C report actions and real sidebar data

**Files:**
- Modify: `apps/web/tests/e2e/onboarding/first-audit.spec.ts` or create `apps/web/tests/e2e/dashboard/report-actions.spec.ts`
- Modify: `apps/web/tests/e2e/dashboard/fixes-board.spec.ts` if needed

- [ ] Test a completed report's real download and clipboard contents.
- [ ] Independently query the API for outstanding issues and assert the sidebar badge matches.
- [ ] Run the focused specs and record download/clipboard evidence.

### Task 4: Group D settings and account lifecycle E2E

**Files:**
- Create: `apps/web/tests/e2e/dashboard/settings-account.spec.ts`
- Read: settings UI, auth/session routes, and Prisma user/session models

- [ ] Test profile persistence, successful and refused password changes, login with the new password, account deletion, and post-deletion login refusal.
- [ ] If a requested behavior is not implemented or depends on an unavailable email provider, capture the exact limitation rather than weakening the assertion.

### Task 5: Group E admin real wiring E2E

**Files:**
- Modify: `apps/web/tests/e2e/admin/providers.spec.ts`
- Modify: `apps/web/tests/e2e/admin/capabilities-and-plans.spec.ts`
- Modify: `apps/web/tests/e2e/admin/users.spec.ts`
- Modify: `apps/web/tests/e2e/admin/queue-and-log.spec.ts`
- Create focused admin specs only where existing files cannot express the flow

- [ ] Test provider reorder persistence, capability upload verdict, credit grant/user detail, tier restriction enforcement, plan creation/editing, margin CSV, audit-log filtering, and public signup/dead-link navigation.
- [ ] Keep backend-only enforcement assertions in API/worker tests when a UI cannot prove the boundary.

### Task 6: Group F usage and scan-backed export E2E

**Files:**
- Modify: `apps/web/tests/e2e/dashboard/usage-and-billing.spec.ts` or create `apps/web/tests/e2e/dashboard/usage-real-data.spec.ts`

- [ ] Run a real fixture scan, assert usage values derive from that scan rather than placeholder data, and verify CSV export matches the displayed data.

### Task 7: Group A integration/adverse verification and realtime browser check

**Files:**
- No production changes unless a defect is found
- Read/run: affected worker/API adverse suites and live progress page

- [ ] Run the relevant serialized adverse/integration suites for T256–T261.
- [ ] Verify a normal live-progress WebSocket connection in a real browser and inspect console/network output.

### Task 8: Manual live-stack browser pass and evidence report

**Files:**
- Create only if needed: a session-local evidence note; otherwise report in final response

- [ ] Start the documented API, worker, web, and sandbox services as required.
- [ ] Attempt Playwright MCP twice if available; otherwise run the documented headed-browser fallback.
- [ ] Exercise every applicable Group A–F flow, inspect console and network requests, and check for token/secret leakage.
- [ ] Run final verification commands and produce a task-by-task coverage matrix with explicit yes/no/blocked results.

