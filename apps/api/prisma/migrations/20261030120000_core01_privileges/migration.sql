-- SPEC 009 CORE-01 least-privilege grants (DEC-044 direction, F-02 style). Additive: no table shape changes.
-- Tables and the single finalizer are owned by fahes_owner (like the SPEC 008 tables), PUBLIC has no access, each runtime
-- role gets exactly what its code path needs, and terminal statuses can only be written inside fahes_finalize_unit
-- (DEC-047): a runtime role that tries a direct terminal UPDATE is refused by the guard trigger.
--
-- New cluster-level role: fahes_exec_host - the SPEC 009 execution host (claim, CAS, effect ledger, evidence, finalize,
-- F07 admission). It inherits fahes_worker_exec (lease renewal, ack) and is additionally allowed f07_admit, because the host
-- is the claim owner that asks F07 for admission (the SPEC 008 matrix gave admission to fahes_api only; widening
-- fahes_worker_exec for every worker process was rejected).
-- This does not change which login the shared dev API/worker use: they remain the superuser, so none of this is in force there.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_exec_host') THEN
    CREATE ROLE fahes_exec_host NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role(current_user, 'fahes_owner', 'MEMBER') THEN
    EXECUTE format('GRANT fahes_owner TO %I', current_user);
  END IF;
END $$;
GRANT fahes_worker_exec TO fahes_exec_host;

-- Ownership: the owner can read/write its own tables from SECURITY DEFINER functions.
ALTER TABLE "ScanProfile" OWNER TO fahes_owner;
ALTER TABLE "ScanProfileVersion" OWNER TO fahes_owner;
ALTER TABLE "ScanPlan" OWNER TO fahes_owner;
ALTER TABLE "ExecutionUnit" OWNER TO fahes_owner;
ALTER TABLE "ExecutionDependency" OWNER TO fahes_owner;
ALTER TABLE "Evidence" OWNER TO fahes_owner;
ALTER TABLE "IssueEvidenceLink" OWNER TO fahes_owner;
ALTER TABLE "Artifact" OWNER TO fahes_owner;
ALTER TABLE "ExecutionUnitHostClaim" OWNER TO fahes_owner;
ALTER TABLE "EffectAuthorization" OWNER TO fahes_owner;
ALTER SEQUENCE "ExecutionUnitHostClaim_claimSeq_seq" OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb) OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_unit_guard() OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_immutable_row() OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_dependency_same_plan() OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_effect_guard() OWNER TO fahes_owner;

-- The same-plan trigger reads ExecutionUnit as whoever inserts the edge: make it a definer.
ALTER FUNCTION public.fahes_dependency_same_plan() SECURITY DEFINER;

REVOKE ALL ON "ScanProfile", "ScanProfileVersion", "ScanPlan", "ExecutionUnit", "ExecutionDependency", "Evidence",
  "IssueEvidenceLink", "Artifact", "ExecutionUnitHostClaim", "EffectAuthorization" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "ExecutionUnitHostClaim_claimSeq_seq" FROM PUBLIC;

-- Terminal statuses are written ONLY by the finalizer (a definer function running as fahes_owner).
-- Inside it current_user is fahes_owner, which is not a member of any runtime role; a direct statement by a runtime
-- login is. Superusers are exempt explicitly (pg_has_role is true for a superuser on every role), so nothing changes where
-- the shared superuser is used.
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
  IF OLD."status" = 'PLANNED' AND NEW."status" = 'COMPLETED' AND OLD."executionUnitClass" <> 'TELEMETRY' THEN
    RAISE EXCEPTION 'execution_unit_invalid_transition:PLANNED->COMPLETED' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" IN ('SKIPPED','BLOCKED','REFUSED','COMPLETED','FAILED','CANCELLED','KILLED') AND NEW."status" <> OLD."status"
     AND NOT (SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = current_user)
     AND NOT (SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = current_user)
     AND (pg_has_role(current_user, 'fahes_exec_host', 'MEMBER') OR pg_has_role(current_user, 'fahes_worker_exec', 'MEMBER')
       OR pg_has_role(current_user, 'fahes_api', 'MEMBER') OR pg_has_role(current_user, 'fahes_operator', 'MEMBER')
       OR pg_has_role(current_user, 'fahes_orchestrator', 'MEMBER')) THEN
    RAISE EXCEPTION 'execution_unit_terminal_write_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.fahes_unit_guard() OWNER TO fahes_owner;

