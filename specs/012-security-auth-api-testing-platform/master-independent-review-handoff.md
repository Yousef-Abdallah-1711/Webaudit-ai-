# SPEC 012 — Handoff to the Independent Certification Review (after the master audit repair)

**SELF-REVIEW, NOT INDEPENDENT; this is not a certification.** Date 2026-10-16. The reviewer must be independent of the repair author (the same session wrote the final certification review, the seventh repair and this master repair), read-only, and must re-derive every check. Treat `master-repair-matrix.md`, `master-validation-results.md` and every checklist mark as claims. No code, migration, commit, push, deployment or freeze occurred; SPEC 012 is not frozen; no owner decision is approved.

## Scope

Re-verify MA-01 to MA-16 and the seventh repair (F1 to F3, L1 to L5, AR-18 items 5 and 6) against the actual files, then run a fresh adversarial sweep. Do not reopen items earlier reviews rated ADEQUATE without new evidence.

## Attacks to attempt

1. **Broker (MA-01, MA-03)**: find any worker-callable operation, argument or header that still names a tenant, principal, status or identity outside the unit's verified binding; whether `confirmLeaseDestroyed` can still be driven by a non-parent-observed proof; whether the `credentialBindings` digest, the `identityRefs` set equality and the R4-class denial are consistent between FR-032, FR-173, FR-191, FR-201(f), data-model 4.3 and `credential-broker-contract.md` item 12; whether sweeper and operator paths are really unreachable by a worker role; deadlock risk of the added reads under the principal-then-tenant lock order.
2. **Identifiers (MA-02)**: any path, query, body or header position in which a value from a target response (`Location`, extractor output) can reach the wire other than a token slot or a member of a plan-known `values[]`; whether the renderer's refusal paths cover every position kind; whether FR-092 and its seven restatements now agree.
3. **Finalize matrix (MA-04)**: compare data-model 4.10B tier C with every reason that any contract names for a pre-run refusal and with the plan.md passthrough sets; look for a legitimate refusal that is still denied, or a denied call that still changes state.
4. **Vault paths (MA-05)**: every FR-020 and FR-021 transition must map to one `vault_*` function or the broker role; check column sets against data-model 4.2 immutability, tenant re-check, dual control for tenant and KEK scope, and that no operator read path appeared.
5. **Mutation cap (MA-06)**: allocator races, abandoned ordinals, per-unit count, recovery, and the interaction with `maxMutations` 0.
6. **Residual honesty (MA-07)**: is the write-surface residual complete in FR-173, FR-201(a), the 4.10A note and AR-13, and is the OD-4 default (Option B) described neutrally? Look for any text that still claims tenant isolation under worker compromise.
7. **Consistency (MA-08 to MA-16)**: re-run the stale-text greps in `master-validation-results.md` section 2, diagram text, and the supersession notices.
8. **Billing and upstream**: confirm OD-3 is unchanged and unsolved; confirm AR-18 items 5 and 6 and the 008 capability are recorded and not approved; confirm the 009 U-1 edges are still labelled working-tree-only.
9. **Counts**: recompute 201 FRs, 506 tasks, 83 codes, 20 models, 19 diagrams (blocks), 19 contracts, 220 checklist items (195 checked, 25 open) with a range-aware validator.

## Mechanical checks the author ran (re-run; do not trust)

See `master-validation-results.md`. SpecKit Analyze was **not** run (it would persist `.specify/feature.json`, which points at SPEC 011). Diagrams were not rendered. No test was executed.

## Open owner and upstream items

Owner: P4, P5, P6, P8, P9, P12, P14, P16, P17, P18 pending; P11 deferred; OD-1, OD-2, OD-3, OD-4; AR-8 and AR-9 provenance. Upstream: AR-13, AR-15, AR-17, AR-18 items 1 to 6 (clarification requests, none approved), the 008 transactional lease-release capability (4.10C). Activation gates: see `master-upstream-dependencies.md`.

## Required reviewer output

Re-rate MA-01 to MA-16 (ADEQUATE / WEAK / GAP) with file and line evidence, list new findings by severity, state whether the residual blast radius (claim set plus write surface) is now fully and accurately documented, and end with exactly one verdict line of the reviewer's choosing.


---

## Final-pass additions for the reviewer (same session)

Also attack the new confinement design: (1) any worker function that still accepts a tenant, scan, plan, target, grant, status or record owner as an argument, or that reads or writes before `sec_ctx`; (2) any direct DML or SELECT left to a worker role in `data-model.md` 4.10A; (3) the `fahes_sec_derive` role and `sec-evaluate` queue: can a worker cause a derived write, or forge the queue payload (ids only, derived tenant and plan)? (4) rule CS1 and `servedTenantIds`: bypass through multiple principals, registration abuse, and the claim function's lock order; (5) the 4.10C contract against the frozen 008 text; (6) the OD-4 statement: does any document still claim tenant isolation under a shared pool? (7) the ownership table in `final-security-boundary-design.md` against 009's diagram and matrix; (8) the open checklist classification in `final-closure-readiness.md`. Counts to recompute: 201 FRs, 519 tasks, 83 codes, 20 models, 19 contracts, 19 diagrams (parse with a real Mermaid parser), 223 checklist items (197 checked, 26 open).


---

## Certification-repair additions

Re-attack IC-1 to IC-7 using `final-certification-repair.md`: (1) the twelve hardening requirements of 4.10E against a real PostgreSQL role model (is NOINHERIT with copied grants workable, are NOLOGIN owners and `FORCE ROW LEVEL SECURITY` available on the intended provider?); (2) the uniform-denial claim of the pre-claim boundary, including error text, SQLSTATE, row counts and latency; (3) whether any pre-claim path remains that is not tenant-bound; (4) the queue contract, in particular whether the `reason` field or any message field can still act as authority; (5) the truthfulness caption wording and whether any surface can omit it; (6) the claim-liveness bounds against 009's sweep interval. Counts: 201 FRs, 530 tasks, 83 codes, 20 models, 19 contracts, 19 diagrams, 230 checklist items (202 checked, 28 open).


---

## F1 to F7 additions

Re-attack: (1) the crash matrix of 4.10F, in particular whether every stated bound is enforced by a component other than the crashed one and whether the activation block on AR-22 is stated everywhere; (2) the returned-denial design of 4.10D against the transaction rules (can any path still raise, write outside the transaction or differ by cause in shape, work or audit); (3) the audit field mapping and the bounded emission arithmetic (at most A + 1 rows per principal per window) and whether the unregistered-login case leaves a gap; (4) the trusted-producer queue: can any worker identity still publish or influence plan-level jobs; (5) the 4.10E.1 revocation set and verification queries against a real provider; (6) the 4.10E.2 deployment modes and the probe. Counts: 201 FRs, 538 tasks, 83 codes, 20 models, 19 contracts, 19 diagrams, 237 checklist items (207 checked, 30 open).
