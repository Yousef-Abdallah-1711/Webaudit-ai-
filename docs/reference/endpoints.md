# API Endpoints

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

Every HTTP route the project exposes, with the auth it requires and the source that defines it.

| Method | Path | Auth | Middleware | Handler | Source |
| --- | --- | --- | --- | --- | --- |
| GET | `/` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/targets.routes.ts:86` |
| POST | `/` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:160` |
| GET | `/:id` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:277` |
| POST | `/:id/attest` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/targets.routes.ts:177` |
| POST | `/:id/cancel` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:301` |
| GET | `/:id/questionnaire` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:398` |
| POST | `/:id/questionnaire` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:423` |
| POST | `/:id/questionnaire/skip` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/scans.routes.ts:459` |
| POST | `/:id/verify/check` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/targets.routes.ts:221` |
| POST | `/:id/verify/start` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/targets.routes.ts:191` |
| GET | `/audit-log` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/audit-log.routes.ts:33` |
| POST | `/billing/cancel` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/billing.routes.ts:292` |
| POST | `/billing/change-plan` | protected | requireAuth, AuthedRequest | return | `apps/api/src/routes/billing.routes.ts:269` |
| GET | `/billing/credits` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/billing.routes.ts:129` |
| POST | `/billing/credits/purchase` | protected | requireAuth, AuthedRequest | return | `apps/api/src/routes/billing.routes.ts:314` |
| GET | `/billing/plans` | protected | requireAuth, AuthedRequest | monthlyCredits | `apps/api/src/routes/billing.routes.ts:121` |
| GET | `/billing/receipts` | protected | requireAuth, AuthedRequest | ReceiptListRow | `apps/api/src/routes/receipts.routes.ts:22` |
| GET | `/billing/receipts/:id` | protected | requireAuth, AuthedRequest | ReceiptHtmlRow | `apps/api/src/routes/receipts.routes.ts:39` |
| POST | `/billing/subscribe` | protected | requireAuth, AuthedRequest | return | `apps/api/src/routes/billing.routes.ts:229` |
| GET | `/billing/usage` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/billing.routes.ts:180` |
| GET | `/capabilities` | protected | requireAuth, AuthedRequest | db | `apps/api/src/routes/admin/capabilities.routes.ts:110` |
| DELETE | `/capabilities/:id` | protected | requireAuth, AuthedRequest, auth | req | `apps/api/src/routes/admin/capabilities.routes.ts:164` |
| PATCH | `/capabilities/:id` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/capabilities.routes.ts:115` |
| POST | `/capabilities/upload` | protected | requireAuth, AuthedRequest | tex | `apps/api/src/routes/admin/capabilities.routes.ts:206` |
| POST | `/change-password` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/auth.routes.ts:200` |
| POST | `/forgot-password` | public | — | unknown | `apps/api/src/routes/auth.routes.ts:169` |
| DELETE | `/github/connect` | protected | requireAuth | disconnect | `apps/api/src/routes/oauth.routes.ts:360` |
| POST | `/github/connect` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/oauth.routes.ts:292` |
| DELETE | `/github/disconnect` | protected | requireAuth | disconnect | `apps/api/src/routes/oauth.routes.ts:361` |
| GET | `/health` | protected | oauthRoutes, authRoutes | true | `apps/api/src/app.ts:347` |
| GET | `/issues/:id` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/reports.routes.ts:192` |
| POST | `/issues/:id/assert-fixed` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/issues.routes.ts:60` |
| GET | `/issues/:id/attempts` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/issues.routes.ts:144` |
| GET | `/issues/count` | protected | requireAuth, AuthedRequest, auth | not | `apps/api/src/routes/issues.routes.ts:53` |
| POST | `/login` | public | — | body | `apps/api/src/routes/auth.routes.ts:123` |
| POST | `/logout` | protected | AuthedRequest | req | `apps/api/src/routes/auth.routes.ts:163` |
| GET | `/margin` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/margin.routes.ts:46` |
| GET | `/margin/export` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/margin.routes.ts:59` |
| DELETE | `/me` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/auth.routes.ts:290` |
| GET | `/me` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/auth.routes.ts:228` |
| PATCH | `/me` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/auth.routes.ts:280` |
| GET | `/oauth/:provider/callback` | protected | AuthedRequest | req | `apps/api/src/routes/oauth.routes.ts:207` |
| GET | `/oauth/:provider/start` | protected | AuthedRequest | req | `apps/api/src/routes/oauth.routes.ts:184` |
| GET | `/plans` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/plans.routes.ts:94` |
| POST | `/plans` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/plans.routes.ts:104` |
| GET | `/plans/:id` | protected | requireAuth, AuthedRequest | req | `apps/api/src/routes/admin/plans.routes.ts:122` |
| PATCH | `/plans/:id` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/plans.routes.ts:135` |
| GET | `/providers` | protected | requireAuth, AuthedRequest | db | `apps/api/src/routes/admin/providers.routes.ts:50` |
| PATCH | `/providers` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/providers.routes.ts:55` |
| GET | `/queue` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/queue.routes.ts:66` |
| POST | `/queue/:jobId/cancel` | protected | requireAuth, AuthedRequest, auth | req | `apps/api/src/routes/admin/queue.routes.ts:99` |
| POST | `/queue/:jobId/retry` | protected | requireAuth, AuthedRequest, auth | req | `apps/api/src/routes/admin/queue.routes.ts:79` |
| POST | `/quote` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/scans.routes.ts:151` |
| POST | `/refresh` | protected | AuthedRequest | req | `apps/api/src/routes/auth.routes.ts:148` |
| POST | `/register` | public | — | body | `apps/api/src/routes/auth.routes.ts:75` |
| GET | `/repos` | protected | requireAuth, AuthedRequest, auth | githubFetch | `apps/api/src/routes/intake.routes.ts:120` |
| POST | `/reset-password` | public | — | body | `apps/api/src/routes/auth.routes.ts:178` |
| GET | `/scans` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/scans.routes.ts:27` |
| GET | `/scans/:id/export` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/reports.routes.ts:163` |
| GET | `/scans/:id/issues` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/reports.routes.ts:118` |
| GET | `/scans/:id/issues/failing-evidence` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/reports.routes.ts:149` |
| GET | `/scans/:id/readiness` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/readiness.routes.ts:193` |
| POST | `/scans/:id/readiness` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/readiness.routes.ts:98` |
| GET | `/scans/:id/readiness/certificate` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/readiness.routes.ts:349` |
| GET | `/scans/:id/report` | protected | requireAuth, AuthedRequest, auth | userId | `apps/api/src/routes/reports.routes.ts:58` |
| POST | `/scans/upload` | protected | requireAuth, AuthedRequest | headers | `apps/api/src/routes/intake.routes.ts:143` |
| GET | `/users` | protected | requireAuth, AuthedRequest | query | `apps/api/src/routes/admin/users.routes.ts:92` |
| GET | `/users/:id` | protected | requireAuth, AuthedRequest | req | `apps/api/src/routes/admin/users.routes.ts:102` |
| PATCH | `/users/:id` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/users.routes.ts:115` |
| POST | `/users/:id/credits` | protected | requireAuth, AuthedRequest | body | `apps/api/src/routes/admin/users.routes.ts:137` |
| GET | `/verify/:token` | public | — | token | `apps/api/src/routes/auth.routes.ts:108` |
| POST | `/verify/resend` | public | — | unknown | `apps/api/src/routes/auth.routes.ts:98` |
| POST | `/webhooks/billing` | protected | requireAuth | body | `apps/api/src/routes/webhooks.routes.ts:197` |