-- ---------------------------------------------------------------- grants
-- API: resolves plans (INSERT) and reads everything report-shaped.
GRANT SELECT, INSERT ON "ScanProfile", "ScanProfileVersion", "ScanPlan", "ExecutionUnit", "ExecutionDependency" TO fahes_api;
GRANT SELECT ON "Evidence", "IssueEvidenceLink", "Artifact" TO fahes_api;

-- Execution host: claim, CAS edges, progress, effect ledger, evidence/artifact/link writes, finalizer, admission.
GRANT SELECT ON "ScanProfile", "ScanProfileVersion", "ScanPlan", "ExecutionUnit", "ExecutionDependency", "Evidence",
  "IssueEvidenceLink", "Artifact", "ExecutionUnitHostClaim", "EffectAuthorization" TO fahes_exec_host;
GRANT UPDATE ("status", "dispatchedAt", "startedAt", "progressSnapshot", "progressIndeterminate") ON "ExecutionUnit" TO fahes_exec_host;
GRANT INSERT ON "ExecutionUnitHostClaim", "EffectAuthorization", "Evidence", "Artifact", "IssueEvidenceLink" TO fahes_exec_host;
GRANT UPDATE ("state", "confirmedAt") ON "EffectAuthorization" TO fahes_exec_host;
GRANT USAGE ON SEQUENCE "ExecutionUnitHostClaim_claimSeq_seq" TO fahes_exec_host;
GRANT EXECUTE ON FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb) TO fahes_exec_host;
GRANT EXECUTE ON FUNCTION public.f07_admit(text,text,text,text,text,boolean,boolean,text) TO fahes_exec_host;
GRANT EXECUTE ON FUNCTION public.f07_stop_pending(text,text,text,text,text) TO fahes_exec_host;

-- Orchestrator (sweeps, retention): reads, finalizes through the one function, removes artifacts with their report.
GRANT SELECT ON "ScanProfile", "ScanProfileVersion", "ScanPlan", "ExecutionUnit", "ExecutionDependency", "Evidence",
  "IssueEvidenceLink", "Artifact", "EffectAuthorization" TO fahes_orchestrator;
GRANT DELETE ON "Artifact" TO fahes_orchestrator;
GRANT UPDATE ("artifactId") ON "Evidence" TO fahes_orchestrator;
GRANT EXECUTE ON FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb) TO fahes_orchestrator;

-- Operator: read-only view of plans and units for support.
GRANT SELECT ON "ScanPlan", "ExecutionUnit", "ExecutionDependency" TO fahes_operator;

REVOKE ALL ON FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------- narrow definer reads (no table access for workers)
-- Lease liveness + the row lock the host CAS needs (FOR SHARE persists in the caller's transaction). Workers never read
-- AdmissionLease directly (it carries holderToken in clear text; the host takes the token from its own admission result).
CREATE FUNCTION public.fahes_lock_live_lease(p_execution_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF coalesce(p_execution_id, '') = '' THEN RETURN false; END IF;
  PERFORM 1 FROM "AdmissionLease"
   WHERE "executionId" = p_execution_id AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL FOR SHARE;
  RETURN FOUND;
END $$;

-- The reason code of the pending stop covering a unit (same predicate as f07_stop_pending).
CREATE FUNCTION public.fahes_pending_stop_reason(
  p_execution_id text, p_scan_id text, p_grant_id text, p_target_id text, p_user_id text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT k.reason::text FROM "KillSwitchState" k
   WHERE ((k.scope = 'EXECUTION' AND k."scopeId" = p_execution_id)
       OR (k.scope = 'SCAN' AND p_scan_id IS NOT NULL AND k."scopeId" = p_scan_id)
       OR (k.scope = 'GRANT' AND k."scopeId" = p_grant_id)
       OR (k.scope = 'TARGET' AND k."scopeId" = p_target_id)
       OR (k.scope = 'TENANT' AND k."scopeId" = p_user_id)
       OR (k.scope = 'PLATFORM' AND k."scopeId" = 'platform'))
     AND (k.state IN ('REQUESTED','ACKNOWLEDGED') OR (k.scope = 'EXECUTION' AND k.state = 'STOPPED'))
   ORDER BY k.scope LIMIT 1;
$$;

ALTER FUNCTION public.fahes_lock_live_lease(text) OWNER TO fahes_owner;
ALTER FUNCTION public.fahes_pending_stop_reason(text, text, text, text, text) OWNER TO fahes_owner;
REVOKE ALL ON FUNCTION public.fahes_lock_live_lease(text), public.fahes_pending_stop_reason(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fahes_lock_live_lease(text) TO fahes_exec_host;
GRANT EXECUTE ON FUNCTION public.fahes_pending_stop_reason(text, text, text, text, text) TO fahes_exec_host, fahes_orchestrator;
