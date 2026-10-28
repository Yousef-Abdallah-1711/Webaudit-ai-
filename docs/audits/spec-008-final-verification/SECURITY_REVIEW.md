# Security review (SPEC 008 attack surface)

Only attack surfaces that actually exist in SPEC 008 were tested (a database/library foundation with no HTTP route). Test targets were local/isolated only.

| Threat | Test | Result |
|---|---|---|
| **Cross-tenant budget charge** (caller supplies another tenant's grant) | `f07_admit` called directly with tenant A's target and tenant B's grant | `NO_MATCHING_GRANT`; no counter row created for B; refusal audited |
| **Cross-tenant identifier abuse — scan** (lease tagged with another tenant's `scanId` to block their reconciler) | admission with B's scan id | refused; B's scan stop still reaches STOPPED |
| **Cross-tenant identifier abuse — execution id** (shared id lets one tenant stop another) | admission re-using B's execution id; planted foreign lease then user-stop | refused / `SafetyForbiddenError`; no stop row |
| **Authority escalation on `triggerStop`** | ordinary user: TARGET/TENANT/PLATFORM; SYSTEM with TENANT scope or operator reason; user with `AUTHORIZATION_REVOKED` reason; forged operator flag (flag re-read from `User.isOperator`) | all refused; one uniform error whether the target exists or not (no existence oracle) |
| **Replay / lease theft** | renew/release with a guessed or stale `holderToken`; renew after reclaim; renew after expiry | `FENCED`; no state change; stale holder told to stop |
| **Lease outliving authorization** | renew after grant expiry/revocation | `GRANT_INVALID` (D-A fixed) |
| **Resurrection / duplicate execution** | redelivery vectors for a STOPPED unit; second worker on a live unit | refused (`KILL_SWITCH_PENDING`, `EXECUTION_ALREADY_LEASED`) |
| **Premature STOPPED / state-machine bypass** | direct superuser `UPDATE state='STOPPED'` from REQUESTED; STOPPED with a live lease | trigger error / refused; mutants killed |
| **Privilege escalation via database roles** | 116-case matrix with real non-superuser logins (see `DATABASE_AND_ROLE_VERIFICATION.md`) | no bypass |
| **Function hijack** | shadow temp tables, hostile `search_path`, `SET ROLE`, `CREATE` in `public` | refused / no effect |
| **Audit tampering** | UPDATE/INSERT/DELETE on `ExecutionAuditEvent` as every runtime role; superuser UPDATE | denied; append-only trigger |
| **Audit data leakage** | secret in payload (nested, header-shaped); oversized/non-object payload; redaction library failure | stored redacted; refused; sentinel `{"_redactionFailed":true}` — raw never stored |
| **Resource exhaustion** | 40 concurrent callers on one grant; unbounded reclaim/reconcile batches | lock timeouts fail closed (D-J); batch sizes bounded (1–1000/500); reconciler never waits |
| **Race conditions** | barrier tests + mixed-operation stress + load | none found after remediation; 0 deadlocks |
| **Secrets in the repo** | scan of the diff for credential-shaped literals | none; test logins use random per-run passwords; the isolated-container credentials used for runtime evidence are not committed (drivers are temporary files) |
| **SSRF / DNS rebinding / browser isolation** | NOT APPLICABLE to SPEC 008 (no outbound request code). The kill-switch `AbortSignal` composition into `safeFetch` was exercised (`NET`): an in-flight request is aborted promptly and an already-aborted signal sends nothing. | — |

## Findings
D-A (HIGH), D-C (MEDIUM-HIGH), D-I, D-B, D-D (MEDIUM) were security-relevant and are fixed with regression tests (`DEFECT_REGISTER.md`).
**Not claimed**: compromised-worker resistance on the shared dev stack (still superuser); resistance of a future engine that omits checkpoint call sites (FR-019 names this as a governance, not a runtime, control).
