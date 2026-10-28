-- SPEC 008 (Foundation Spec 07) — safety admission, budget, kill switch, execution audit.
-- Additive, hand-reviewed. Roles + tables + SECURITY DEFINER functions (F-02 design, amendment A1).
-- Applied with `prisma migrate deploy` only (never `migrate dev`: partitioned-PK drift, D-10).
-- Rollback script: specs/008-safety-killswitch-budget-audit/amendments/ROLLBACK-M008.sql
--
-- Lock order (DEC-050, owner-delegated technical decision, F-02 §7), ascending, never inverted:
--   1 scope advisory locks (admission: shared on its up-to-six keys in scope rank order;
--     stop/ack/record: exclusive on one key; reconciler: try-exclusive, never waits)
--   2 BudgetCounter row FOR UPDATE   3 AdmissionLease rows   4 KillSwitchState row
--   5 inserts (BudgetConsumption, ExecutionAuditEvent)

-- ---------------------------------------------------------------- roles (NOLOGIN groups)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['fahes_owner','fahes_api','fahes_worker_exec','fahes_orchestrator','fahes_operator'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
    END IF;
  END LOOP;
END $$;

-- The migration runner must be able to hand objects to fahes_owner.
DO $$ BEGIN
  IF NOT pg_has_role(current_user, 'fahes_owner', 'MEMBER') THEN
    EXECUTE format('GRANT fahes_owner TO %I', current_user);
  END IF;
END $$;
-- Needed only while objects are handed over (revoked at the end).
GRANT CREATE ON SCHEMA public TO fahes_owner;

-- ---------------------------------------------------------------- tables / enums (generated, additive)
-- CreateEnum
CREATE TYPE "SafetyScope" AS ENUM ('EXECUTION', 'SCAN', 'GRANT', 'TARGET', 'TENANT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "StopLifecycleState" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'STOPPED');

-- CreateEnum
CREATE TYPE "KillSwitchReason" AS ENUM ('USER_CANCELLATION', 'AUTHORIZATION_REVOKED', 'ENVIRONMENT_RECLASSIFIED', 'OPERATOR_EMERGENCY_STOP', 'SYSTEM_SAFETY_POLICY');

-- CreateEnum
CREATE TYPE "ExecutionAuditEventType" AS ENUM ('ADMISSION_GRANTED', 'ADMISSION_REFUSED', 'BUDGET_RESERVED', 'BUDGET_CONSUMED', 'BUDGET_RELEASED', 'BUDGET_EXHAUSTED', 'STOP_REQUESTED', 'STOP_ACKNOWLEDGED', 'STOPPED', 'ESCALATED', 'EXECUTION_COMPLETED', 'SAFETY_VIOLATION');

-- CreateTable
CREATE TABLE "BudgetCounter" (
    "id" TEXT NOT NULL,
    "targetAuthorizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consumedRequests" INTEGER NOT NULL DEFAULT 0,
    "activeConcurrency" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionLease" (
    "id" TEXT NOT NULL,
    "targetAuthorizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT,
    "scanId" TEXT,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "holderToken" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "reclaimedAt" TIMESTAMP(3),

    CONSTRAINT "AdmissionLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetConsumption" (
    "id" TEXT NOT NULL,
    "targetAuthorizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KillSwitchState" (
    "id" TEXT NOT NULL,
    "scope" "SafetyScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "state" "StopLifecycleState" NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "reason" "KillSwitchReason" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "KillSwitchState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionAuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" "ExecutionAuditEventType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "targetAuthorizationId" TEXT,
    "scopeId" TEXT,
    "environmentAtEvent" TEXT,
    "scanId" TEXT,
    "executionId" TEXT,
    "executionClass" TEXT,
    "outcome" TEXT NOT NULL,
    "payload" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCounter_targetAuthorizationId_key" ON "BudgetCounter"("targetAuthorizationId");

-- CreateIndex
CREATE INDEX "BudgetCounter_userId_idx" ON "BudgetCounter"("userId");

-- CreateIndex
CREATE INDEX "AdmissionLease_targetAuthorizationId_idx" ON "AdmissionLease"("targetAuthorizationId");

-- CreateIndex
CREATE INDEX "AdmissionLease_expiresAt_idx" ON "AdmissionLease"("expiresAt");

-- CreateIndex
CREATE INDEX "AdmissionLease_executionId_idx" ON "AdmissionLease"("executionId");

-- CreateIndex
CREATE INDEX "AdmissionLease_scanId_idx" ON "AdmissionLease"("scanId");

-- CreateIndex
CREATE INDEX "AdmissionLease_targetId_idx" ON "AdmissionLease"("targetId");

-- CreateIndex
CREATE INDEX "AdmissionLease_userId_idx" ON "AdmissionLease"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionLease_targetAuthorizationId_idempotencyKey_key" ON "AdmissionLease"("targetAuthorizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BudgetConsumption_targetAuthorizationId_idx" ON "BudgetConsumption"("targetAuthorizationId");

-- CreateIndex
CREATE INDEX "BudgetConsumption_executionId_idx" ON "BudgetConsumption"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetConsumption_targetAuthorizationId_idempotencyKey_key" ON "BudgetConsumption"("targetAuthorizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "KillSwitchState_state_idx" ON "KillSwitchState"("state");

-- CreateIndex
CREATE UNIQUE INDEX "KillSwitchState_scope_scopeId_key" ON "KillSwitchState"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "ExecutionAuditEvent_targetAuthorizationId_timestamp_idx" ON "ExecutionAuditEvent"("targetAuthorizationId", "timestamp");

-- CreateIndex
CREATE INDEX "ExecutionAuditEvent_executionId_idx" ON "ExecutionAuditEvent"("executionId");

-- CreateIndex
CREATE INDEX "ExecutionAuditEvent_targetId_timestamp_idx" ON "ExecutionAuditEvent"("targetId", "timestamp");

-- CreateIndex
CREATE INDEX "ExecutionAuditEvent_actorId_timestamp_idx" ON "ExecutionAuditEvent"("actorId", "timestamp");


-- ---------------------------------------------------------------- constraints / indexes (hand-written)
ALTER TABLE "BudgetCounter"
  ADD CONSTRAINT "BudgetCounter_consumedRequests_nonneg" CHECK ("consumedRequests" >= 0),
  ADD CONSTRAINT "BudgetCounter_activeConcurrency_nonneg" CHECK ("activeConcurrency" >= 0);
CREATE INDEX "AdmissionLease_live_by_grant_idx" ON "AdmissionLease" ("targetAuthorizationId")
  WHERE "releasedAt" IS NULL AND "reclaimedAt" IS NULL;
ALTER TABLE "KillSwitchState"
  ADD CONSTRAINT "KillSwitchState_platform_id" CHECK (scope <> 'PLATFORM' OR "scopeId" = 'platform');

-- ---------------------------------------------------------------- structural invariants (triggers)
-- The kill-switch state machine is enforced by the database itself, not only by the functions: a direct
-- write (a compromised owner-level tool, a migration typo) cannot skip ACKNOWLEDGED or un-stop a row
-- except through the documented "new incident" reset (STOPPED -> REQUESTED, FR-015 / contract: replace).
CREATE FUNCTION public.f07_kill_switch_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.state = OLD.state
     OR (OLD.state = 'REQUESTED' AND NEW.state = 'ACKNOWLEDGED')
     OR (OLD.state = 'ACKNOWLEDGED' AND NEW.state = 'STOPPED')
     OR (OLD.state = 'STOPPED' AND NEW.state = 'REQUESTED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'f07_invalid_transition' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "KillSwitchState_guard" BEFORE UPDATE ON "KillSwitchState"
  FOR EACH ROW EXECUTE FUNCTION public.f07_kill_switch_guard();

-- Execution audit events are append-only: an event describes what committed and is never edited.
-- (DELETE is left to the future retention sweep, which follows the report-data retention policy.)
CREATE FUNCTION public.f07_audit_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'f07_audit_is_append_only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "ExecutionAuditEvent_append_only" BEFORE UPDATE ON "ExecutionAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION public.f07_audit_immutable();

-- ---------------------------------------------------------------- ownership and baseline privileges
ALTER TABLE "BudgetCounter" OWNER TO fahes_owner;
ALTER TABLE "AdmissionLease" OWNER TO fahes_owner;
ALTER TABLE "BudgetConsumption" OWNER TO fahes_owner;
ALTER TABLE "KillSwitchState" OWNER TO fahes_owner;
ALTER TABLE "ExecutionAuditEvent" OWNER TO fahes_owner;
REVOKE ALL ON "BudgetCounter","AdmissionLease","BudgetConsumption","KillSwitchState","ExecutionAuditEvent" FROM PUBLIC;
-- Read-only reconstruction (tenant scoping is applied in the query, T029).
GRANT SELECT ON "ExecutionAuditEvent" TO fahes_api;
-- The definer functions read these existing tables (read only; no write privilege on any of them).
GRANT SELECT ON "Target","TargetAuthorization","User","Scan" TO fahes_owner;

-- ---------------------------------------------------------------- internal helpers
CREATE FUNCTION public.f07_lock_scope(p_scope "SafetyScope", p_scope_id text, p_shared boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_key bigint := hashtextextended('f07:stop:' || p_scope::text || ':' || p_scope_id, 0);
BEGIN
  IF p_shared THEN PERFORM pg_advisory_xact_lock_shared(v_key);
  ELSE PERFORM pg_advisory_xact_lock(v_key);
  END IF;
END $$;

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

-- Audit helper for stop-lifecycle events: the scope's own id is recorded in the matching context column,
-- so a tenant-scoped reconstruction can find the event through its grant/scan/target/execution.
CREATE FUNCTION public.f07_audit_scope(
  p_type "ExecutionAuditEventType", p_actor text, p_scope "SafetyScope", p_scope_id text, p_execution_id text, p_outcome text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.f07_audit(p_type, p_actor,
    CASE WHEN p_scope = 'TARGET' THEN p_scope_id END,
    CASE WHEN p_scope = 'GRANT' THEN p_scope_id END,
    CASE WHEN p_scope = 'SCAN' THEN p_scope_id END,
    CASE WHEN p_scope = 'EXECUTION' THEN p_scope_id ELSE p_execution_id END,
    p_outcome, jsonb_build_object('scope', p_scope, 'scopeId', p_scope_id));
$$;

-- "Live" = holds a slot and has not expired by the database clock. An expired lease is reclaimable and
-- can no longer be renewed, so after a stop is recorded the live set only shrinks (F-02 §7, DEC-063).
CREATE FUNCTION public.f07_scope_has_live_execution(p_scope "SafetyScope", p_scope_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "AdmissionLease" l
    WHERE l."releasedAt" IS NULL AND l."reclaimedAt" IS NULL AND l."expiresAt" > clock_timestamp()
      AND CASE p_scope
        WHEN 'EXECUTION' THEN l."executionId" = p_scope_id
        WHEN 'SCAN'      THEN l."scanId" = p_scope_id
        WHEN 'GRANT'     THEN l."targetAuthorizationId" = p_scope_id
        WHEN 'TARGET'    THEN l."targetId" = p_scope_id
        WHEN 'TENANT'    THEN l."userId" = p_scope_id
        ELSE true END
  );
$$;

-- ---------------------------------------------------------------- kill-switch reads
-- First pending stop (or a STOPPED row for this exact execution, FR-015) over the six scope keys.
CREATE FUNCTION public.f07_stop_pending(
  p_execution_id text, p_scan_id text, p_grant_id text, p_target_id text, p_user_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('scope', k.scope, 'scopeId', k."scopeId", 'state', k.state, 'requestedAt', k."requestedAt")
  FROM "KillSwitchState" k
  WHERE ((k.scope = 'EXECUTION' AND k."scopeId" = p_execution_id)
      OR (k.scope = 'SCAN' AND p_scan_id IS NOT NULL AND k."scopeId" = p_scan_id)
      OR (k.scope = 'GRANT' AND k."scopeId" = p_grant_id)
      OR (k.scope = 'TARGET' AND k."scopeId" = p_target_id)
      OR (k.scope = 'TENANT' AND k."scopeId" = p_user_id)
      OR (k.scope = 'PLATFORM' AND k."scopeId" = 'platform'))
    AND (k.state IN ('REQUESTED','ACKNOWLEDGED') OR (k.scope = 'EXECUTION' AND k.state = 'STOPPED'))
  ORDER BY k.scope LIMIT 1;
$$;

-- ---------------------------------------------------------------- admission (US1)
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

-- Advisory counter read for F01's BUDGET_EXHAUSTED verdict (tenant-checked, never locks).
CREATE FUNCTION public.f07_budget_snapshot(p_target_id text, p_user_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('grantId', c."targetAuthorizationId",
           'consumedRequests', c."consumedRequests", 'activeConcurrency', c."activeConcurrency")), '[]'::jsonb)
  FROM "BudgetCounter" c
  JOIN "TargetAuthorization" a ON a.id = c."targetAuthorizationId"
  JOIN "Target" t ON t.id = a."targetId"
  WHERE a."targetId" = p_target_id AND t."userId" = p_user_id AND a."userId" = p_user_id;
$$;

-- Renewal: token-fenced, refuses once any covering stop is pending/stopped, never revives an expired lease.
CREATE FUNCTION public.f07_renew_lease(p_lease_id text, p_holder_token text)
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

-- Release by the holder. Idempotent; a wrong token or an already-closed lease changes nothing.
CREATE FUNCTION public.f07_release_lease_by_token(p_lease_id text, p_holder_token text, p_completed boolean DEFAULT false)
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

-- Release by authority (finalizer / sweep): token-free, unit-keyed, idempotent, counter-correcting.
CREATE FUNCTION public.f07_release_leases_by_execution(p_execution_id text)
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

-- Reclaim sweep (DEC-063): expired, never-released leases only; skips contended grants; recomputes the cache.
CREATE FUNCTION public.f07_reclaim_expired_leases(p_limit integer DEFAULT 100)
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

-- ---------------------------------------------------------------- kill switch (US2)
CREATE FUNCTION public.f07_trigger_stop(p_scope "SafetyScope", p_scope_id text, p_triggered_by text, p_reason "KillSwitchReason")
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_op boolean := false; v_ok boolean := false; k "KillSwitchState"%ROWTYPE;
BEGIN
  IF coalesce(p_scope_id,'') = '' OR coalesce(p_triggered_by,'') = '' OR (p_scope = 'PLATFORM' AND p_scope_id <> 'platform') THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;
  IF p_triggered_by = 'SYSTEM' THEN
    v_ok := p_scope IN ('GRANT','EXECUTION') AND p_reason IN ('AUTHORIZATION_REVOKED','ENVIRONMENT_RECLASSIFIED','SYSTEM_SAFETY_POLICY');
  ELSE
    SELECT coalesce("isOperator", false) INTO v_op FROM "User" WHERE id = p_triggered_by;
    IF coalesce(v_op, false) THEN v_ok := true;
    ELSIF p_reason = 'USER_CANCELLATION' THEN
      IF p_scope = 'SCAN' THEN
        v_ok := EXISTS (SELECT 1 FROM "Scan" WHERE id = p_scope_id AND "userId" = p_triggered_by);
      ELSIF p_scope = 'EXECUTION' THEN
        v_ok := EXISTS (SELECT 1 FROM "AdmissionLease" WHERE "executionId" = p_scope_id AND "userId" = p_triggered_by)
                AND NOT EXISTS (SELECT 1 FROM "AdmissionLease" WHERE "executionId" = p_scope_id AND "userId" <> p_triggered_by);
      END IF;
    END IF;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'f07_forbidden' USING ERRCODE = '42501'; END IF;

  PERFORM public.f07_lock_scope(p_scope, p_scope_id, false);                                               -- 1
  SELECT * INTO k FROM "KillSwitchState" WHERE scope = p_scope AND "scopeId" = p_scope_id FOR UPDATE;       -- 4
  IF FOUND AND k.state IN ('REQUESTED','ACKNOWLEDGED') THEN
    RETURN jsonb_build_object('created', false, 'state', k.state, 'scope', p_scope, 'scopeId', p_scope_id);
  END IF;
  INSERT INTO "KillSwitchState" (id, scope, "scopeId", state, "triggeredBy", reason, "requestedAt")
  VALUES (gen_random_uuid()::text, p_scope, p_scope_id, 'REQUESTED', p_triggered_by, p_reason, clock_timestamp())
  ON CONFLICT (scope, "scopeId") DO UPDATE
    SET state = 'REQUESTED', "triggeredBy" = EXCLUDED."triggeredBy", reason = EXCLUDED.reason, "requestedAt" = clock_timestamp(),
        "acknowledgedAt" = NULL, "stoppedAt" = NULL, "escalatedAt" = NULL;
  PERFORM public.f07_audit_scope('STOP_REQUESTED', p_triggered_by, p_scope, p_scope_id, NULL, p_reason::text);
  RETURN jsonb_build_object('created', true, 'state', 'REQUESTED', 'scope', p_scope, 'scopeId', p_scope_id);
END $$;

CREATE FUNCTION public.f07_ack_stop(p_execution_id text, p_scope "SafetyScope", p_scope_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE k "KillSwitchState"%ROWTYPE;
BEGIN
  IF coalesce(p_scope_id,'') = '' THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  PERFORM public.f07_lock_scope(p_scope, p_scope_id, false);
  SELECT * INTO k FROM "KillSwitchState" WHERE scope = p_scope AND "scopeId" = p_scope_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('changed', false, 'state', NULL); END IF;
  IF k.state <> 'REQUESTED' THEN RETURN jsonb_build_object('changed', false, 'state', k.state); END IF;
  UPDATE "KillSwitchState" SET state = 'ACKNOWLEDGED', "acknowledgedAt" = clock_timestamp() WHERE id = k.id;
  PERFORM public.f07_audit_scope('STOP_ACKNOWLEDGED', coalesce(p_execution_id, 'SYSTEM'), p_scope, p_scope_id, p_execution_id, 'ACKNOWLEDGED');
  RETURN jsonb_build_object('changed', true, 'state', 'ACKNOWLEDGED');
END $$;

-- DEC-048 (a): the finalizer acknowledges the unit's own stop, by authority, inside its transaction.
CREATE FUNCTION public.f07_ack_stop_by_authority(p_execution_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE r jsonb;
BEGIN
  IF coalesce(p_execution_id,'') = '' THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  r := public.f07_ack_stop(p_execution_id, 'EXECUTION', p_execution_id);
  RETURN (r->>'changed')::boolean;
END $$;

-- DEC-049 (a): STOPPED only from ACKNOWLEDGED and only after verifying no live lease in scope.
CREATE FUNCTION public.f07_record_stopped(p_execution_id text, p_scope "SafetyScope", p_scope_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE k "KillSwitchState"%ROWTYPE;
BEGIN
  IF coalesce(p_scope_id,'') = '' THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  PERFORM public.f07_lock_scope(p_scope, p_scope_id, false);                                               -- 1
  SELECT * INTO k FROM "KillSwitchState" WHERE scope = p_scope AND "scopeId" = p_scope_id FOR UPDATE;       -- 4
  IF NOT FOUND THEN RETURN jsonb_build_object('changed', false, 'reason', 'NOT_FOUND'); END IF;
  IF k.state = 'STOPPED' THEN RETURN jsonb_build_object('changed', false, 'state', 'STOPPED'); END IF;
  IF k.state <> 'ACKNOWLEDGED' THEN RETURN jsonb_build_object('changed', false, 'reason', 'NOT_ACKNOWLEDGED'); END IF;
  IF public.f07_scope_has_live_execution(p_scope, p_scope_id) THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'LIVE_LEASE');
  END IF;
  UPDATE "KillSwitchState" SET state = 'STOPPED', "stoppedAt" = clock_timestamp() WHERE id = k.id;
  PERFORM public.f07_audit_scope('STOPPED', coalesce(p_execution_id, 'SYSTEM'), p_scope, p_scope_id, p_execution_id, 'STOPPED');
  RETURN jsonb_build_object('changed', true, 'state', 'STOPPED');
END $$;

CREATE FUNCTION public.f07_mark_escalated(p_execution_id text, p_scope "SafetyScope", p_scope_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_n int;
BEGIN
  IF coalesce(p_scope_id,'') = '' THEN RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023'; END IF;
  PERFORM public.f07_lock_scope(p_scope, p_scope_id, false);
  UPDATE "KillSwitchState" SET "escalatedAt" = clock_timestamp()
   WHERE scope = p_scope AND "scopeId" = p_scope_id AND "escalatedAt" IS NULL AND state <> 'STOPPED';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN false; END IF;
  PERFORM public.f07_audit_scope('ESCALATED', coalesce(p_execution_id, 'SYSTEM'), p_scope, p_scope_id, p_execution_id, 'ESCALATED');
  RETURN true;
END $$;

-- DEC-048 (b)/DEC-049: reconciler. Two passes, never a timeout-only transition; never waits on a lock.
CREATE FUNCTION public.f07_reconcile_stranded_stops(p_limit integer DEFAULT 50, p_ack_grace_seconds integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET lock_timeout = '3s' AS $$
DECLARE v_now timestamptz := clock_timestamp(); r record; v_ack int := 0; v_stopped int := 0; v_skipped int := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 OR p_ack_grace_seconds IS NULL OR p_ack_grace_seconds < 0 THEN
    RAISE EXCEPTION 'f07_invalid_argument' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT id, scope, "scopeId", state, "requestedAt" FROM "KillSwitchState"
           WHERE state IN ('REQUESTED','ACKNOWLEDGED') ORDER BY "requestedAt", id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('f07:stop:' || r.scope::text || ':' || r."scopeId", 0)) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    IF public.f07_scope_has_live_execution(r.scope, r."scopeId") THEN CONTINUE; END IF;
    IF r.state = 'REQUESTED' THEN
      IF v_now - r."requestedAt" >= make_interval(secs => p_ack_grace_seconds) THEN
        UPDATE "KillSwitchState" SET state = 'ACKNOWLEDGED', "acknowledgedAt" = clock_timestamp() WHERE id = r.id;
        PERFORM public.f07_audit_scope('STOP_ACKNOWLEDGED', 'SYSTEM', r.scope, r."scopeId", NULL, 'RECONCILED');
        v_ack := v_ack + 1;
      END IF;
    ELSE
      UPDATE "KillSwitchState" SET state = 'STOPPED', "stoppedAt" = clock_timestamp() WHERE id = r.id;
      PERFORM public.f07_audit_scope('STOPPED', 'SYSTEM', r.scope, r."scopeId", NULL, 'RECONCILED');
      v_stopped := v_stopped + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('acknowledged', v_ack, 'stopped', v_stopped, 'skippedLocked', v_skipped);
END $$;

-- ---------------------------------------------------------------- audit write for TypeScript callers (redacted there)
CREATE FUNCTION public.f07_record_audit_ts(
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

-- ---------------------------------------------------------------- function ownership and execution grants
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'f07\_%' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO fahes_owner', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END $$;

-- api: tenant-facing TypeScript layer (admission, trigger, audit, reads)
GRANT EXECUTE ON FUNCTION public.f07_admit(text,text,text,text,text,boolean,boolean),
  public.f07_renew_lease(text,text), public.f07_release_lease_by_token(text,text,boolean),
  public.f07_trigger_stop("SafetyScope",text,text,"KillSwitchReason"),
  public.f07_stop_pending(text,text,text,text,text), public.f07_budget_snapshot(text,text),
  public.f07_record_audit_ts("ExecutionAuditEventType",text,text,text,text,text,text,text,text,text,jsonb)
  TO fahes_api;
-- worker_exec: only token-bound or read-only operations. Admission (caller-supplied ids) waits for the
-- SPEC 009 claim-bound wrappers (AR-19); a compromised worker cannot charge another tenant's budget.
GRANT EXECUTE ON FUNCTION public.f07_renew_lease(text,text), public.f07_release_lease_by_token(text,text,boolean),
  public.f07_stop_pending(text,text,text,text,text),
  public.f07_ack_stop(text,"SafetyScope",text), public.f07_record_stopped(text,"SafetyScope",text),
  public.f07_mark_escalated(text,"SafetyScope",text)
  TO fahes_worker_exec;
-- orchestrator: finalizer, sweep and reconciler authority
GRANT EXECUTE ON FUNCTION public.f07_release_leases_by_execution(text), public.f07_ack_stop_by_authority(text),
  public.f07_reclaim_expired_leases(integer), public.f07_reconcile_stranded_stops(integer,integer),
  public.f07_trigger_stop("SafetyScope",text,text,"KillSwitchReason"),
  public.f07_stop_pending(text,text,text,text,text), public.f07_record_stopped(text,"SafetyScope",text),
  public.f07_ack_stop(text,"SafetyScope",text),
  public.f07_record_audit_ts("ExecutionAuditEventType",text,text,text,text,text,text,text,text,text,jsonb)
  TO fahes_orchestrator;
GRANT EXECUTE ON FUNCTION public.f07_trigger_stop("SafetyScope",text,text,"KillSwitchReason"),
  public.f07_stop_pending(text,text,text,text,text) TO fahes_operator;

REVOKE CREATE ON SCHEMA public FROM fahes_owner;
