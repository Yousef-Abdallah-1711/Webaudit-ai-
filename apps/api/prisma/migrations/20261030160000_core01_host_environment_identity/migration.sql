-- Prisma's relation result needs the TargetEnvironment primary key while
-- materializing its selected classification field. Keep the permission narrow.
GRANT SELECT ("id") ON "TargetEnvironment" TO fahes_exec_host;
