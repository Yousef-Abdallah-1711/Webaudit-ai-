-- The trusted host parent runs F01's live decision before f07_admit and records
-- refusal audit events through the existing F07 interfaces. Keep these grants
-- on the execution-host role; do not widen the generic worker role.
GRANT EXECUTE ON FUNCTION public.f07_budget_snapshot(text, text) TO fahes_exec_host;
GRANT EXECUTE ON FUNCTION public.f07_record_audit_ts(
  "ExecutionAuditEventType", text, text, text, text, text, text, text, text, text, jsonb
) TO fahes_exec_host;
