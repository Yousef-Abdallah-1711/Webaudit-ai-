# Owner Decision Packet

Nothing here is approved. Each row has a **recommended default**, alternatives and what the recommendation means. Answer by writing the decision ID and one of: *accept recommendation*, *choose alternative X*, or *other*. Until answered, the fail-closed behaviour in `DECISION_REGISTER.md` stays in force. Spec owners are not identified in any document; where the owner is "project owner" the question is yours. IDs are the register's.

## Batch 1 — Unblock provenance and the amendment path
| ID | Question | Recommended | Alternatives | What the recommendation means |
|---|---|---|---|---|
| DEC-031 | Supply the master-spec approval date and contract-freeze date (one act or two), or confirm the 006 header stays `Draft` | Supply dates you can substantiate; otherwise leave unchanged | leave unchanged | Headers are edited only with your dates; nothing inferred |
| DEC-034 | Name an owner and date for the AR-13/AR-19 design with the 007/008/009 implementers | Schedule it before 007/008 schemas are built | schedule later (retrofit risk) | Database role design is reserved while schemas are written |
| DEC-066 | Approve the complete U-1b text? | Not yet; approve after the repairs and Batches 2–5 | approve v5 as is (not recommended: v5 review found blocking defects) | Keeps U-1 uncommitted until text is consistent |

## Batch 2 — SPEC 008 (F07)
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-048 | When a stop is requested and no live host exists, who advances the kill-switch row? | (a) finalizer acknowledges by authority **and** (b) a reconciler advances rows with no live in-scope execution | (c) accept and alert only | Broad-scope rows cannot stay blocked indefinitely; adds a 008 reconciler |
| DEC-049 | `recordStopped` order vs unspecified lease release | Reconciler records `STOPPED` once no live lease exists, until AR-19 | call after finalize regardless | Matches 008's "after full exit and budget released" wording |
| DEC-050 | Adopt lock order unit → lease → counter, replay lookup before the counter lock | Adopt; 008 states it for every operation | leave unspecified (deadlock risk unverified) | Needs 008 text and a stress test |
| DEC-045 | Amend 008 for a unit-keyed, token-free, transaction-joinable release and context-derived identity | Amend before implementing 008 | separate admission service | Finalize and release become one transaction |

## Batch 3 — SPEC 009 design
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-051 | Adopt the effect-authorization ledger (009 contract + engine ledgers) | Adopt | no ledger (accept post-terminalization authorization risk) | No new database authorization after terminalization; in-flight effects remain |
| DEC-056 | Claim token mechanics (host CSPRNG ≥128 bits, SHA-256 at rest, bound parameter, never logged) | Accept | database-generated token | Bearer token never reaches logs/queue/child |
| DEC-057 | Single-statement CAS + `FOR SHARE` lease check in a second ordered statement; lease predicate only when the dispatch call consumed concurrency | Accept | none viable (CTE order not guaranteed) | Commit-instant protection only |
| DEC-058 | One stop-first cause classifier for every writer | Accept | prose only | Removes divergence between writers |
| DEC-059 | Add a bounded enqueue reconciler | Accept | rely on the sweep only | Shortens recovery for lost/never-enqueued jobs |
| DEC-064 | Sweep may refuse `DISPATCHED` without termination confirmation when the engine's start gate is declared conforming | Accept | require confirmation always | Needs per-engine conformance declaration |
| DEC-047 | One logical finalization function; 012 entry points share one body | Accept | amend rule 1 to allow multiple paths | Equivalence test at SG1 |
| DEC-060 | Calibrate provisional values (`startGateTimeoutMs`, finalization margin M) by measurement before activation | Accept | fix values now | No non-passive class activates uncalibrated |

## Batch 4 — SPEC 010
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-052 | Context ceiling vs lifecycle | (a) check before F07 with a local in-memory reservation, delayed requeue, pool built after `RUNNING` | (b) bounded `ADMITTED` wait (holds lease); (c) F07 concurrency budget (not equivalent: per grant, not per process) | No lease/child held while waiting; fairness/starvation must be specified |
| DEC-042 | U-1 obligations on BROWSER/CRAWLER | Formal 010 amendment | implementation obligation only | Clear ownership |

## Batch 5 — SPEC 011
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-053 | Confirm supervisor/credential/provisioning status mapping (after `RUNNING`, no second F07 call) | Confirm after-`RUNNING` | amend 011 differently | Aligns 011 with the start gate |
| DEC-054 | Execution Plane creation fence | EP refuses `provision` after `destroy(runId)` | DB pre-claim of `ep-run-start`; rely on dead-man/TTL | Without one, a stale provision can orphan a Guest until supervisor/TTL cleanup |
| DEC-046 | Per-engine hosting-failure backstop required before activation | Require | defer | Activation blocked until demonstrated |

## Batch 6 — SPEC 012 and billing
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-032 | OD-3 billing | Option 1: time-boxed exception keeping today's per-area charge/refund (set expiry date) | Option 2: class-level settlement (P17+AR-17+AR-15, needs F06) | Today: 5-area audit charged 80, DEGRADED security counts delivered, refund 0 |
| DEC-061 | Keep legacy `DEGRADED`; add a separate `coverageComplete:false` marker | Accept | reuse `DEGRADED` | Readiness never PASS on the marker (P13) |
| DEC-062 | Billing of authorized-but-unconfirmed effects | Decide with DEC-032 (treat as executed) | treat as unexecuted | Affects refund of abandoned work |
| DEC-033 | OD-4 isolation mode | Mode P for an allow-listed pilot; Mode S before GA | Mode S now | No isolation claim under compromise in Mode P |
| DEC-055 | 012 claim mapping, `PLANNED`-only claim, resume-branch removal | Accept | keep | 012 follows the no-resume rule |
| DEC-035/036/037/038/039/040/041 | OD-1, P14, P16, P17, D6 batch, P11, 011 P1–P8 | Keep stated provisional defaults (refuse-all P16; `AREA_COUNT`; legacy REVERIFY_COST) | amend each | Active/authenticated testing stays disabled |

## Batch 7 — Process
| ID | Question | Recommended | Alternatives | What it means |
|---|---|---|---|---|
| DEC-043 | Independent-review standard | Stored review by a reviewer who did not author the repairs; external review for SG10 | self-declared sessions | Gate B for 012 |
| DEC-065 | Update 002/003/004 (and 005) headers to match implementation | Update after you confirm | leave | Removes status lag (C-25) |
| DEC-044 | Adopt the AR-13 database role boundary | Adopt | separate admission service | No compromised-worker resistance without it |
| DEC-067 | Add CI | Adopt | none | First safe implementation task (F-01) |
| DEC-068 / DEC-069 | Correlation-id scheme; additive migrations with default-off flags | Accept | – | Rollback = flags off |
