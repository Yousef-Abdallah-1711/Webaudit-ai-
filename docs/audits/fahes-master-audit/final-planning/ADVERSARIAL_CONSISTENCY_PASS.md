# Final Adversarial Consistency Pass

Each scenario is checked across the decision register (DEC), target design (§), backlog (task), traceability register and readiness gates. A scenario is marked resolved only if no pending owner decision or unbuilt external capability is needed; otherwise **PARTIAL**, **BLOCKED** or **NOT CLAIMED**. Nothing is declared resolved on the strength of this document alone. IDs were mechanically cross-checked against the generated registers (see the final report).

| # | Scenario | Design | Decisions | Tasks | Gate | Disposition and reason |
|---|---|---|---|---|---|---|
| 1 | Stop and deadline true at once | §7 classifier | DEC-058, DEC-021, DEC-055 | CORE-03, CORE-04 | C | **PARTIAL** — procedure proposed; 012 tier-U writer and the U-1 `:185` wording still need changes; acknowledgement path is DEC-048 |
| 2 | Broad-scope `STOPPED` row exists | §7 (stop definition) | DEC-021 | G-02, CORE-03 | C | **RESOLVED IN PROPOSED DESIGN** — 008 refuses only on `REQUESTED`/`ACKNOWLEDGED`; `STOPPED` refuses only for `(EXECUTION, id)`; U-1 text must be corrected |
| 3 | Host loses lease while stop pending | §7 loop | DEC-016, DEC-048 | CORE-04 | C | **PARTIAL** — no finalization after lease loss kept; acknowledge-only by a stale holder UNVERIFIED (UNV-10) |
| 4 | F07 admission commits after terminalization | §6, §8 | DEC-045 | CORE-04, S-03 | E | **PARTIAL** — pre-F07 re-read narrows it; residual time-of-check/time-of-use until AR-19; lease then lives until release/reclaim (≤ ~90 s for a crashed host) |
| 5 | Finalization succeeds, release fails | §6, §12 | DEC-045, DEC-049, DEC-070 | CORE-06, S-03 | F | **BLOCKED** on AR-19; stale-but-live renewer unbounded for non-conforming hosts |
| 6 | Effect authorized, unit terminalizes before the effect | §9 | DEC-051 | CORE-05 | C | **PARTIAL** — hook returns `PENDING`; the effect itself is not prevented (UNPROVEN, by design) |
| 7 | Effect succeeds, completion recording fails | §9 | DEC-051, DEC-062 | CORE-05 | C | **PARTIAL** — record stays `AUTHORIZED`, reconcile, `ABANDONED_UNCONFIRMED` after margin; billing of such effects is an owner decision |
| 8 | 010 process-level ceiling hit while grant concurrency is available | §5 | DEC-052 | E-01, G-04 | C | **BLOCKED** — owner (010) |
| 9 | 011 `provision` races destroy and terminalization | §9 | DEC-053, DEC-054 | E-05, EV-02 | E | **BLOCKED** — EP has no tombstone; dead-man/TTL unbuilt |
| 10 | 012 pacing delays send after the F07 checkpoint | §9 (b)(c) | DEC-051 | CORE-05, E-07 | C | **PARTIAL** — wording corrected (consumption bound ≠ time bound); the window is retained as a documented limitation, not prevented |
| 11 | `DEGRADED` coverage settled and refunded | §10 | DEC-032, DEC-061 | B-01, B-02 | B | **BLOCKED** — OD-3; today SECURITY `DEGRADED` counts as delivered and the refund is 0 |
| 12 | Paused-but-live host resumes after lease expiry | §6, §12 | DEC-057 | CORE-04 | E | **PARTIAL** — bounded only by loop reads and the 008 renewal rule; reclaim ≈ 90 s applies to crashed holders only; no authority bound claimed |
| 13 | Duplicate claim or queue delivery | §4 sequence | DEC-015, DEC-056 | CORE-03 | C | **RESOLVED IN PROPOSED DESIGN** for conforming workers; bypass is scenario 16 |
| 14 | Competing unit/lease/budget lock orders | §8 | DEC-050 | S-05, EV-01 | E | **BLOCKED** — 008 reclaim/reconcile order unspecified; 012 order lacks `BudgetCounter`; deadlock freedom UNVERIFIED |
| 15 | Kill switch requested with no live host | §7, DEC-048 | DEC-048, DEC-049 | S-04 | B | **BLOCKED** — 008 decision |
| 16 | Non-conforming worker bypasses the protocol | §3, §6 | DEC-044 | F-02, E-06 | F | **NOT CLAIMED** — shared DB role; AR-13 |
| 17 | DB outage during terminalization or settlement | §12 | DEC-070 | B-03 | F | **PARTIAL** — rollback plus sweep; settlement idempotent; a crash between the guarded move and the refund loses (never doubles) the refund today |
| 18 | Redis unavailable or diverges | §2, §12 | DEC-020, DEC-059 | CORE-07 | F | **PARTIAL** — PostgreSQL authoritative; stop read ≤ 5 s polling; queue loss strands `PLANNED` units until sweep/reconciler (pending DEC-059) |

Totals: 2 resolved in the proposed design, 9 partial, 6 blocked, 1 not claimed (18). Agreement check: every scenario maps to existing decision IDs and backlog tasks; each BLOCKED/PARTIAL entry corresponds to a ledger contradiction or an `UNVERIFIED`/missing-source record in the traceability register; no scenario is marked resolved while its decision is pending.
