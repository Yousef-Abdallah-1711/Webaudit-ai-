-- SPEC 009 privilege correction: the initial CORE-01 migration granted the
-- finalizer to the API and generic worker roles. Terminal writes belong only
-- to the dedicated execution host and orchestrator.
REVOKE ALL ON FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb)
  FROM PUBLIC, fahes_api, fahes_worker_exec;
GRANT EXECUTE ON FUNCTION public.fahes_finalize_unit(text, text, text, "FailureClass", text, jsonb)
  TO fahes_exec_host, fahes_orchestrator;
