# Middleware Stack

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

The request chain in the order it runs. Anything that wraps a request appears here.

| Order | Name | Applies to | Notes | Source |
| --- | --- | --- | --- | --- |
| 1 | securityHeaders | * | — | `apps/api/src/app.ts:320` |
| 2 | cors | * | — | `apps/api/src/app.ts:321` |
| 3 | webhooksRoutes | * | — | `apps/api/src/app.ts:327` |
| 4 | express.json | * | — | `apps/api/src/app.ts:329` |
| 5 | bodyParserErrorHandler | * | — | `apps/api/src/app.ts:342` |
| 6 | cookieParser | * | — | `apps/api/src/app.ts:343` |
| 7 | limiters.general | * | — | `apps/api/src/app.ts:352` |
| 8 | limiters.strict | /auth${path} | — | `apps/api/src/app.ts:354` |
| 9 | authRoutes | /auth | — | `apps/api/src/app.ts:361` |
| 10 | oauthRoutes | /auth | — | `apps/api/src/app.ts:367` |
| 11 | targetsRoutes | /targets | — | `apps/api/src/app.ts:371` |
| 12 | intakeRoutes | * | — | `apps/api/src/app.ts:379` |
| 13 | scansRoutes | /scans | — | `apps/api/src/app.ts:382` |
| 14 | issuesRoutes | * | — | `apps/api/src/app.ts:389` |
| 15 | reportsRoutes | * | — | `apps/api/src/app.ts:394` |
| 16 | readinessRoutes | * | — | `apps/api/src/app.ts:398` |
| 17 | billingRoutes | * | — | `apps/api/src/app.ts:402` |
| 18 | receiptsRoutes | * | — | `apps/api/src/app.ts:403` |
| 19 | adminRoutes | /admin | — | `apps/api/src/app.ts:409` |
| 20 | express.json | * | — | `apps/api/src/routes/admin/capabilities.routes.ts:197` |
| 21 | adminUsersRoutes | * | — | `apps/api/src/routes/admin/users.routes.ts:14` |
| 22 | express.json | * | — | `apps/api/src/routes/intake.routes.ts:9` |
