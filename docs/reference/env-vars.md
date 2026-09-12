# Environment Variables

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

Configuration keys the project reads, whether each is required, and where it is used.

| Key | Required | Default | Used in |
| --- | --- | --- | --- |
| `AI_CHAIN` | no | `anthropic,openai` | — |
| `AI_MODE` | no | `"live"` | — |
| `AI_PROVIDER_CHAIN` | no | `"anthropic,openai,google"` | — |
| `ALLOW_INSECURE_DEV_SECRETS` | no | `""` | — |
| `ANTHROPIC_API_KEY` | no | `""` | — |
| `ANTHROPIC_FREE_TIER` | no | `false` | — |
| `ANTHROPIC_INPUT_USD_PER_MTOK` | no | `5.00` | — |
| `ANTHROPIC_MODEL` | no | `claude-opus-5` | — |
| `ANTHROPIC_OUTPUT_USD_PER_MTOK` | no | `25.00` | — |
| `API_URL` | no | `"http://localhost:3001"` | — |
| `BILLING_BUSINESS_PRICE_MICROS` | yes | — | — |
| `BILLING_CREDIT_PRICE_MICROS` | yes | — | — |
| `BILLING_PRO_PRICE_MICROS` | yes | — | — |
| `BILLING_STARTER_PRICE_MICROS` | yes | — | — |
| `DATABASE_CONNECTION_LIMIT` | no | `"10"` | — |
| `DATABASE_POOL_TIMEOUT` | no | `"20"` | — |
| `DATABASE_URL` | no | `"postgresql://webaudit:webaudit_dev@localhost:5442/webaudit?schema=public"` | — |
| `EMAIL_FROM` | no | `"noreply@webaudit.ai"` | — |
| `ENCRYPTION_KEY` | no | `""` | — |
| `GITHUB_OAUTH_CLIENT_ID` | no | `""` | — |
| `GITHUB_OAUTH_CLIENT_SECRET` | no | `""` | — |
| `GOOGLE_API_KEY` | no | `""` | — |
| `GOOGLE_FREE_TIER` | no | `false` | — |
| `GOOGLE_INPUT_USD_PER_MTOK` | yes | — | — |
| `GOOGLE_MODEL` | no | `gemini-2.5-flash` | — |
| `GOOGLE_OAUTH_CLIENT_ID` | no | `""` | — |
| `GOOGLE_OAUTH_CLIENT_SECRET` | no | `""` | — |
| `GOOGLE_OUTPUT_USD_PER_MTOK` | yes | — | — |
| `JWT_ACCESS_SECRET` | no | `""` | — |
| `JWT_REFRESH_SECRET` | no | `""` | — |
| `MAX_ARCHIVE_BYTES` | no | `"52428800"        # 50 MB (FR-015)` | — |
| `MAX_ARCHIVE_RATIO` | no | `"100"             # decompression-bomb guard` | — |
| `OPENAI_API_KEY` | no | `""` | — |
| `OPENAI_FREE_TIER` | no | `false` | — |
| `OPENAI_INPUT_USD_PER_MTOK` | yes | — | — |
| `OPENAI_MODEL` | yes | — | — |
| `OPENAI_OUTPUT_USD_PER_MTOK` | yes | — | — |
| `PROBE_POOL_URL` | no | `"http://localhost:3002"` | — |
| `QUESTIONNAIRE_TIMEOUT_MS` | no | `"600000"   # 10 min (FR-041)` | — |
| `R2_ACCESS_KEY_ID` | no | `""` | — |
| `R2_ACCOUNT_ID` | no | `""` | — |
| `R2_BUCKET` | no | `"webaudit-reports"` | — |
| `R2_SECRET_ACCESS_KEY` | no | `""` | — |
| `REDIS_URL` | no | `"redis://localhost:6389"` | — |
| `RESEND_API_KEY` | no | `""` | — |
| `SAFE_NET_ALLOW_TARGETS` | no | `""` | — |
| `SANDBOX_MEMORY_MB` | no | `"256"             # FR-028` | — |
| `SANDBOX_RUNNER_URL` | no | `"http://localhost:3003"` | — |
| `SANDBOX_WALLCLOCK_MS` | no | `"30000"        # FR-028` | — |
| `SCAN_TIMEOUT_MS` | no | `"900000"            # 15 min (FR-038)` | — |
| `WEB_URL` | no | `"http://localhost:3000"` | — |
| `WORKSPACE_BASE_DIR` | no | `"./.workspaces"` | — |
