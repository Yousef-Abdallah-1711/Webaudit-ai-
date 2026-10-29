\set ON_ERROR_STOP on
\getenv api_password API_DB_PASSWORD
\getenv worker_password WORKER_DB_PASSWORD

DO $rolecheck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_api') THEN
    RAISE EXCEPTION 'required group role fahes_api is missing; run migrations first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fahes_worker_exec') THEN
    RAISE EXCEPTION 'required group role fahes_worker_exec is missing; run migrations first';
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

ALTER ROLE webaudit_api_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';
ALTER ROLE webaudit_worker_runtime WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_password';

-- Reconciliation also strips stale grants if these login names existed before
-- this provisioner was introduced. Intended permissions come only from the
-- fahes_* group roles below; inherited group grants are unaffected.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM webaudit_api_runtime, webaudit_worker_runtime;

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

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_database
    WHERE datdba IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname = 'public'
      AND nspowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime'))
  ) OR EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('webaudit_api_runtime', 'webaudit_worker_runtime'))
  ) THEN
    RAISE EXCEPTION 'runtime login owns database objects; transfer ownership before provisioning';
  END IF;
  IF NOT pg_has_role('webaudit_api_runtime', 'fahes_api', 'MEMBER')
     OR NOT pg_has_role('webaudit_worker_runtime', 'fahes_worker_exec', 'MEMBER') THEN
    RAISE EXCEPTION 'runtime role membership provisioning failed';
  END IF;
  IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      FROM pg_roles WHERE rolname = 'webaudit_api_runtime')
     OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
         FROM pg_roles WHERE rolname = 'webaudit_worker_runtime') THEN
    RAISE EXCEPTION 'runtime login unexpectedly has an elevated cluster privilege';
  END IF;
END
$verify$;
