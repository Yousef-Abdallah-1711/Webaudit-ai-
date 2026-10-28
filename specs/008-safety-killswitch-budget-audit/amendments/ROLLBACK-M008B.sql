-- Rollback for migration 20261029000000_safety_audit_context_and_lease_exclusivity ONLY (migration A stays).
-- Restores the previous function bodies from 20261028120000, drops the retention primitives and the
-- AdmissionLease.executionClass column, and removes this migration's _prisma_migrations row.
-- Loses: the execution class stored on leases (audit rows already written keep their context columns).
BEGIN;
GRANT CREATE ON SCHEMA public TO fahes_owner;
DROP FUNCTION IF EXISTS public.f07_audit_owner_ids(integer);
DROP FUNCTION IF EXISTS public.f07_purge_execution_audit(text, timestamptz);
DROP FUNCTION IF EXISTS public.f07_purge_unowned_execution_audit(timestamptz);
DROP FUNCTION IF EXISTS public.f07_admit(text, text, text, text, text, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.f07_audit("ExecutionAuditEventType", text, text, text, text, text, text, jsonb, text);

CREATE FUNCTION public.f07_audit(
  p_type "ExecutionAuditEventType", p_actor text, p_target_id text, p_grant_id text, p_scan_id text,
  p_execution_id text, p_outcome text, p_payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO "ExecutionAuditEvent"
    (id, "eventType", "actorId", "targetId", "targetAuthorizationId", "scanId", "executionId", outcome, payload, "timestamp")
  VALUES (gen_random_uuid()::text, p_type, p_actor, p_target_id, p_grant_id, p_scan_id, p_execution_id,
          left(p_outcome, 200), p_payload, clock_timestamp());
$$;

CREATE FUNCTION public.f07_admit(
  p_target_id text, p_grant_id text, p_execution_id text, p_scan_id text, p_idempotency_key text,
  p_consume_request boolean, p_consume_concurrency boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user text; v_grant "TargetAuthorization"%ROWTYPE; v_pending jsonb; v_counter "BudgetCounter"%ROWTYPE;
  v_lease "AdmissionLease"%ROWTYPE; v_cons_exists boolean; v_token text; v_lease_id text;
  v_reason text;
BEGIN
  IF coalesce(p_target_id,'') = '' OR coalesce(p_grant_id,'') = '' OR coalesce(p_execution_id,'') = ''
     OR coalesce(p_idempotency_key,'') = '' OR NOT (coalesce(p_consume_request,false) OR coalesce(p_consume_concurrency,false)) THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;

  -- Identity is derived from the database, never supplied: the tenant is the Target's owner.
  SELECT "userId" INTO v_user FROM "Target" WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT'); END IF;
  SELECT * INTO v_grant FROM "TargetAuthorization"
   WHERE id = p_grant_id AND "targetId" = p_target_id AND "userId" = v_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT'); END IF;

  -- Caller-supplied identifiers must not cross tenants: a scan must be this owner's scan of this target,
  -- and an execution id already used by another tenant is refused (it would otherwise let one tenant's
  -- lease block, or be stopped by, another tenant's stop). Refused uniformly, revealing nothing.
  IF p_scan_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Scan" WHERE id = p_scan_id AND "userId" = v_user AND "targetId" = p_target_id) THEN
    RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT');
  END IF;
  IF EXISTS (SELECT 1 FROM "AdmissionLease" WHERE "executionId" = p_execution_id AND "userId" <> v_user)
     OR EXISTS (SELECT 1 FROM "BudgetConsumption" WHERE "executionId" = p_execution_id AND "userId" <> v_user) THEN
    RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT');
  END IF;

  -- 1: scope advisory locks (shared), ascending scope rank.
  PERFORM public.f07_lock_scope('EXECUTION', p_execution_id, true);
  IF p_scan_id IS NOT NULL THEN PERFORM public.f07_lock_scope('SCAN', p_scan_id, true); END IF;
  PERFORM public.f07_lock_scope('GRANT', p_grant_id, true);
  PERFORM public.f07_lock_scope('TARGET', p_target_id, true);
  PERFORM public.f07_lock_scope('TENANT', v_user, true);
  PERFORM public.f07_lock_scope('PLATFORM', 'platform', true);

  -- kill switch first: a pending stop is the most urgent refusal (also covers FR-015 for this execution).
  v_pending := public.f07_stop_pending(p_execution_id, p_scan_id, p_grant_id, p_target_id, v_user);
  IF v_pending IS NOT NULL THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'KILL_SWITCH_PENDING', v_pending);
    RETURN jsonb_build_object('outcome','REFUSED','reason','KILL_SWITCH_PENDING','scope',v_pending->>'scope','scopeId',v_pending->>'scopeId');
  END IF;

  -- authoritative liveness of the grant, by the database clock.
  v_reason := CASE WHEN v_grant."revokedAt" IS NOT NULL THEN 'REVOKED'
                   WHEN v_grant."expiresAt" <= v_now THEN 'EXPIRED' END;
  IF v_reason IS NOT NULL THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, v_reason);
    RETURN jsonb_build_object('outcome','REFUSED','reason',v_reason);
  END IF;

  -- 2: counter row (lazy create, then lock).
  INSERT INTO "BudgetCounter" (id, "targetAuthorizationId", "userId", "updatedAt")
  VALUES (gen_random_uuid()::text, p_grant_id, v_user, v_now) ON CONFLICT ("targetAuthorizationId") DO NOTHING;
  SELECT * INTO v_counter FROM "BudgetCounter" WHERE "targetAuthorizationId" = p_grant_id FOR UPDATE;

  -- idempotent replay: same (grant, key) returns the stored outcome and consumes nothing.
  SELECT * INTO v_lease FROM "AdmissionLease" WHERE "targetAuthorizationId" = p_grant_id AND "idempotencyKey" = p_idempotency_key;
  SELECT EXISTS (SELECT 1 FROM "BudgetConsumption" WHERE "targetAuthorizationId" = p_grant_id AND "idempotencyKey" = p_idempotency_key) INTO v_cons_exists;
  IF v_lease.id IS NOT NULL OR v_cons_exists THEN
    RETURN jsonb_build_object('outcome','GRANTED','grantId',p_grant_id,'leaseId',v_lease.id,'holderToken',v_lease."holderToken",'replay',true);
  END IF;

  IF p_consume_request AND v_counter."consumedRequests" + 1 > v_grant."requestBudget" THEN
    PERFORM public.f07_audit('BUDGET_EXHAUSTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'BUDGET_EXHAUSTED_REQUEST');
    RETURN jsonb_build_object('outcome','REFUSED','reason','BUDGET_EXHAUSTED_REQUEST');
  END IF;
  IF p_consume_concurrency AND v_counter."activeConcurrency" + 1 > v_grant."concurrencyBudget" THEN
    PERFORM public.f07_audit('BUDGET_EXHAUSTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'BUDGET_EXHAUSTED_CONCURRENCY');
    RETURN jsonb_build_object('outcome','REFUSED','reason','BUDGET_EXHAUSTED_CONCURRENCY');
  END IF;

  IF p_consume_request THEN
    INSERT INTO "BudgetConsumption" (id, "targetAuthorizationId", "userId", "executionId", "idempotencyKey", "consumedAt")
    VALUES (gen_random_uuid()::text, p_grant_id, v_user, p_execution_id, p_idempotency_key, v_now);
    UPDATE "BudgetCounter" SET "consumedRequests" = "consumedRequests" + 1, "updatedAt" = v_now WHERE id = v_counter.id;
    PERFORM public.f07_audit('BUDGET_CONSUMED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'CONSUMED');
  END IF;
  IF p_consume_concurrency THEN
    v_lease_id := gen_random_uuid()::text;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO "AdmissionLease" (id, "targetAuthorizationId", "userId", "targetId", "scanId", "executionId", "idempotencyKey", "holderToken", "acquiredAt", "expiresAt")
    VALUES (v_lease_id, p_grant_id, v_user, p_target_id, p_scan_id, p_execution_id, p_idempotency_key, v_token, v_now, v_now + interval '30 seconds');
    UPDATE "BudgetCounter" SET "activeConcurrency" = "activeConcurrency" + 1, "updatedAt" = v_now WHERE id = v_counter.id;
    PERFORM public.f07_audit('BUDGET_RESERVED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'RESERVED');
  END IF;
  PERFORM public.f07_audit('ADMISSION_GRANTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'GRANTED');
  RETURN jsonb_build_object('outcome','GRANTED','grantId',p_grant_id,'leaseId',v_lease_id,'holderToken',v_token,'replay',false);
END $$;

CREATE OR REPLACE FUNCTION public.f07_renew_lease(p_lease_id text, p_holder_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); l "AdmissionLease"%ROWTYPE; v_pending jsonb; v_n int;
BEGIN
  SELECT * INTO l FROM "AdmissionLease" WHERE id = p_lease_id;
  IF NOT FOUND OR l."holderToken" <> coalesce(p_holder_token, '') THEN
    RETURN jsonb_build_object('status','FENCED');
  END IF;
  v_pending := public.f07_stop_pending(l."executionId", l."scanId", l."targetAuthorizationId", l."targetId", l."userId");
  IF v_pending IS NOT NULL THEN
    RETURN jsonb_build_object('status','STOP_PENDING','scope',v_pending->>'scope','scopeId',v_pending->>'scopeId');
  END IF;
  UPDATE "AdmissionLease" SET "expiresAt" = v_now + interval '30 seconds'
   WHERE id = p_lease_id AND "holderToken" = p_holder_token
     AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL AND "expiresAt" > v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    PERFORM public.f07_audit('SAFETY_VIOLATION', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'LEASE_RENEWAL_FENCED');
    RETURN jsonb_build_object('status','FENCED');
  END IF;
  RETURN jsonb_build_object('status','RENEWED','expiresAt', v_now + interval '30 seconds');
END $$;

CREATE OR REPLACE FUNCTION public.f07_release_lease_by_token(p_lease_id text, p_holder_token text, p_completed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); l "AdmissionLease"%ROWTYPE; v_n int;
BEGIN
  SELECT * INTO l FROM "AdmissionLease" WHERE id = p_lease_id;
  IF NOT FOUND OR l."holderToken" <> coalesce(p_holder_token, '') THEN
    RETURN jsonb_build_object('released', false);
  END IF;
  PERFORM 1 FROM "BudgetCounter" WHERE "targetAuthorizationId" = l."targetAuthorizationId" FOR UPDATE;   -- 2
  UPDATE "AdmissionLease" SET "releasedAt" = v_now                                                          -- 3
   WHERE id = p_lease_id AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('released', false); END IF;
  UPDATE "BudgetCounter" SET "activeConcurrency" = greatest("activeConcurrency" - 1, 0), "updatedAt" = v_now
   WHERE "targetAuthorizationId" = l."targetAuthorizationId";
  PERFORM public.f07_audit('BUDGET_RELEASED', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'RELEASED');
  IF p_completed THEN
    PERFORM public.f07_audit('EXECUTION_COMPLETED', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'COMPLETED');
  END IF;
  RETURN jsonb_build_object('released', true);
END $$;

CREATE OR REPLACE FUNCTION public.f07_release_leases_by_execution(p_execution_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); g record; l record; v_total int := 0; v_n int;
BEGIN
  IF coalesce(p_execution_id,'') = '' THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  FOR g IN SELECT DISTINCT "targetAuthorizationId" AS gid FROM "AdmissionLease"
           WHERE "executionId" = p_execution_id AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL ORDER BY 1 LOOP
    PERFORM 1 FROM "BudgetCounter" WHERE "targetAuthorizationId" = g.gid FOR UPDATE;                        -- 2
    v_n := 0;
    FOR l IN UPDATE "AdmissionLease" SET "releasedAt" = v_now                                               -- 3
             WHERE "targetAuthorizationId" = g.gid AND "executionId" = p_execution_id
               AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL
             RETURNING id, "userId", "targetId", "scanId" LOOP
      v_n := v_n + 1;
      PERFORM public.f07_audit('BUDGET_RELEASED', l."userId", l."targetId", g.gid, l."scanId", p_execution_id, 'RELEASED_BY_AUTHORITY');
    END LOOP;
    IF v_n > 0 THEN
      UPDATE "BudgetCounter" SET "activeConcurrency" = greatest("activeConcurrency" - v_n, 0), "updatedAt" = v_now
       WHERE "targetAuthorizationId" = g.gid;
    END IF;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.f07_reclaim_expired_leases(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); g record; l record;
        v_reclaimed int := 0; v_skipped int := 0; v_corrected int := 0; v_n int; v_live int;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  FOR g IN SELECT DISTINCT "targetAuthorizationId" AS gid FROM "AdmissionLease"
           WHERE "releasedAt" IS NULL AND "reclaimedAt" IS NULL AND "expiresAt" <= v_now ORDER BY 1 LIMIT p_limit LOOP
    PERFORM 1 FROM "BudgetCounter" WHERE "targetAuthorizationId" = g.gid FOR UPDATE SKIP LOCKED;           -- 2
    IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_n := 0;
    FOR l IN UPDATE "AdmissionLease" SET "reclaimedAt" = v_now                                              -- 3
             WHERE "targetAuthorizationId" = g.gid AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL AND "expiresAt" <= v_now
             RETURNING id, "userId", "targetId", "scanId", "executionId" LOOP
      v_n := v_n + 1;
      PERFORM public.f07_audit('BUDGET_RELEASED', 'SYSTEM', l."targetId", g.gid, l."scanId", l."executionId", 'RECLAIMED_EXPIRED');
    END LOOP;
    SELECT count(*) INTO v_live FROM "AdmissionLease" WHERE "targetAuthorizationId" = g.gid AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL;
    UPDATE "BudgetCounter" SET "activeConcurrency" = v_live, "updatedAt" = v_now WHERE "targetAuthorizationId" = g.gid;
    v_reclaimed := v_reclaimed + v_n;
  END LOOP;
  -- drift pass: the counter is only a cache of the live lease count.
  FOR g IN SELECT c."targetAuthorizationId" AS gid FROM "BudgetCounter" c
           WHERE c."activeConcurrency" <> (SELECT count(*) FROM "AdmissionLease" x WHERE x."targetAuthorizationId" = c."targetAuthorizationId"
                                           AND x."releasedAt" IS NULL AND x."reclaimedAt" IS NULL)
           ORDER BY 1 LIMIT p_limit LOOP
    PERFORM 1 FROM "BudgetCounter" WHERE "targetAuthorizationId" = g.gid FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT count(*) INTO v_live FROM "AdmissionLease" WHERE "targetAuthorizationId" = g.gid AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL;
    UPDATE "BudgetCounter" SET "activeConcurrency" = v_live, "updatedAt" = v_now
     WHERE "targetAuthorizationId" = g.gid AND "activeConcurrency" <> v_live;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_corrected := v_corrected + v_n;
  END LOOP;
  RETURN jsonb_build_object('reclaimed', v_reclaimed, 'skippedLocked', v_skipped, 'driftCorrected', v_corrected);
END $$;

CREATE OR REPLACE FUNCTION public.f07_record_audit_ts(
  p_type "ExecutionAuditEventType", p_actor text, p_target_id text, p_grant_id text, p_scope_def_id text,
  p_env text, p_scan_id text, p_execution_id text, p_class text, p_outcome text, p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id text := gen_random_uuid()::text;
BEGIN
  IF coalesce(p_actor,'') = '' OR coalesce(p_outcome,'') = '' OR length(p_outcome) > 200
     OR (p_payload IS NOT NULL AND (jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 8192)) THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO "ExecutionAuditEvent"
    (id, "eventType", "actorId", "targetId", "targetAuthorizationId", "scopeId", "environmentAtEvent", "scanId", "executionId", "executionClass", outcome, payload, "timestamp")
  VALUES (v_id, p_type, p_actor, p_target_id, p_grant_id, p_scope_def_id, p_env, p_scan_id, p_execution_id, p_class, p_outcome, p_payload, clock_timestamp());
  RETURN v_id;
END $$;

ALTER TABLE "AdmissionLease" DROP COLUMN "executionClass";
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'f07\_%' AND pg_get_userbyid(p.proowner) <> 'fahes_owner' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO fahes_owner', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.f07_admit(text,text,text,text,text,boolean,boolean) TO fahes_api;
REVOKE SELECT ON "TargetEnvironment" FROM fahes_owner;
REVOKE CREATE ON SCHEMA public FROM fahes_owner;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261029000000_safety_audit_context_and_lease_exclusivity';
COMMIT;
