\set ON_ERROR_STOP on
\getenv api_password API_DB_PASSWORD
\getenv worker_password WORKER_DB_PASSWORD
\getenv orchestrator_password ORCHESTRATOR_DB_PASSWORD

DO $rolecheck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_api') THEN
    RAISE EXCEPTION 'required group role fahes_api is missing; run migrations first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_worker_exec') THEN
    RAISE EXCEPTION 'required group role fahes_worker_exec is missing; run migrations first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_orchestrator') THEN
    RAISE EXCEPTION 'required group role fahes_orchestrator is missing; run migrations first';
  END IF;
END
$rolecheck$;

SELECT format(
  'CREATE ROLE webaudit_api_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'api_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webaudit_api_runtime')
\gexec

SELECT format(
  'CREATE ROLE webaudit_worker_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'worker_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webaudit_worker_runtime')
\gexec

SELECT format(
  'CREATE ROLE webaudit_orchestrator_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'orchestrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webaudit_orchestrator_runtime')
\gexec

ALTER ROLE webaudit_orchestrator_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'orchestrator_password';
ALTER ROLE webaudit_api_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';
ALTER ROLE webaudit_worker_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_password';

-- Reconciliation also strips stale grants if these login names existed before
-- this provisioner was introduced. Intended permissions come only from the
-- fahes_* group roles below; inherited group grants are unaffected.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime, webaudit_orchestrator_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime, webaudit_orchestrator_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime, webaudit_orchestrator_runtime;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime, webaudit_orchestrator_runtime;

SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname = 'webaudit_api_runtime' AND parent.rolname <> 'fahes_api'
\gexec

SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname = 'webaudit_worker_runtime' AND parent.rolname <> 'fahes_worker_exec'
\gexec

GRANT fahes_api TO webaudit_api_runtime;
GRANT fahes_worker_exec TO webaudit_worker_runtime;

SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname = 'webaudit_orchestrator_runtime' AND parent.rolname <> 'fahes_orchestrator'
\gexec

-- G-4 (DEC-076): a DEDICATED orchestrator identity. The worker process runs the scan phases, the sweeps and the plan-unit
-- barrier, so it is the orchestrator: it holds fahes_orchestrator (finalizer, passive completion, reclaim) and NOT
-- fahes_worker_exec / fahes_exec_host. The execution-host identity stays separate for the future engine hosts.
GRANT fahes_orchestrator TO webaudit_orchestrator_runtime;

-- Legacy application tables (every table NOT owned by fahes_owner) get ordinary DML for the API and the orchestrator.
-- SPEC 008/009 tables are owned by fahes_owner and stay reachable only through their SECURITY DEFINER functions and the
-- narrow grants of their own migrations. Table-level (not column-level) DML on the legacy tables is a recorded limitation.
DO $legacy$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname, c.relkind FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles o ON o.oid = c.relowner
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S') AND o.rolname <> 'fahes_owner'
      AND c.relname <> '_prisma_migrations'
  LOOP
    IF t.relkind = 'S' THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO fahes_api, fahes_orchestrator', t.relname);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO fahes_api, fahes_orchestrator', t.relname);
    END IF;
  END LOOP;
END
$legacy$;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_database
    WHERE datdba IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime', 'webaudit_orchestrator_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname = 'public'
      AND nspowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime', 'webaudit_orchestrator_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime', 'webaudit_orchestrator_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime', 'webaudit_orchestrator_runtime'))
  ) THEN
    RAISE EXCEPTION 'runtime login owns database objects; transfer ownership before provisioning';
  END IF;
  IF NOT pg_has_role('webaudit_api_runtime', 'fahes_api', 'MEMBER')
     OR NOT pg_has_role('webaudit_worker_runtime', 'fahes_worker_exec', 'MEMBER')
     OR NOT pg_has_role('webaudit_orchestrator_runtime', 'fahes_orchestrator', 'MEMBER')
     OR pg_has_role('webaudit_orchestrator_runtime', 'fahes_worker_exec', 'MEMBER')
     OR pg_has_role('webaudit_orchestrator_runtime', 'fahes_exec_host', 'MEMBER')
     OR pg_has_role('webaudit_worker_runtime', 'fahes_orchestrator', 'MEMBER') THEN
    RAISE EXCEPTION 'runtime role membership provisioning failed';
  END IF;
  IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      FROM pg_roles WHERE rolname = 'webaudit_api_runtime')
     OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
         FROM pg_roles WHERE rolname = 'webaudit_worker_runtime')
     OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
         FROM pg_roles WHERE rolname = 'webaudit_orchestrator_runtime') THEN
    RAISE EXCEPTION 'runtime login unexpectedly has an elevated cluster privilege';
  END IF;
END
$verify$;
