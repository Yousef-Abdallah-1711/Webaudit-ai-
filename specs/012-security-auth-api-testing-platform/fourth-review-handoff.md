# SPEC 012 — Handoff to an Independent Fourth-Pass Review

> **Superseded in part (2026-10-15, fifth repair)**: FR-195/199/200/201 and the dispatch order, slot provenance, input manifest, principal authentication and anomaly enforcement were rewritten (`fifth-repair-matrix.md`). Statements below about `claim_unit_for_dispatch`, `QUEUED`, child-supplied slot values and `inputEvidenceDigests` are historical.

**Date**: 2026-10-15 · Prepared by the repair author. This is **not** a review and carries **no certification**. The reviewer must be a different session from the author and from the third-pass reviewer's blind spots: re-derive everything.

## Rules
Strictly read-only: no edits, commits, freeze, deploy, SPEC 013, or subagents. Treat `fourth-repair-matrix.md`, every checklist mark and every count as claims. Planning closure is not runtime feasibility.

## Reading order
`fourth-repair-matrix.md` → `spec.md` (FR-041, 055, 142, 172, 173, 175, 189, 190, 191, 196, 198, 199, **200, 201**) → `plan.md` (registry, SG1/SG3/SG5/SG10, P16–P18, D7) → `data-model.md` (4.9D–4.9H, M012-5e/M012-7, account deletion) → the consolidated section at the end of each of the 19 contracts, **plus their bodies** (the previous review could not read all bodies; contradictions hide there) → `tasks.md` Phase 18–19 → `upstream-amendment-requests.md` (AR-13, AR-15, AR-17; the file's tail after AR-17 was accidentally truncated and reconstructed from the author's earlier writes — verify AR-16, "Resolved additions" and the frozen-doc audit are intact and complete).

## Challenges to attempt
1. **F-01 model**: can a compromised child cause a request the plan did not authorize (slot abuse in a header position, `RESPONSE_DERIVED` smuggling CR/LF-free but semantically hostile values, successor-order games, `maxExecutions` exhaustion races, redirect handling)? Is the `PlanStepTable` renderable parent-side from MAC-covered inputs without circularity (`inputEvidenceDigests`)?
2. **F-02 model**: does the FR-201 denied-write list close every path to credentials (including `finalize_unit`, `UnitDispatchRecord`, `AdmissionLease` via 008 functions)? Can a worker still obtain a lease for a live dispatched unit of another tenant? Are the multi-replica anomaly windows race-free in the issue transaction?
3. **F-03/F-06**: enumerate every crash window around C1–C4 and the reservation sweep; check the partial unique index against lease exclusivity and the lazy-resolution transaction.
4. **F-04/F-05**: is refusing plaintext and non-default ports consistent with every fixture and task? Any remaining text that still allows `http://` active targets?
5. **F-07/F-08/F-09**: edge cases of `CLASS_LEVEL` arithmetic; confirm `AREA_COUNT` leaves billing truly unchanged; confirm AR-17's reading of ADR-005 against `specs/006-*/decisions.md`.
6. **F-20/F-22**: byte-exact path policy vs F-01 rendering; idle-timeout behaviour with slow legitimate responses.
7. **Contradiction sweep** over full contract bodies, not only consolidated sections.

## Mechanical checks the author executed (re-run; do not trust)
`analyze2.py` (author scratch script): 201 FRs contiguous, 465 task rows, 0 FRs without a task, 0 tasks without an FR, trace table 201 rows with 0 mismatches, 0 dangling task refs, 83 unique reason codes all in ≥ 1 contract with 0 unregistered tokens; `mermaid_lint.py`: 19 diagrams, 0 problems; checklists: 8 files, 191 items, no duplicate ids. **SpecKit**: `.specify/scripts/powershell/check-prerequisites.ps1` and the constitution exist, but `.specify/feature.json` points at SPEC 011 and takes precedence over the `SPECIFY_FEATURE` override; running `speckit-analyze` on 012 would require editing that file, which this pass must not do. It was therefore **not** run; the mechanical checks above are an author-written substitute.

## Not executed
Any implementation, migration, network probe, KMS action; T650; SpecKit analyze; any independent review.

## Pending owner decisions / amendments / gates
Owner: P4, P5, P6, P8, P9, P12, P14, **P16**, **P17**, **P18**, P11 (deferred), SecuritySettlement retention. Upstream: **AR-13 required for activation**, AR-15, **AR-17**. Feasibility gates: T650 (frame gate, handshake cost at ceiling, `Connection: close` ignorers, OS egress denial, TLS exposure), FR-201 deployment and suites (T780–T785), broker topology/KMS/checkpoint store, F06 integration, proof capacity (T746), threshold calibration (T523).

## Required reviewer output
Re-rate F-01…F-22 and N2-1…N2-10 (ADEQUATE/WEAK/GAP), list new findings by severity with file:line, and end with exactly one verdict line of the reviewer's choosing.
