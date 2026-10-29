-- Raw SQL is required because Prisma cannot describe PostgreSQL column-level GRANTs.
-- The least-privilege API role needs these ownership fields for resolvePlan to derive the
-- tenant and destination from the persisted Scan and Target, never from request input.
-- Do not expose scan billing/report columns or unrelated target metadata through this path.
GRANT SELECT ("id", "userId", "targetId") ON "Scan" TO fahes_api;
GRANT SELECT ("id", "userId", "canonicalValue") ON "Target" TO fahes_api;
