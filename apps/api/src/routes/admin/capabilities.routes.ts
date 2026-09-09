/**
 * T207 — operator capability administration, from contracts/http-api.md's
 * Administration section:
 *
 *   GET    /admin/capabilities        list (FR-086)
 *   PATCH  /admin/capabilities/:id    enable, disable, restrict to tiers
 *   DELETE /admin/capabilities/:id    remove — see capabilities.service.ts's
 *                                     module note for the resolved conflict
 *                                     between this contract line and
 *                                     reconcile.ts's "never deleted"
 *
 * `POST /admin/capabilities/upload` (T216 built the always-503 placeholder;
 * T226, Session 8, replaces it with real dispatch):
 *
 * The bundle is read as a raw body (`express.raw`, scoped to this one route
 * — see below for why that's safe regardless of global middleware order),
 * handed to `services/admin/capability-upload.service.ts`'s
 * `uploadCapability`, which forwards it to the real `apps/sandbox-runner`
 * deployment and runs the real conformance suite inside the real sandbox
 * (FR-029, "under the same restriction"). **There is still no unsandboxed
 * fallback, ever** — R1's non-negotiable ("If the sandbox is unavailable,
 * the upload path returns 503 — it never falls back to unsandboxed
 * execution") is unconditional, not merely true today: a missing or
 * unreachable sandbox (unset `SANDBOX_RUNNER_URL`, or a real network
 * failure reaching a configured one) still always answers 503
 * `SANDBOX_UNAVAILABLE`, same as T216's placeholder did — that response
 * code is preserved for wire compatibility even though what can now produce
 * it has grown from "always" to "only when the sandbox genuinely can't be
 * reached."
 *
 * **This route stops at a conformance verdict — it is not capability
 * installation.** A `200` here (whether `passed: true` or `passed: false`)
 * means the sandbox produced a real answer, not that anything is now
 * running against real scans. See `capability-upload.service.ts`'s own
 * module note for the full reasoning; a future reader of this file must not
 * assume more happened than a conformance check.
 *
 * Same not-yet-mounted, not-yet-`requireOperator` setup as every other file
 * in this directory — T211 mounts everything under `/admin` behind the
 * operator gate. `requireAuth` is here for the same reason it is in every
 * other router: a mutation needs `req.auth.userId` for the audit log's
 * `actorId`.
 *
 * One combined PATCH body, not two routes: FR-086 states "enable, disable,
 * restrict... capabilities" as one sentence, an operator plausibly wants to
 * do both in one action (e.g. "turn this on, but only for pro and up"), and
 * both mutations already write to the same subject via the same audit-log
 * pattern as `plans.routes.ts`. `isEnabled` and `planIds` are independently
 * optional; at least one must be given.
 */

import express, { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import { SandboxRunnerNotConfiguredError } from '../../config/sandbox.js';
import {
  CapabilityHasHistoryError,
  CapabilityNotFoundError,
  PlanNotFoundError,
  listCapabilities,
  removeCapability,
  setCapabilityEnabled,
  setCapabilityPlanRestrictions,
  validatePlanIdsExist,
} from '../../services/admin/capabilities.service.js';
import { SandboxUnavailableError, uploadCapability } from '../../services/admin/capability-upload.service.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such capability.' } };

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

/**
 * T251 — the manifest fields the upload body (a raw bundle, not JSON) has no
 * room for. Mirrors `@webaudit/capability-sdk`'s `manifestSchema` `name`/
 * `version` constraints so a malformed value is refused here with a clear
 * 400 rather than surfacing later as an opaque `manifest-valid: false`.
 */
const uploadCapabilityQuery = z.object({
  name: z.string().trim().min(1).max(200),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'must be a three-part version'),
});

const patchCapabilityBody = z
  .object({
    isEnabled: z.boolean(),
    planIds: z.array(z.string().trim().min(1)),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one of isEnabled or planIds must be given.',
  });

