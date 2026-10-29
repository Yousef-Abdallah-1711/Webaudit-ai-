-- SECURITY DEFINER fence for host-produced evidence. The execution host can read Scan but cannot lock it directly
-- (row locks require UPDATE privilege); keep Scan immutable to that role and expose only this predicate+lock.
-- `fahes_owner` receives UPDATE on the single immutable `startedAt` column solely to acquire the row lock below;
-- the function itself never changes Scan, and no runtime role gains this privilege.
GRANT UPDATE ("startedAt") ON "Scan" TO fahes_owner;

CREATE FUNCTION public.fahes_lock_execution_evidence(
  p_execution_unit_id text,
  p_user_id text,
  p_attempt integer,
  p_host_instance_id text,
  p_claim_token_hash text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_unit record;
  v_plan record;
  v_scan record;
  v_deadline timestamptz;
BEGIN
  IF coalesce(p_execution_unit_id, '') = '' OR coalesce(p_user_id, '') = ''
     OR coalesce(p_host_instance_id, '') = '' OR p_attempt IS NULL OR p_attempt < 1
     OR p_claim_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN 'INVALID_CLAIM';
  END IF;

  -- Fence first: lock the tenant-owned unit so finalization cannot overtake an in-flight evidence write.
  SELECT u.id, u."userId", u."scanPlanId", u.status::text AS status, u.attempt
    INTO v_unit
    FROM public."ExecutionUnit" u
   WHERE u.id = p_execution_unit_id AND u."userId" = p_user_id
   FOR SHARE;
  IF NOT FOUND THEN RETURN 'UNIT_NOT_FOUND'; END IF;
  IF v_unit.status <> 'RUNNING' THEN
    IF v_unit.status IN ('COMPLETED','FAILED','CANCELLED','KILLED','REFUSED','SKIPPED','BLOCKED') THEN
      RETURN 'UNIT_TERMINAL';
    END IF;
    RETURN 'UNIT_STATUS_' || v_unit.status;
  END IF;
  IF v_unit.attempt <> p_attempt THEN RETURN 'STALE_ATTEMPT'; END IF;

  SELECT p.kind::text AS kind, p.state::text AS state, p."deadlineMs" AS "deadlineMs",
         p."resolvedAt" AS "resolvedAt", p."scanId" AS "scanId"
    INTO v_plan
    FROM public."ScanPlan" p
   WHERE p.id = v_unit."scanPlanId";
  IF NOT FOUND OR v_plan.state <> 'RESOLVED' OR v_plan."deadlineMs" IS NULL THEN
    RETURN 'PLAN_NOT_RESOLVED';
  END IF;

  IF v_plan.kind = 'INITIAL' THEN
    IF v_plan."scanId" IS NULL THEN RETURN 'SCAN_NOT_FOUND'; END IF;
    -- Lock the scan through this definer because runtime roles intentionally have no Scan UPDATE grant.
    SELECT s.state::text AS state, s."startedAt" AS "startedAt"
      INTO v_scan
      FROM public."Scan" s
     WHERE s.id = v_plan."scanId"
     FOR SHARE;
    IF NOT FOUND THEN RETURN 'SCAN_NOT_FOUND'; END IF;
    IF v_scan.state IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT') THEN
      RETURN 'SCAN_' || v_scan.state;
    END IF;
    IF v_scan."startedAt" IS NULL THEN RETURN 'SCAN_NOT_STARTED'; END IF;
    v_deadline := v_scan."startedAt" + (v_plan."deadlineMs" * interval '1 millisecond');
  ELSE
    v_deadline := v_plan."resolvedAt" + (v_plan."deadlineMs" * interval '1 millisecond');
  END IF;
  IF clock_timestamp() >= v_deadline THEN RETURN 'SCAN_DEADLINE_EXPIRED'; END IF;

  -- Claim second: the immutable host claim must match this tenant, attempt, host, and in-memory token hash.
  IF NOT EXISTS (
    SELECT 1
      FROM public."ExecutionUnitHostClaim" c
     WHERE c."executionUnitId" = v_unit.id
       AND c."scanPlanId" = v_unit."scanPlanId"
       AND c."userId" = v_unit."userId"
       AND c.attempt = p_attempt
       AND c."hostInstanceId" = p_host_instance_id
       AND c."claimTokenHash" = p_claim_token_hash
  ) THEN
    RETURN 'CLAIM_MISMATCH';
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.fahes_lock_execution_evidence(text, text, integer, text, text) OWNER TO fahes_owner;
REVOKE ALL ON FUNCTION public.fahes_lock_execution_evidence(text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fahes_lock_execution_evidence(text, text, integer, text, text) TO fahes_exec_host;
