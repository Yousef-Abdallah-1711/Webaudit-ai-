-- SPEC 008 independent-audit remediation (2026-10-29). Additive; the 20261028120000 migration is untouched.
--  D-A  lease renewal re-checks grant revocation/expiry (FR-016a: expiry is rediscovered at every checkpoint)
--  D-C  one live lease per execution unit: a second live acquisition for the same executionId is refused (FR-015)
--  D-E  audit rows carry ScopeDefinition id, environment classification and execution class (FR-020)
--  D-F  admission refusals that were previously unaudited now write an event (FR-022/FR-023)
--  D-G  execution-audit retention primitives (FR-024): owner listing + per-tenant / orphan purge
-- Rollback: specs/008-safety-killswitch-budget-audit/amendments/ROLLBACK-M008B.sql

ALTER TABLE "AdmissionLease" ADD COLUMN "executionClass" TEXT;
GRANT SELECT ON "TargetEnvironment" TO fahes_owner;
GRANT CREATE ON SCHEMA public TO fahes_owner;

-- f07_audit gains the class parameter and derives scope/environment from the database.
DROP FUNCTION public.f07_audit("ExecutionAuditEventType", text, text, text, text, text, text, jsonb);
CREATE FUNCTION public.f07_audit(
  p_type "ExecutionAuditEventType", p_actor text, p_target_id text, p_grant_id text, p_scan_id text,
  p_execution_id text, p_outcome text, p_payload jsonb DEFAULT NULL, p_class text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO "ExecutionAuditEvent"
    (id, "eventType", "actorId", "targetId", "targetAuthorizationId", "scopeId", "environmentAtEvent",
     "scanId", "executionId", "executionClass", outcome, payload, "timestamp")
  SELECT gen_random_uuid()::text, p_type, p_actor, coalesce(p_target_id, a."targetId"), p_grant_id, a."scopeId",
         e.classification::text, p_scan_id, p_execution_id, p_class, left(p_outcome, 200), p_payload, clock_timestamp()
  FROM (SELECT 1) x
  LEFT JOIN "TargetAuthorization" a ON a.id = p_grant_id
  LEFT JOIN "TargetEnvironment" e ON e."targetId" = coalesce(p_target_id, a."targetId");
$$;

DROP FUNCTION public.f07_admit(text, text, text, text, text, boolean, boolean);
CREATE FUNCTION public.f07_admit(
  p_target_id text, p_grant_id text, p_execution_id text, p_scan_id text, p_idempotency_key text,
  p_consume_request boolean, p_consume_concurrency boolean, p_execution_class text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user text; v_grant "TargetAuthorization"%ROWTYPE; v_pending jsonb; v_counter "BudgetCounter"%ROWTYPE;
  v_lease "AdmissionLease"%ROWTYPE; v_cons_exists boolean; v_token text; v_lease_id text;
  v_reason text; v_env "TargetEnvironmentClassification";
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
  IF NOT FOUND THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, NULL, p_scan_id, p_execution_id, 'NO_MATCHING_GRANT', NULL, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT');
  END IF;

  -- Caller-supplied identifiers must not cross tenants: a scan must be this owner's scan of this target,
  -- and an execution id already used by another tenant is refused (it would otherwise let one tenant's
  -- lease block, or be stopped by, another tenant's stop). Refused uniformly, revealing nothing.
  IF p_scan_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "Scan" WHERE id = p_scan_id AND "userId" = v_user AND "targetId" = p_target_id) THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, NULL, p_execution_id, 'NO_MATCHING_GRANT', NULL, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT');
  END IF;
  IF EXISTS (SELECT 1 FROM "AdmissionLease" WHERE "executionId" = p_execution_id AND "userId" <> v_user)
     OR EXISTS (SELECT 1 FROM "BudgetConsumption" WHERE "executionId" = p_execution_id AND "userId" <> v_user) THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'NO_MATCHING_GRANT', NULL, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','NO_MATCHING_GRANT');
  END IF;

  -- 1: scope advisory locks (shared), ascending scope rank.
  PERFORM public.f07_lock_scope('EXECUTION', p_execution_id, true);
  IF p_scan_id IS NOT NULL THEN PERFORM public.f07_lock_scope('SCAN', p_scan_id, true); END IF;
  PERFORM public.f07_lock_scope('GRANT', p_grant_id, true);
  PERFORM public.f07_lock_scope('TARGET', p_target_id, true);
  PERFORM public.f07_lock_scope('TENANT', v_user, true);
  PERFORM public.f07_lock_scope('PLATFORM', 'platform', true);

  -- one live lease per execution unit (FR-015): serialize acquisitions for this unit, then refuse a duplicate
  -- below. Level-1 lock (taken with the scope locks, before any counter lock); nobody else takes this key.
  IF p_consume_concurrency THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('f07:exec:' || p_execution_id, 0));
  END IF;

  -- kill switch first: a pending stop is the most urgent refusal (also covers FR-015 for this execution).
  v_pending := public.f07_stop_pending(p_execution_id, p_scan_id, p_grant_id, p_target_id, v_user);
  IF v_pending IS NOT NULL THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'KILL_SWITCH_PENDING', v_pending, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','KILL_SWITCH_PENDING','scope',v_pending->>'scope','scopeId',v_pending->>'scopeId');
  END IF;

  -- authoritative liveness of the grant, by the database clock.
  v_reason := CASE WHEN v_grant."revokedAt" IS NOT NULL THEN 'REVOKED'
                   WHEN v_grant."expiresAt" <= v_now THEN 'EXPIRED' END;
  IF v_reason IS NOT NULL THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, v_reason, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason',v_reason);
  END IF;

  -- FR-001: the environment classification is the one authorization input that can change after the
  -- caller's isAuthorized read (scope is immutable per grant), so it is re-verified here, under the locks.
  SELECT e.classification INTO v_env FROM "TargetEnvironment" e WHERE e."targetId" = p_target_id;
  IF NOT FOUND OR NOT (v_env = ANY (v_grant."environmentRestriction")) THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED', NULL, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED');
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

  IF p_consume_concurrency AND EXISTS (
       SELECT 1 FROM "AdmissionLease" l WHERE l."executionId" = p_execution_id AND l."releasedAt" IS NULL
         AND l."reclaimedAt" IS NULL AND l."expiresAt" > v_now AND l."idempotencyKey" <> p_idempotency_key) THEN
    PERFORM public.f07_audit('ADMISSION_REFUSED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'EXECUTION_ALREADY_LEASED', NULL, p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','EXECUTION_ALREADY_LEASED');
  END IF;

  IF p_consume_request AND v_counter."consumedRequests" + 1 > v_grant."requestBudget" THEN
    PERFORM public.f07_audit('BUDGET_EXHAUSTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'BUDGET_EXHAUSTED_REQUEST', p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','BUDGET_EXHAUSTED_REQUEST');
  END IF;
  IF p_consume_concurrency AND v_counter."activeConcurrency" + 1 > v_grant."concurrencyBudget" THEN
    PERFORM public.f07_audit('BUDGET_EXHAUSTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'BUDGET_EXHAUSTED_CONCURRENCY', p_class => p_execution_class);
    RETURN jsonb_build_object('outcome','REFUSED','reason','BUDGET_EXHAUSTED_CONCURRENCY');
  END IF;

  IF p_consume_request THEN
    INSERT INTO "BudgetConsumption" (id, "targetAuthorizationId", "userId", "executionId", "idempotencyKey", "consumedAt")
    VALUES (gen_random_uuid()::text, p_grant_id, v_user, p_execution_id, p_idempotency_key, v_now);
    UPDATE "BudgetCounter" SET "consumedRequests" = "consumedRequests" + 1, "updatedAt" = v_now WHERE id = v_counter.id;
    PERFORM public.f07_audit('BUDGET_CONSUMED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'CONSUMED', p_class => p_execution_class);
  END IF;
  IF p_consume_concurrency THEN
    v_lease_id := gen_random_uuid()::text;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO "AdmissionLease" (id, "targetAuthorizationId", "userId", "targetId", "scanId", "executionId", "idempotencyKey", "holderToken", "acquiredAt", "expiresAt", "executionClass")
    VALUES (v_lease_id, p_grant_id, v_user, p_target_id, p_scan_id, p_execution_id, p_idempotency_key, v_token, v_now, v_now + interval '30 seconds', p_execution_class);
    UPDATE "BudgetCounter" SET "activeConcurrency" = "activeConcurrency" + 1, "updatedAt" = v_now WHERE id = v_counter.id;
    PERFORM public.f07_audit('BUDGET_RESERVED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'RESERVED', p_class => p_execution_class);
  END IF;
  PERFORM public.f07_audit('ADMISSION_GRANTED', v_user, p_target_id, p_grant_id, p_scan_id, p_execution_id, 'GRANTED', p_class => p_execution_class);
  RETURN jsonb_build_object('outcome','GRANTED','grantId',p_grant_id,'leaseId',v_lease_id,'holderToken',v_token,'replay',false);
END $$;

CREATE OR REPLACE FUNCTION public.f07_renew_lease(p_lease_id text, p_holder_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); l "AdmissionLease"%ROWTYPE; v_pending jsonb; v_n int; g "TargetAuthorization"%ROWTYPE;
BEGIN
  SELECT * INTO l FROM "AdmissionLease" WHERE id = p_lease_id;
  IF NOT FOUND OR l."holderToken" <> coalesce(p_holder_token, '') THEN
    RETURN jsonb_build_object('status','FENCED');
  END IF;
  v_pending := public.f07_stop_pending(l."executionId", l."scanId", l."targetAuthorizationId", l."targetId", l."userId");
  IF v_pending IS NOT NULL THEN
    RETURN jsonb_build_object('status','STOP_PENDING','scope',v_pending->>'scope','scopeId',v_pending->>'scopeId');
  END IF;
  -- FR-016a: expiry is rediscovered at every checkpoint, so renewal must not outlive the grant
  SELECT * INTO g FROM "TargetAuthorization" WHERE id = l."targetAuthorizationId";
  IF NOT FOUND OR g."revokedAt" IS NOT NULL OR g."expiresAt" <= v_now THEN
    RETURN jsonb_build_object('status','GRANT_INVALID','reason',
      CASE WHEN FOUND AND g."revokedAt" IS NULL THEN 'EXPIRED' ELSE 'REVOKED' END);
  END IF;
  UPDATE "AdmissionLease" SET "expiresAt" = v_now + interval '30 seconds'
   WHERE id = p_lease_id AND "holderToken" = p_holder_token
     AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL AND "expiresAt" > v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    PERFORM public.f07_audit('SAFETY_VIOLATION', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'LEASE_RENEWAL_FENCED', NULL, p_class => l."executionClass");
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
  PERFORM public.f07_audit('BUDGET_RELEASED', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'RELEASED', NULL, p_class => l."executionClass");
  IF p_completed THEN
    PERFORM public.f07_audit('EXECUTION_COMPLETED', l."userId", l."targetId", l."targetAuthorizationId", l."scanId", l."executionId", 'COMPLETED', NULL, p_class => l."executionClass");
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
             RETURNING id, "userId", "targetId", "scanId", "executionClass" LOOP
      v_n := v_n + 1;
      PERFORM public.f07_audit('BUDGET_RELEASED', l."userId", l."targetId", g.gid, l."scanId", p_execution_id, 'RELEASED_BY_AUTHORITY', NULL, p_class => l."executionClass");
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
             RETURNING id, "userId", "targetId", "scanId", "executionId", "executionClass" LOOP
      v_n := v_n + 1;
      PERFORM public.f07_audit('BUDGET_RELEASED', 'SYSTEM', l."targetId", g.gid, l."scanId", l."executionId", 'RECLAIMED_EXPIRED', NULL, p_class => l."executionClass");
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
  SELECT v_id, p_type, p_actor, coalesce(p_target_id, a."targetId"), p_grant_id, coalesce(p_scope_def_id, a."scopeId"),
         coalesce(p_env, e.classification::text), p_scan_id, p_execution_id, p_class, p_outcome, p_payload, clock_timestamp()
  FROM (SELECT 1) x
  LEFT JOIN "TargetAuthorization" a ON a.id = p_grant_id AND (p_target_id IS NULL OR a."targetId" = p_target_id)
  LEFT JOIN "TargetEnvironment" e ON e."targetId" = coalesce(p_target_id, a."targetId");
  RETURN v_id;
END $$;


-- ---------------------------------------------------------------- D-G retention primitives (FR-024)
-- Owners that have execution-audit events (so the retention sweep can apply each tenant's plan retention).
CREATE FUNCTION public.f07_audit_owner_ids(p_limit integer DEFAULT 1000)
RETURNS SETOF text LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT DISTINCT u FROM (
    SELECT a."userId" AS u FROM "ExecutionAuditEvent" e JOIN "TargetAuthorization" a ON a.id = e."targetAuthorizationId"
    UNION SELECT t."userId" FROM "ExecutionAuditEvent" e JOIN "Target" t ON t.id = e."targetId"
    UNION SELECT s."userId" FROM "ExecutionAuditEvent" e JOIN "Scan" s ON s.id = e."scanId"
  ) o ORDER BY u LIMIT least(greatest(p_limit, 1), 10000);
$$;

CREATE FUNCTION public.f07_purge_execution_audit(p_user_id text, p_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_n integer;
BEGIN
  IF coalesce(p_user_id, '') = '' OR p_cutoff IS NULL OR p_cutoff > clock_timestamp() THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;
  DELETE FROM "ExecutionAuditEvent" e
   WHERE e."timestamp" < p_cutoff
     AND (e."targetAuthorizationId" IN (SELECT id FROM "TargetAuthorization" WHERE "userId" = p_user_id)
       OR e."targetId" IN (SELECT id FROM "Target" WHERE "userId" = p_user_id)
       OR e."scanId" IN (SELECT id FROM "Scan" WHERE "userId" = p_user_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Events no tenant owns any more (operator-scope stops, or whose tenant/target/scan no longer exists).
CREATE FUNCTION public.f07_purge_unowned_execution_audit(p_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_n integer;
BEGIN
  IF p_cutoff IS NULL OR p_cutoff > clock_timestamp() THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;
  DELETE FROM "ExecutionAuditEvent" e
   WHERE e."timestamp" < p_cutoff
     AND NOT EXISTS (SELECT 1 FROM "TargetAuthorization" a WHERE a.id = e."targetAuthorizationId")
     AND NOT EXISTS (SELECT 1 FROM "Target" t WHERE t.id = e."targetId")
     AND NOT EXISTS (SELECT 1 FROM "Scan" s WHERE s.id = e."scanId");
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------------- ownership and grants for everything created here
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'f07\_%' AND pg_get_userbyid(p.proowner) <> 'fahes_owner' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO fahes_owner', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('f07_audit','f07_admit','f07_audit_owner_ids','f07_purge_execution_audit','f07_purge_unowned_execution_audit') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.f07_admit(text,text,text,text,text,boolean,boolean,text) TO fahes_api;
GRANT EXECUTE ON FUNCTION public.f07_audit_owner_ids(integer), public.f07_purge_execution_audit(text,timestamptz),
  public.f07_purge_unowned_execution_audit(timestamptz) TO fahes_orchestrator;

REVOKE CREATE ON SCHEMA public FROM fahes_owner;
