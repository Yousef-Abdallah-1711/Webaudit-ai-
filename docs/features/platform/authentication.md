# Authentication, Sessions, and OAuth

## Overview

Customers register, verify email, sign in, refresh/logout, reset credentials, and connect OAuth identities. Operator authorization is enforced server-side, never by the UI.

## Source and flow

Routes: `apps/api/src/routes/auth.routes.ts` and `oauth.routes.ts`; services: `apps/api/src/services/auth/`; middleware: `apps/api/src/middleware/auth.middleware.ts`; UI: `apps/web/app/(auth)/` and `apps/web/components/auth/`. Requests validate credentials/tokens, persist `User`, `OAuthIdentity`, `EmailToken`, and `RefreshToken` records, then establish/rotate the session.

## Boundaries and verification

Protected routes require authentication; OAuth callbacks validate provider flow before identity linkage. Tests are under `apps/api/tests/` for auth/session/OAuth/reset and `apps/web/tests/e2e/auth/`.

## Related

[Security boundaries](../../guides/security-boundaries.md) · [Endpoint reference](../../reference/endpoints.md)
