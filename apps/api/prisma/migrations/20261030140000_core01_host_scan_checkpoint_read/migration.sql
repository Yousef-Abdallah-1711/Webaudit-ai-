-- The host pre-run/deadline procedure reads only Scan identity and lifecycle timing.
-- Keep the host's scan access column-scoped; never grant it the report, billing, or tenant payload.
GRANT SELECT ("id", "state", "startedAt") ON "Scan" TO fahes_exec_host;
