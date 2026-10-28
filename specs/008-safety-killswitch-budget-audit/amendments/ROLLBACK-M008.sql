-- Rollback for migration 20261028120000_add_safety_foundation (SPEC 008).
-- Removes exactly the objects that migration created, in reverse dependency order.
-- Leaves the five NOLOGIN roles in place (cluster-level, shared by every database) and touches no
-- pre-existing table or row. Back up before running anywhere non-ephemeral: the five tables and all
-- safety state (budget counters, leases, kill-switch rows, execution audit events) are dropped.
-- After running, delete the migration's row from "_prisma_migrations" so `migrate deploy` can re-apply it.

BEGIN;

DROP TABLE IF EXISTS "ExecutionAuditEvent", "KillSwitchState", "BudgetConsumption", "AdmissionLease", "BudgetCounter";

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'f07\_%' LOOP
    EXECUTE format('DROP FUNCTION %s', f.sig);
  END LOOP;
END $$;

DROP TYPE IF EXISTS "ExecutionAuditEventType", "KillSwitchReason", "StopLifecycleState", "SafetyScope";

-- Privileges the migration granted on pre-existing tables to fahes_owner (read-only).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_owner') THEN
    REVOKE SELECT ON "Target", "TargetAuthorization", "User", "Scan" FROM fahes_owner;
  END IF;
END $$;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261028120000_add_safety_foundation';

COMMIT;
