/**
 * T211 — mounts every admin route behind `requireOperator` (FR-008).
 *
 * Each sub-router (`adminUsersRoutes`, etc.) already declares its own
 * `router.use(requireAuth)` — see their own module notes — so this router
 * would work if `requireOperator` were skipped, in the sense that nothing
 * would throw. That is exactly the gap T202's adversarial test exists to
 * close: `requireAuth` only proves who the caller is, not that they may act
 * here. `requireOperator` is mounted first, at this single aggregation
 * point, so no admin route can be reached by a non-operator "however
 * constructed" (T202's own wording) — a new admin route added under this
 * directory in the future inherits the gate for free rather than needing to
 * remember it.
 *
 * `requireAuth` is mounted here too, ahead of `requireOperator`, which reads
 * `req.auth` and 401s if it is unset (`auth.middleware.ts`'s own comment:
 * "Mount after requireAuth"). Each sub-router's own `requireAuth` then runs
 * again — redundant but harmless (idempotent: it just re-verifies the same
 * bearer token and re-sets the same `req.auth`) — deliberately left in place
 * in every sub-router rather than removed, since each of those files' own
 * contract tests construct a standalone `express()` app from it directly
 * (see `admin.capabilities.test.ts`'s own header) and must keep working
 * unmounted, exactly as documented in every one of their module notes.
 */

import { Router } from 'express';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, requireOperator } from '../../middleware/auth.middleware.js';
import { adminAuditLogRoutes } from './audit-log.routes.js';
import { adminCapabilitiesRoutes } from './capabilities.routes.js';
import { adminCostAlertsRoutes } from './cost-alerts.routes.js';
import { adminMarginRoutes } from './margin.routes.js';
import { adminPlansRoutes } from './plans.routes.js';
import { adminProvidersRoutes } from './providers.routes.js';
import { adminQueueRoutes, type AdminQueueRoutesDeps } from './queue.routes.js';
import { adminScansRoutes } from './scans.routes.js';
import { adminUsersRoutes } from './users.routes.js';

export interface AdminRoutesDeps {
  readonly queue?: AdminQueueRoutesDeps;
}

export function adminRoutes(db: PrismaClient, deps: AdminRoutesDeps = {}): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireOperator(db));

  router.use(adminUsersRoutes(db));
  router.use(adminPlansRoutes(db));
  router.use(adminMarginRoutes(db));
  router.use(adminCapabilitiesRoutes(db));
  router.use(adminCostAlertsRoutes(db));
  router.use(adminProvidersRoutes(db));
  router.use(adminQueueRoutes(db, deps.queue ?? {}));
  router.use(adminScansRoutes(db));
  router.use(adminAuditLogRoutes(db));

  return router;
}
