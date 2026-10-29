-- Raw SQL is required because Prisma's schema language cannot represent PostgreSQL function ACLs.
-- The same-plan trigger is SECURITY DEFINER so it can validate dependencies with fahes_owner's
-- table access. Trigger invocation does not require PUBLIC to have EXECUTE; remove the default
-- function ACL and keep the helper limited to the trusted trigger path.
REVOKE ALL ON FUNCTION public.fahes_dependency_same_plan() FROM PUBLIC;
