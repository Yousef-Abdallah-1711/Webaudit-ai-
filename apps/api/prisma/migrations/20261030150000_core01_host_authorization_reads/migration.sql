-- The trusted host parent runs the unchanged F01 authorization decision before
-- F07's locked admission. Grant only ownership keys plus the live grant/scope
-- and environment fields that decision reads; no broad Target or Scan access.
GRANT SELECT ("id", "userId") ON "Target" TO fahes_exec_host;
GRANT SELECT ("targetId", "classification") ON "TargetEnvironment" TO fahes_exec_host;
GRANT SELECT ON "TargetAuthorization", "ScopeDefinition" TO fahes_exec_host;
