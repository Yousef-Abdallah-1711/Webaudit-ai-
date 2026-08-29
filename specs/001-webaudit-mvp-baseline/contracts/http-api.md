# Contract: HTTP API

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

Conventions: JSON bodies. Access token in `Authorization: Bearer`. Refresh token in an httpOnly
cookie. All money-adjacent and state-changing routes are idempotent on an `Idempotency-Key` header.
Error shape is uniform: `{ error: { code, message, details? } }`.

Status codes that carry meaning in this API: `402` insufficient credits (FR-074), `403` plan or
control-level refusal (FR-016, FR-017), `409` duplicate concurrent scan (FR-018), `422` validation
including SSRF and archive refusal (FR-014, FR-015).

---

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | FR-001. `409` if email exists. Never reveals whether an address exists on other routes. |
| POST | `/auth/verify/resend` | FR-002 |
| GET | `/auth/verify/:token` | FR-002. Single-use, time-limited. |
| POST | `/auth/login` | Returns access token; sets refresh cookie. `403` if unverified. |
| POST | `/auth/refresh` | FR-006. Rotates the refresh token. |
| POST | `/auth/logout` | FR-006. Revokes the presented refresh token. |
| POST | `/auth/forgot-password` | FR-005. Always `202`, regardless of existence. |
| POST | `/auth/reset-password` | FR-005 |
| GET | `/auth/me` | Returns user, plan, both credit balances (FR-078). |
| DELETE | `/auth/me` | FR-009. Destroys audits, reports, retained source, stored tokens. |
| GET | `/auth/oauth/:provider/start` | FR-003 |
| GET | `/auth/oauth/:provider/callback` | FR-004. Joins on verified email match. |
| POST | `/auth/github/connect` | FR-007. Stores encrypted (FR-091). |
| DELETE | `/auth/github/connect` | FR-007 |

`GET /auth/me` returns balances as two figures, never one:

```jsonc
{ "credits": { "plan": 240, "purchased": 500, "planExpiresAt": "2026-09-01T00:00:00Z" } }
```

## Targets and control

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/targets` | |
| POST | `/targets` | Validates and canonicalises. `422` on SSRF refusal (FR-014). |
| POST | `/targets/:id/attest` | FR-017 Level 1. Records who and when. |
| POST | `/targets/:id/verify/start` | Issues a token; returns file path or DNS record to publish. |
| POST | `/targets/:id/verify/check` | Confirms. Re-checked again at execution time (R11). |
| GET | `/repos` | FR-007. Requires a connected account. |

## Scans

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/scans/quote` | FR-011. Cost for a module selection. Charges nothing. |
| POST | `/scans` | FR-012. Explicit `acceptedQuote`. `402`/`403`/`409` as above. |
| POST | `/scans/upload` | FR-015. Multipart. Streaming guard; refuses before extraction. |
| GET | `/scans/:id` | FR-047. Authoritative current state. |
| POST | `/scans/:id/cancel` | FR-037. Stops work, destroys workspace, refunds undelivered. |
| GET | `/scans/:id/questionnaire` | FR-040 |
| POST | `/scans/:id/questionnaire` | FR-040. Resumes the scan (R4). |
| POST | `/scans/:id/questionnaire/skip` | FR-042 |

`POST /scans` refuses rather than starts when it cannot deliver:

```jsonc
// 403 — control level insufficient for a requested check
{ "error": { "code": "CONTROL_LEVEL_REQUIRED",
             "message": "Load generation requires verified control of this target.",
             "details": { "required": "VERIFIED", "current": "ATTESTED",
                          "methods": ["FILE", "DNS"] } } }
```

A scan whose selection *includes* a gated check still starts; the gated check alone is reported
unavailable and is not charged (US1 scenario 8). The `403` above applies only when every requested
check is gated out.

## Reports and issues

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/scans/:id/report` | FR-048. Score, summary, per-area results. |
| GET | `/scans/:id/issues` | FR-057. Filter by severity and state. |
| GET | `/issues/:id` | FR-050, FR-051 |
| POST | `/issues/:id/assert-fixed` | FR-058. Charges 3 credits; queues re-verification. |
| GET | `/issues/:id/attempts` | FR-061, FR-065 |
| GET | `/scans/:id/export` | FR-093. Self-contained artifact. |
| POST | `/scans/:id/readiness` | FR-066, FR-067. `403` while critical/high remain. |
| GET | `/scans/:id/readiness` | FR-068 through FR-072 |

`POST /issues/:id/assert-fixed` returns the attempt, not a success:

```jsonc
{ "issue": { "id": "…", "state": "OPEN" },
  "attempt": { "outcome": "FAILED",
               "evidence": { "observed": { "content-security-policy": null } } } }
```

The response never asserts resolution on the user's word. `state` transitions only on
`outcome: PASSED` (FR-060, SC-007).

## Billing

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/billing/plans` | |
| GET | `/billing/credits` | FR-076. Full movement history, both kinds. |
| POST | `/billing/subscribe` | FR-078 |
| POST | `/billing/change-plan` | FR-080 |
| POST | `/billing/cancel` | FR-080. Reports retention consequence. |
| POST | `/billing/credits/purchase` | FR-078. `403` on free tier. |
| POST | `/webhooks/billing` | Signature-verified. Idempotent on event id. |

## Administration

All under `/admin`, all requiring `isOperator` server-side (FR-008), all writing `AuditLogEntry`
(FR-089).

| Method | Path | Notes |
| --- | --- | --- |
| GET/PATCH | `/admin/users`, `/admin/users/:id` | FR-083 |
| GET/POST/PATCH | `/admin/plans` | FR-084 |
| GET | `/admin/margin` | FR-085. Per scan, area, capability. |
| GET | `/admin/capabilities` | FR-086 |
| PATCH | `/admin/capabilities/:id` | Enable, disable, restrict to tiers. |
| POST | `/admin/capabilities/upload` | FR-027. Sandbox conformance before registration. |
| DELETE | `/admin/capabilities/:id` | |
| GET/PATCH | `/admin/providers` | FR-087. Chain order; ≥2 vendors enforced. |
| GET | `/admin/queue` | FR-088 |
| POST | `/admin/queue/:jobId/retry` \| `/cancel` | FR-088 |

`POST /admin/capabilities/upload` returns `503 SANDBOX_UNAVAILABLE` while the sandbox service is
not deployed. It never falls back to unsandboxed execution — R1's non-negotiable.
