-- Rollback of 20261030000000_add_core_scan_execution_platform (SPEC 009 CORE-01).
-- Removes only objects that migration created; touches no pre-existing table. DESTRUCTIVE to the new tables' data:
-- run only on a database where those rows may be discarded (disposable/staging), never as part of a deploy.
BEGIN;
DROP FUNCTION IF EXISTS public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb);
DROP TABLE IF EXISTS "IssueEvidenceLink", "Evidence", "Artifact", "ExecutionDependency", "ExecutionUnit",
  "ScanPlan", "ScanProfileVersion", "ScanProfile", "ExecutionUnitHostClaim", "EffectAuthorization" CASCADE;
DROP FUNCTION IF EXISTS public.fahes_unit_guard(), public.fahes_immutable_row(), public.fahes_dependency_same_plan(),
  public.fahes_effect_guard();
DROP TYPE IF EXISTS "EffectAuthorizationState", "ScanPlanState", "ScanPlanKind", "EvidenceKind", "FailureClass",
  "ExecutionUnitStatus", "ExecutionUnitClass";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261030000000_add_core_scan_execution_platform';
COMMIT;
