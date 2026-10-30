-- SPEC 009 DEC-071 (owner Decision A): the orchestrator completes genuinely passive units, explicitly and auditably.
-- Forward-only and narrow. fahes_finalize_unit and the transition table are unchanged for every other path:
--   * a PLANNED -> COMPLETED edge for a non-TELEMETRY passive class is accepted by the guard trigger ONLY while the
--     transaction-local flag fahes.passive_completion is on, which only fahes_complete_passive_unit sets;
--   * runtime logins can never write a terminal status directly (the existing terminal-write guard), so the flag cannot
--     be used to forge a completion; only fahes_orchestrator may execute the new function.

GRANT SELECT ("scanId", "module", "state") ON "ModuleResult" TO fahes_owner;

CREATE OR REPLACE FUNCTION public.fahes_unit_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."scanPlanId" <> OLD."scanPlanId" OR NEW."userId" <> OLD."userId"
     OR NEW."targetId" <> OLD."targetId" OR NEW."executionUnitClass" <> OLD."executionUnitClass"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."configuration"::text <> OLD."configuration"::text
     OR NEW."requiresSafetyCheckpoint" <> OLD."requiresSafetyCheckpoint" THEN
    RAISE EXCEPTION 'execution_unit_immutable_column' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('SKIPPED','BLOCKED','REFUSED','COMPLETED','FAILED','CANCELLED','KILLED') THEN
    RAISE EXCEPTION 'execution_unit_terminal:%', OLD."status" USING ERRCODE = '23514';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'PLANNED'    AND NEW."status" IN ('ADMITTED','BLOCKED','REFUSED','COMPLETED'))
    OR (OLD."status" = 'ADMITTED'   AND NEW."status" IN ('DISPATCHED','REFUSED'))
    OR (OLD."status" = 'DISPATCHED' AND NEW."status" IN ('RUNNING','REFUSED'))
    OR (OLD."status" = 'RUNNING'    AND NEW."status" IN ('COMPLETED','FAILED','CANCELLED','KILLED'))) THEN
    RAISE EXCEPTION 'execution_unit_invalid_transition:%->%', OLD."status", NEW."status" USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'PLANNED' AND NEW."status" = 'COMPLETED' AND OLD."executionUnitClass" <> 'TELEMETRY'
     AND NOT (OLD."executionUnitClass" IN ('PASSIVE_HTTP','SOURCE_STATIC')
              AND coalesce(current_setting('fahes.passive_completion', true), '') = 'on') THEN
    RAISE EXCEPTION 'execution_unit_invalid_transition:PLANNED->COMPLETED' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" IN ('SKIPPED','BLOCKED','REFUSED','COMPLETED','FAILED','CANCELLED','KILLED') AND NEW."status" <> OLD."status"
     AND NOT (SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = current_user)
     AND (pg_has_role(current_user, 'fahes_exec_host', 'MEMBER') OR pg_has_role(current_user, 'fahes_worker_exec', 'MEMBER')
       OR pg_has_role(current_user, 'fahes_api', 'MEMBER') OR pg_has_role(current_user, 'fahes_operator', 'MEMBER')
       OR pg_has_role(current_user, 'fahes_orchestrator', 'MEMBER')) THEN
    RAISE EXCEPTION 'execution_unit_terminal_write_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.fahes_unit_guard() OWNER TO fahes_owner;

-- Completes one PLANNED passive unit of a running INITIAL plan once its prerequisites hold: every dependency COMPLETED,
-- the domain module result of the unit COMPLETE or DEGRADED, the scan not terminal and before its database-clock deadline.
-- A module that ended FAILED or NOT_APPLICABLE refuses the unit instead (a PLANNED unit cannot be FAILED); the reason is
-- recorded in terminalReason. Idempotent: a terminal unit replays its status.
CREATE FUNCTION public.fahes_complete_passive_unit(p_unit_id text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '5s' AS $$
DECLARE
  u "ExecutionUnit"%ROWTYPE; pl "ScanPlan"%ROWTYPE; sc record; v_module text; v_state text; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO u FROM "ExecutionUnit" WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'passive_unit_not_found' USING ERRCODE = 'P0002'; END IF;
  IF u."idempotencyKey" <> p_idempotency_key THEN RAISE EXCEPTION 'passive_stale_idempotency_key' USING ERRCODE = '23514'; END IF;
  IF u."status" IN ('SKIPPED','BLOCKED','REFUSED','COMPLETED','FAILED','CANCELLED','KILLED') THEN
    RETURN jsonb_build_object('status', u."status", 'replayed', true);
  END IF;
  IF u."executionUnitClass" NOT IN ('PASSIVE_HTTP','SOURCE_STATIC') OR u."status" <> 'PLANNED' THEN
    RAISE EXCEPTION 'passive_unit_not_completable:%:%', u."executionUnitClass", u."status" USING ERRCODE = '23514';
  END IF;
  SELECT * INTO pl FROM "ScanPlan" WHERE id = u."scanPlanId";
  IF pl."kind" <> 'INITIAL' OR pl."state" <> 'RESOLVED' OR pl."scanId" IS NULL OR pl."deadlineMs" IS NULL THEN
    RAISE EXCEPTION 'passive_plan_not_running' USING ERRCODE = '23514';
  END IF;
  SELECT s."state"::text AS state, s."startedAt" INTO sc FROM "Scan" s WHERE s.id = pl."scanId";
  IF NOT FOUND OR sc.state IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT') OR sc."startedAt" IS NULL
     OR v_now >= sc."startedAt" + (pl."deadlineMs" * interval '1 millisecond') THEN
    RAISE EXCEPTION 'passive_scan_not_running' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "ExecutionDependency" e JOIN "ExecutionUnit" d ON d.id = e."dependsOnExecutionUnitId"
              WHERE e."executionUnitId" = p_unit_id AND d."status" <> 'COMPLETED') THEN
    RAISE EXCEPTION 'passive_prerequisite_unmet' USING ERRCODE = '23514';
  END IF;
  v_module := u."configuration"->>'domain';
  IF v_module IS NULL THEN RAISE EXCEPTION 'passive_unit_without_domain' USING ERRCODE = '23514'; END IF;
  SELECT m."state"::text INTO v_state FROM "ModuleResult" m WHERE m."scanId" = pl."scanId" AND m."module"::text = v_module;
  IF v_state IS NULL OR v_state IN ('PENDING','RUNNING') THEN
    RAISE EXCEPTION 'passive_module_not_terminal' USING ERRCODE = '23514';
  END IF;

  IF v_state IN ('COMPLETE','DEGRADED') THEN
    PERFORM set_config('fahes.passive_completion', 'on', true);
    UPDATE "ExecutionUnit" SET "status" = 'COMPLETED', "terminalReason" = 'PASSIVE_COMPLETED_BY_ORCHESTRATOR', "completedAt" = v_now
     WHERE id = p_unit_id;
    PERFORM set_config('fahes.passive_completion', 'off', true);
    RETURN jsonb_build_object('status', 'COMPLETED', 'replayed', false);
  END IF;
  UPDATE "ExecutionUnit" SET "status" = 'REFUSED', "terminalReason" = 'PASSIVE_MODULE_' || v_state, "completedAt" = v_now
   WHERE id = p_unit_id;
  RETURN jsonb_build_object('status', 'REFUSED', 'replayed', false);
END $$;
ALTER FUNCTION public.fahes_complete_passive_unit(text, text) OWNER TO fahes_owner;
REVOKE ALL ON FUNCTION public.fahes_complete_passive_unit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fahes_complete_passive_unit(text, text) TO fahes_orchestrator;
