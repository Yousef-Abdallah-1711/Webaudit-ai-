# Operator Console

## Overview

Administrators manage users, plans, billing visibility, capabilities, providers, queue actions, scans, audit logs, and settings through a protected console.

## Source and flow

API mount: `apps/api/src/routes/admin/index.ts`; route and service modules are in `apps/api/src/routes/admin/` and `apps/api/src/services/admin/`. UI is `apps/web/app/(admin)/admin/` with `apps/web/components/admin/`. Data includes `AuditLogEntry`, `ProviderChainEntry`, user, plan, capability, and scan records.

## Constraints and verification

Every privileged action is authorized server-side and audited. Admin API/adverse tests and `apps/web/tests/e2e/admin/` cover access, provider, plan, queue, capability, and user paths.
