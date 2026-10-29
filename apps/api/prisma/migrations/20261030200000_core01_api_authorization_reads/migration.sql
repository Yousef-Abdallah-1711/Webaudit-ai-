-- Raw SQL is required because Prisma cannot describe PostgreSQL table/column-level GRANTs.
-- Plan resolution runs the real F01 check before a non-passive plan is persisted.
-- The API needs the grant/scope record and current environment classification;
-- generic workers do not receive these reads or admission authority.
GRANT SELECT ON "TargetAuthorization", "ScopeDefinition" TO fahes_api;
GRANT SELECT ("id", "targetId", "classification") ON "TargetEnvironment" TO fahes_api;
