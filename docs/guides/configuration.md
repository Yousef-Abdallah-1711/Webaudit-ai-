# Configuration

Configuration names and safe example guidance live in `.env.example`. Runtime validation is owned by `apps/api/src/config/env.ts`, `apps/api/src/config/sandbox.ts`, and `packages/ai-executor/src/from-env.ts`.

Configure database/Redis, authentication/encryption, object storage, OAuth/email, workspace and installed-capability roots, sandbox dispatch, and the AI provider chain through environment variables. Pricing, model limits, and provider configuration fail closed at boot. Never add real values or credentials to documentation.