export function adminCapabilitiesRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/capabilities', async (_req: AuthedRequest, res: Response) => {
    const capabilities = await listCapabilities(db);
    res.status(200).json({ capabilities });
  });

  router.patch('/capabilities/:id', async (req: AuthedRequest, res: Response) => {
    const parsed = patchCapabilityBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid capability update.', parsed.error.flatten());
      return;
    }

    const capabilityId = pathId(req);
    const operatorId = req.auth!.userId;

    try {
      // Validate everything about the combined request BEFORE committing any
      // part of it — a review of this task found that validating planIds
      // only inside setCapabilityPlanRestrictions meant an isEnabled change
      // given in the same body could already be committed (and audited) by
      // the time a bad planId surfaced a 400, leaving the response's "this
      // request failed" at odds with a mutation that actually landed.
      if (parsed.data.planIds !== undefined) {
        await validatePlanIdsExist(db, parsed.data.planIds);
      }
      if (parsed.data.isEnabled !== undefined) {
        await setCapabilityEnabled(db, { operatorId, capabilityId, isEnabled: parsed.data.isEnabled });
      }
      if (parsed.data.planIds !== undefined) {
        await setCapabilityPlanRestrictions(db, {
          operatorId,
          capabilityId,
          planIds: parsed.data.planIds,
        });
      }
      const [capability] = (await listCapabilities(db)).filter((c) => c.id === capabilityId);
      res.status(200).json({ capability });
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof PlanNotFoundError) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_PLAN_ID', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.delete('/capabilities/:id', async (req: AuthedRequest, res: Response) => {
    try {
      const result = await removeCapability(db, {
        operatorId: req.auth!.userId,
        capabilityId: pathId(req),
      });
      res.status(200).json({ removed: result.capabilityId });
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof CapabilityHasHistoryError) {
        res.status(409).json({
          error: {
            code: 'CAPABILITY_HAS_HISTORY',
            message: error.message,
            executionCount: error.executionCount,
          },
        });
        return;
      }
      throw error;
    }
  });

  // T226 — see the module note above. Not `router.use`'d before the routes
  // above: a POST to `/capabilities/upload` must not shadow a real request
  // to any of them, and Express matches declaration order for the same
  // method/path shape regardless, so declaring it last costs nothing and
  // stays explicit.
  //
  // `express.raw` is scoped to this one route rather than moved ahead of
  // `app.use(express.json({ limit: '1mb' }))` (mounted well before `/admin`
  // in `app.ts`). That's safe regardless of mount order: `express.json()`
  // only ever consumes a body whose `Content-Type` matches its own default
  // (`application/json`) — for anything else, including the content types
  // this route accepts, it is a no-op passthrough. So this route's own
  // `express.raw` still sees and parses the untouched body when the
  // content-type is one of the three below, and `req.body` is left as
  // whatever `express.json()` produced (typically `{}`) whenever it isn't —
  // which is exactly how the 415 branch below tells the two cases apart.
  router.post(
    '/capabilities/upload',
    express.raw({ type: ['application/javascript', 'text/javascript', 'text/plain'], limit: '16mb' }),
    async (req: AuthedRequest, res: Response) => {
      if (!Buffer.isBuffer(req.body)) {
        res.status(415).json({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Upload a capability bundle as application/javascript, text/javascript, or text/plain.',
          },
        });
        return;
      }

      if (req.body.length === 0) {
        badRequest(res, 'Empty capability bundle.');
        return;
      }

      const parsedQuery = uploadCapabilityQuery.safeParse(req.query);
      if (!parsedQuery.success) {
        badRequest(
          res,
          'Upload requires ?name=&version= query parameters (the bundle itself carries no manifest file).',
          parsedQuery.error.flatten(),
        );
        return;
      }

      try {
        const result = await uploadCapability(db, {
          operatorId: req.auth!.userId,
          bundle: req.body,
          manifest: { name: parsedQuery.data.name, version: parsedQuery.data.version },
        });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof SandboxRunnerNotConfiguredError) {
          res.status(503).json({
            error: {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Capability upload is not available — the sandbox runner is not configured ' +
                '(SANDBOX_RUNNER_URL is unset). There is no unsandboxed fallback (Constitution Principle V).',
            },
          });
          return;
        }
        if (error instanceof SandboxUnavailableError) {
          res.status(503).json({
            error: {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Capability upload is not available — the sandbox runner could not produce a ' +
                'conformance verdict. There is no unsandboxed fallback (Constitution Principle V).',
              reason: error.reason,
              ...(error.detail === undefined ? {} : { detail: error.detail }),
            },
          });
          return;
        }
        throw error;
      }
    },
  );

  return router;
}
