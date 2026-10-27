# SPEC 012 — Handoff to a Narrow Independent Confirmation Review

> **Superseded in part (2026-10-15, sixth repair)**: the pre-run refusal / `KILLED`, finalization, `PLANNED->ADMITTED` ownership, broker `RUNNING`-only issue, redirect and path-segment rules, claim class scoping and durable breach counters described below were rewritten (`sixth-repair-matrix.md`). Statements here about `sec_transition_unit` reaching `REFUSED`/`KILLED`, `REDIRECT_LOCATION`, `DISPATCHED` broker issue and `sec_sweep_transition_unit` are historical.

**Date**: 2026-10-15 · Prepared by the repair author; **not** a review, no certification. The reviewer must be independent of the author, read-only, and re-derive every check.

## Scope (narrow)

Confirm only A1–A5 and N-5/N-6/N-10 as listed in `fifth-repair-matrix.md`. Do not reopen findings the fourth review rated ADEQUATE without new evidence.

## Targets

1. **A1**: spec FR-200(a)(b), FR-173 (MAC tuple), `api-security-check-contract` item 4, data-model 4.9L, T810/T811/T791. Try: an item substituted or mutated between resolution and use; evidence produced during the plan sneaking in; digests computed over parsed rather than raw bytes; `PlanStepTable` nondeterminism after a restart.
2. **A2**: FR-200(d)(e), the active-security contract test list, T812/T813. Try: any path by which the child influences a request value other than a registry-checked `CREDENTIAL`; a redirect to an unplanned state-changing target (301/302/303/307/308); stale, cross-identity, cross-destination, truncated or consumed response provenance; a planned redirect step whose template accepts a hostile `PATH_SEGMENT` value.
3. **A3**: FR-195, FR-201(c)(d)(e), the active-security contract dispatch steps 3-5 and host item, AR-18, T814/T815, against `specs/009-*/data-model.md:53-65`, `contracts/execution-runtime-contract.md`, `contracts/execution-unit-contract.md:46-86`, `contracts/scan-deadline-contract.md:118,176-190`. Decide whether the neutral formulation (pickup status read from the 009 table, AR-18, SG1 table equality) is sufficient for planning closure or whether the 009 ambiguity must be resolved first (verdict "upstream change required").
4. **A4**: FR-173, FR-201(b)(f)(g), data-model 4.9H–4.9K and 4.10A, the broker contract trust item, T816/T817/T784/T785. Try: two replicas racing; deadlock/retry paths that grant; a worker supplying another principal's id; tenant spread across principals; understatement in the stated blast radius.
5. **A5**: M012-7 is defined once (`grep "^| M012-7" data-model.md` → one row), P13 labels, quickstart ids, both amendment-request sentences, and the reconstruction of `upstream-amendment-requests.md` unchanged elsewhere.

## Mechanical checks the author ran (re-run; do not trust)

Author scratch scripts: FR numbering 201 contiguous; 474 task rows; 0 FRs without a task; 0 tasks without an FR; trace table 201 rows with 0 mismatches; 0 dangling task refs; 83 unique reason codes, all in at least one contract, 0 unregistered tokens; 19 mermaid blocks with 0 structural problems; checklists without duplicate ids; semantic greps for `QUEUED`, `inputEvidenceDigests`, `slotValues`, `claim_unit_for_dispatch`, `P13 PROVISIONAL`, `nineteen` and a duplicate `M012-7` return nothing outside historical documents. SpecKit analyze was **not** run: `.specify/feature.json` points at SPEC 011 and the skill's prerequisite call persists that file.

## Not executed / still open

Any implementation, migration, probe; T650; SpecKit analyze; any independent review. Owner decisions pending: P4, P5, P6, P8, P9, P12, P14, P16, P17, P18 (P11 deferred), OD-1, OD-2, OD-3. Upstream: AR-13 (required for activation), AR-15, AR-17, AR-18.

## Required reviewer output

Re-rate A1–A5 and the three nonblocking items (ADEQUATE / WEAK / GAP) with file:line evidence, list new findings by severity, and end with exactly one verdict line of the reviewer's choosing.
