# WebAudit AI — Product Definition

**Version** 1.0 · **Date** 2026-08-23 · **Status** Baseline

Companion to the governing documents, not a replacement for them. Requirements live in
[specs/001-webaudit-mvp-baseline/spec.md](specs/001-webaudit-mvp-baseline/spec.md); engineering
principles in [.specify/memory/constitution.md](.specify/memory/constitution.md). This document
covers positioning, competitive standing, and the commercial model.

Competitive input from a `ui-clone` teardown of [siteaudits.ai](https://www.siteaudits.ai/):
[specs/ui-reference-siteaudits/teardown.md](specs/ui-reference-siteaudits/teardown.md).

---

## 1. What this is

**WebAudit AI audits a website across five dimensions and then walks the owner to production-ready.**

A user submits a URL, a connected repository, or an uploaded archive. The system measures
performance, security, design, testing, and search visibility — deterministically first, then with
AI explaining and prioritising what was measured. The user gets a health score, an executive
summary, and per-issue remediation prompts they paste into their coding agent.

Then the part that matters: as they fix things, the system **re-verifies each issue with a narrow,
cheap check** and turns it green only when the check actually passes. When no critical or high issues
remain, a production-readiness pass re-audits everything fresh, detects anything that regressed, and
returns an explicit go or no-go.

## 2. The one-sentence difference

> Everyone else in this category sells you a report. We sell you the walk from red to green, and we
> verify each step.

The report is table stakes. The verified fix loop and the readiness verdict are the product.

## 3. Who it is for

**Primary — the developer or technical founder about to ship.** Has a launch date. Needs to know
what will break and whether it is fixed. Already works with an AI coding assistant, so a
paste-ready remediation prompt is worth more than prose advice. Buys on depth and honesty; a tool
that overstates findings loses them permanently.

**Secondary — the agency delivering client sites.** Needs a defensible artifact showing the site was
verified before handover. The readiness certificate is the deliverable. Runs many audits, so
per-scan economics matter.

**Explicitly not our buyer — the non-technical small-business owner** who wants their site to look
nicer. Well served by simpler, cheaper tools, and serving them would pull the product toward a
casual register that destroys our credibility with the primary buyer. Passing on this segment is a
decision, not an oversight.

## 4. Competitive position

Teardown of the nearest public comparable, siteaudits.ai. Every row is verifiable from their public
site.

| | siteaudits.ai | WebAudit AI |
| --- | --- | --- |
| Input | URL only | URL, repository, or archive |
| Coverage | Presentation, performance, SEO, accessibility | Performance, **security**, design, **testing**, SEO |
| Source-level findings | None possible | Dependency CVEs, bundle composition, query patterns |
| After the report | "Follow the steps" | Verified fix loop, objective re-checks |
| Completion state | None | Production-readiness verdict with regression detection |
| Measurement vs. AI opinion | Not distinguished | Every finding labelled |
| Monetisation | Per-audit Pro upgrade, heavy discounting | Subscription credits + non-expiring top-ups |
| Pricing visibility | Behind login | Public |
| Register | Consumer, jokey | Technical, plain |

**Where they are genuinely stronger, and we should admit it:**

- **Time to first value.** Paste a URL, no signup, get an audit. Ours must match this or we lose the
  funnel regardless of depth. The free allocation exists for exactly this reason.
- **Funnel discipline.** No navigation, one action, every section ending in the same CTA. We adopt
  this wholesale — see [DESIGN.md](DESIGN.md) §2.
- **Copy that lands.** Their register is wrong for us, but their specificity about *pain* is right.

**Where their model has a structural ceiling:**

Per-audit upgrades with 65%-off coupons train users to wait for a discount and cap revenue per
customer at roughly one audit. Our subscription plus verification loop is built for repeat use,
because fixing a site is inherently repeat use. The fix loop is not just a better feature — it is
what makes recurring revenue coherent.

**The risk we should name.** Our differentiation is depth, and depth means our audit takes minutes
where theirs takes seconds, and costs credits where theirs is free. If the first-run experience
feels slow or expensive, depth never gets a chance to matter. Live streaming progress and
per-area results landing independently are not polish — they are what makes a multi-minute scan
tolerable.

## 5. What the product does

Full behaviour is in the specification's 94 requirements. The seven journeys, in priority order:

| | Journey | Value |
| --- | --- | --- |
| P1 | Audit a live site, get an actionable report | The core promise |
| P2 | Fix issues and turn the board green | The differentiator |
| P3 | Get a production-readiness verdict | The finish line |
| P4 | Audit source, not just the served page | Depth that justifies Pro |
| P5 | Pay for capacity | The business |
| P6 | Tailor the design audit to brand intent | Makes design findings usable |
| P7 | Operate and grow the platform | Coverage growth without releases |

Stage 8 of the [implementation plan](specs/001-webaudit-mvp-baseline/plan.md) is the first sellable
artifact: a real audit of a real site through the security and SEO areas end to end.

## 6. Product principles

Five commitments that decide arguments. Each traces to the constitution.

1. **Measured before inferred.** Anything measurable is measured, not guessed. AI explains and
   prioritises; it does not invent observations. Every finding says which it is. *A wrong finding in
   a security report is worse than a missing one.*
2. **Green means verified.** An issue turns green when a check passes, never when a user says so.
   *The moment we let assertions turn things green, the board becomes decoration.*
3. **Never charge for our failures.** Platform faults, provider outages, and internal errors refund
   or never debit.
4. **Degrade, never collapse.** A failing capability degrades its area. An exhausted AI chain still
   delivers measured findings. Users are told exactly what is missing.
5. **Verify narrowly.** Confirming one fixed header costs 3 credits and seconds, not 80 credits and
   minutes. *If completing the loop is expensive, users stop walking it — and the loop is the
   product.*

## 7. Commercial model

Credits are the single internal unit. Full schedule in the specification.

| Operation | Credits |
| --- | --- |
| One audit area | 10–25 |
| Full audit, all five, bundled | 80 |
| Targeted re-check of one issue | 3 |
| Production-readiness pass | 60 |

Five areas cost 95 individually against 80 bundled, so complete coverage is always the cheapest
route to complete coverage. A re-check is under 4% of a full audit — that ratio is what makes
principle 5 real rather than aspirational.

| | Free | Starter | Pro | Business |
| --- | --- | --- | --- | --- |
| Credits | 50, once | 300/mo | 1,200/mo | 4,000/mo |
| Repository input | — | — | ✓ | ✓ |
| Load generation | — | — | ✓ | ✓ |
| Readiness pass | — | ✓ | ✓ | ✓ |
| Concurrent audits | 1 | 1 | 3 | 6 |
| Retention | 7d | 30d | 12mo | 24mo |

**The free tier is 50 credits against a full audit's 80.** Deliberate: a new user audits two or
three areas of their choosing and sees real findings on their real site, but complete coverage
requires a plan. This is the conversion mechanism.

**Two credit lifetimes.** Plan credits expire at renewal; purchased top-ups never expire; expiring
credits are always spent first. That last rule matters — without it we would quietly destroy
credits people paid cash for. Top-ups are paid-plan only, so the free tier stays an evaluation
rather than a route around subscribing.

**Pricing is public.** Technical buyers read hiding it as a tell.

## 8. Scope boundaries

Decided and closed. Reopening any of these is a specification amendment.

**In scope:** public-page auditing; five areas; URL, repository, and archive input; verified fix
loop; readiness verdict with regression detection; credits and plans; operator administration.

**Out of scope for the baseline, with reasons:**

- **Auditing behind a sign-in.** Would require holding customer credentials — a custodial risk we
  will not take on at baseline. Costs us real depth in testing and security, and we accept that.
- **Applying fixes ourselves.** We produce prompts; the user's agent applies them. Opening pull
  requests against customer repositories is a different product with a different risk profile.
- **Site-wide crawling.** One page or project per audit.
- **Teams and seats.** Single-user accounts. The entity model keeps ownership on a user so a
  workspace can be introduced later without restructuring.
- **Continuous monitoring.** We audit on request. Scheduled re-auditing is an obvious extension and
  a plausible second product, but it is not this one.

## 9. Success measures

Product health, not engineering metrics. The full set is in the specification.

**Does the core loop work?**
- First-time visitor to delivered report in under 10 minutes, unaided.
- 90% of audits deliver every requested area.
- 70% of users with a critical or high issue resolve at least one.
- 30% of users who resolve their first issue reach a readiness verdict.

**Is it trustworthy?**
- 100% of delivered issues carry attribution.
- Zero issues turn green without a passing check.
- Fewer than 5% of findings reported as inaccurate or not reproducible.
- Zero users charged for a failure of ours.

The trust measures are the ones to defend under schedule pressure. The loop can be slow and still
win; it cannot be wrong and win.

## 10. Open questions

- **Time to first value.** Ours is minutes against their seconds. Is a partial result at 30 seconds
  enough, or does the funnel need a genuinely fast first pass?
- **Monetary price points.** Credits and entitlements are fixed; currency amounts are not.
- **Agency packaging.** The readiness certificate is clearly an agency deliverable. Multi-client
  management is out of baseline scope, which leaves the segment half-served.
- **Whether authenticated auditing is the next feature.** It is the largest single depth gap and the
  largest single risk increase. Probably the first post-baseline decision to make.
