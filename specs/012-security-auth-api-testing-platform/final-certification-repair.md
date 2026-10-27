# SPEC 012 — Certification-Finding Repair (IC-1 to IC-7)

**SELF-REVIEW, NOT INDEPENDENT CERTIFICATION.** Date 2026-10-17. Planning documents only. No application code, migration, commit, push, deployment, freeze or change outside `specs/012-security-auth-api-testing-platform/`. No owner decision or upstream amendment was approved; no planned test was executed.

| ID | Finding | Normative repair | Tasks | Checklist | Remaining |
|---|---|---|---|---|---|
| IC-1 | No security-definer hardening requirements | FR-201(k); data-model 4.10E (twelve requirements); FR-201(a) worker role is a NOLOGIN provisioning template; 4.10A, 4.10C pointers; secrets and broker contract pointers | T865, T866 | CHK044, CHK045 (open, activation) | Needs a provider that offers non-superuser NOLOGIN owners; otherwise the AR-13 alternative |
| IC-2 | Mode S tenant bound missing on pre-claim functions | FR-201(c) fixed claim order, FR-201(c)(ii), FR-201(l); data-model 4.10D (peek row, pre-claim boundary, outcome table); audit `unit.pre_claim_denied` | T867, T868 | CHK046, CHK049 (open, activation) | Timing equality is a tested bound, not a proof; shared pool stays tenant-agnostic |
| IC-3 | Forged evidence within a claimed unit understated | FR-173 residual (4); data-model 4.10D evidence-truthfulness boundary; coverage contract rendering rule 6; FR-188 captions | T871, T872 | CHK047 | SG10 must record the limitation; no independent attestation in v1 |
| IC-4 | Evaluator queue unspecified | data-model 4.10D `sec-evaluate` (schema, producers, consumer, idempotency, limits, sweep predicate, revalidation); registry contract pointer | T869, T870 | CHK048, CHK049 | Limits are starting values (T523) |
| IC-5 | Contradictory claim, quarantine and tenant statements | FR-201(c) single ordered claim check list; FR-173 quarantine denies claims; 4.9H; 4.10D CS1 paragraph rewritten | T867 (`claim-check-order-matches-fr-201-c`) | CHK046 | none |
| IC-6 | Legacy `Issue` writes after the marker | FR-196(d) stated exposure; AR-21 stated exposure; FR-188 and coverage captions; no extension of 012 privileges to legacy workers | T871, T872 | CHK047 | AR-21 (recommended, not approved) |
| IC-7 | Claim liveness | data-model 4.10D worst-case bounds; plan.md note; no takeover or retry invented; alert only | T873, T874 | CHK050 | Faster recovery would need a 009 change (not requested) |

Counts after the IC pass (superseded by the F1 to F7 counts below): 201 FRs; **530 tasks** (T865 to T875); 83 reason codes; 20 models; 19 contracts; 19 diagrams (all parse, syntax only); **230 checklist items (202 checked, 28 open, each open item classed)**.

## Delta-review findings F1 to F7 (targeted planning repair, 2026-10-17)

**SELF-REVIEW, NOT INDEPENDENT CERTIFICATION.** The delta review of the IC-1 to IC-7 repairs (same session) found F1 to F7. Planning documents only; no code, migration, commit, push, deployment or freeze; no owner decision or upstream amendment approved; no planned test executed.

| ID | Finding | Normative repair | Tasks | Checklist | Remaining |
|---|---|---|---|---|---|
| F1 | IC-7 understated recovery for a crashed parent and omitted the 009 hosting-failure backstop | data-model 4.10F (principle B1 to B3, obligations D1 to D6, seven-case crash matrix with only enforceable bounds); FR-052; 4.10D claim-liveness paragraph, plan.md note, E14 and E15 contract pointers; AR-22 | T876, T877 | CHK051, CHK052 (open) | AR-22 and AR-8 unapproved; **E14 and E15 activation blocked** |
| F2 | Uniform denial as an exception conflicts with the same-transaction audit | data-model 4.10D pre-claim paragraph (returned structured result, same-transaction audit, no autonomous transaction or dblink, named rollback limit); FR-201(l) | T878, T879 | CHK053 | caller rollback erases its own audit row (named limit) |
| F3 | Denial audit unbounded; audit mapping undefined | durable per-principal counters on `WorkerPrincipal` (4.9K), bounded emission, summary row, `PRE_CLAIM_PROBING` quarantine (4.9H), safe `actorId`, `subjectType`, `subjectId` mapping with no unit id, hash or tenant; audit vocabulary | T878, T879 | CHK053 | A and Q are starting values (T523) |
| F4 | Per-principal enqueue cap unenforceable | option A: trusted producers only (orchestrator, evaluator), worker hook no-op, plan-level message, `sec_append_evidence` row cap, retry, poison and overflow audit; no per-principal cap claimed | T869, T870, T880 | CHK054 | compromised orchestrator or evaluator out of model |
| F5 | CREATE and TEMP revocation implicit | data-model 4.10E.1 explicit revocation set, managed-database conditions, planned verification queries; requirement 9 | T881, T882 | CHK055 | provider behavior unproven until the target deployment |
| F6 | Pooler identity unspecified | data-model 4.10E.2 identity rule, four deployment modes, fail closed, `sec_principal_probe`; FR-201(m) | T881, T882 | CHK056, CHK057 (open) | transaction pooling only with per-login pools verified |
| F7 | Checklist order | CHK049 and CHK050 lines swapped in `secrets-session-isolation.md`; identifiers unchanged | none | none | none |

Counts: 201 FRs; **538 tasks** (T876 to T883 added); 83 reason codes; 20 models; 19 contracts; 19 diagrams; **237 checklist items (207 checked, 30 open, each open item classed)**.
