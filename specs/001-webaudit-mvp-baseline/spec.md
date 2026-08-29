# Feature Specification: WebAudit AI — MVP Baseline

**Feature Branch**: `001-webaudit-mvp-baseline`

**Created**: 2026-08-22

**Clarifications resolved**: 2026-08-23

**Status**: Ready for planning — no open clarifications

**Input**: User description: "WebAudit AI — baseline product specification for the MVP, derived from WebAuditAI_ARCHITECTURE.md and governed by the ratified constitution v1.0.0. A credit-based SaaS that audits a website (live URL, connected GitHub repository, or ZIP upload) across five modules — performance, security, UI/design, testing, SEO — then walks the owner from findings to production-ready via a fix/verify loop and a final go/no-go readiness pass."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audit a live site and receive an actionable report (Priority: P1)

A site owner arrives with a URL and no prior setup. They create an account, submit the address,
choose which aspects to audit, and watch each area report back as it finishes. Within minutes they
have a single report: an overall health score, a plain-language executive summary of what is wrong
and what it will cost them, and a prioritized list of issues where each one carries a
copy-and-paste remediation prompt they can hand to an AI coding assistant.

**Why this priority**: This is the entire promise of the product in one journey. Without it there
is nothing to sell. Everything else in this specification improves, monetizes, or extends this
loop.

**Independent Test**: Register a fresh account, submit a public URL, select all available audit
areas, and confirm a complete report is delivered containing a score, a summary, and at least one
issue with a usable remediation prompt. Delivers standalone value with no other story built.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they register with email and password, confirm
   their address, and sign in, **Then** they reach a starting point that invites their first audit
   and shows their available credit balance.
2. **Given** a signed-in user with sufficient credits, **When** they submit a reachable public URL
   and select audit areas, **Then** the system confirms the credit cost before starting and does
   not begin work until they accept it.
3. **Given** an audit in progress, **When** an individual area finishes, **Then** its score and
   issue count appear without the user reloading, and remaining areas continue independently.
4. **Given** a completed audit, **When** the user opens the report, **Then** they see an overall
   health score, an executive summary, a per-area score, and issues ordered by severity.
5. **Given** an issue in the report, **When** the user copies its remediation prompt, **Then** the
   prompt is self-contained enough to act on without reading the rest of the report.
6. **Given** an audit where one area fails entirely, **When** the report is delivered, **Then** the
   remaining areas are reported normally and the failed area is shown as incomplete rather than
   silently omitted.
7. **Given** a user with insufficient credits, **When** they attempt to start an audit, **Then**
   they are told what the audit costs and what they hold, before any work begins.
8. **Given** a target the user has attested to but not verified control of, **When** an audit
   including load generation is requested, **Then** the audit runs every other check, reports the
   load-generating check as unavailable pending verification, and does not charge for it.

---

### User Story 2 - Fix issues and turn the board green (Priority: P2)

The user works through their issues one at a time. For each, they copy the remediation prompt, fix
the problem, deploy, and tell the system they have fixed it. The system re-checks that one issue
cheaply and quickly, and turns it green only if the check genuinely passes. If it still fails, the
user sees the current failing evidence rather than a bare rejection.

**Why this priority**: This is the product's differentiator. A report alone is a diagnosis;
this loop is the treatment. It also drives repeat engagement and credit consumption.

**Independent Test**: From an existing report, mark one issue fixed without changing anything and
confirm it stays red with fresh failing evidence; then genuinely correct the underlying problem,
mark it fixed again, and confirm it turns green. Testable against a single issue.

**Acceptance Scenarios**:

1. **Given** a completed report, **When** the user opens the issues tracker, **Then** every issue
   from every area appears in one place, grouped by severity, with a running count of what is
   outstanding and what is resolved.
2. **Given** an unresolved issue, **When** the user marks it fixed, **Then** the system re-runs only
   the narrow check that governs that issue and returns a verdict without re-auditing the site.
3. **Given** a re-check that passes, **When** the verdict returns, **Then** the issue turns green and
   records when it was verified.
4. **Given** a re-check that fails, **When** the verdict returns, **Then** the issue remains
   unresolved and displays the current failing evidence, not merely a failure notice.
5. **Given** a user who marks an issue fixed without fixing it, **When** the re-check runs,
   **Then** the issue does not turn green under any circumstances.
6. **Given** a targeted re-check, **When** it completes, **Then** it costs materially fewer credits
   than the audit that found the issue.

---

### User Story 3 - Get a production readiness verdict (Priority: P3)

Once no critical or high-severity issues remain outstanding, the user asks for a final verdict. The
system re-audits everything from scratch, compares the result against the original audit to catch
anything that got worse along the way, and returns a clear go or no-go with the reasoning and any
remaining blockers.

**Why this priority**: This converts a long remediation grind into a finish line, and produces the
moment users share. It depends on Story 2 having produced green issues.

**Independent Test**: Take a report whose critical and high issues are all resolved, trigger the
readiness pass, and confirm a verdict is returned containing a per-area pass or fail, a comparison
against the original scores, and either a clear approval or a named list of blockers.

**Acceptance Scenarios**:

1. **Given** a report with outstanding critical or high issues, **When** the user views it,
   **Then** the readiness pass is offered but clearly marked as premature, with the outstanding
   count shown.
2. **Given** a report with no outstanding critical or high issues, **When** the user runs the
   readiness pass, **Then** every area is audited fresh rather than reusing earlier results.
3. **Given** a completed readiness pass, **When** the verdict is shown, **Then** each area shows its
   new score against its original score, and the direction of change is unambiguous.
4. **Given** an area that scored worse than in the original audit, **When** the verdict is
   produced, **Then** that decline is reported as a regression and named explicitly.
5. **Given** a readiness pass with no regressions and all area thresholds met, **When** the verdict
   is produced, **Then** the result is an explicit approval the user can share.
6. **Given** a readiness pass that does not meet the bar, **When** the verdict is produced,
   **Then** it names the specific blockers and what would clear them, rather than only a score.

---

### User Story 4 - Audit source code, not just the served page (Priority: P4)

A user connects a code repository or uploads an archive of their project. The audit now inspects
things invisible from the outside: dependency vulnerabilities, bundle composition, query patterns
that will not scale, and stylesheet decay. Their source is used for the audit and then removed.

**Why this priority**: Substantially deepens findings and justifies higher tiers, but the product
is viable and sellable on URL-only auditing first.

**Independent Test**: Connect a repository containing a known vulnerable dependency, run an audit,
and confirm the finding appears with a file-level location — then confirm the working copy of the
source no longer exists once the audit ends.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they connect their code hosting account, **Then** the system
   confirms the connection and lists the repositories it can read.
2. **Given** a connected account, **When** the user selects a repository and starts an audit,
   **Then** checks that require source produce findings with file-level locations.
3. **Given** a user without a connected account, **When** they upload a project archive within the
   size limit, **Then** the audit proceeds equivalently to a repository audit.
4. **Given** an archive that exceeds the size limit or is not a supported format, **When** it is
   submitted, **Then** it is refused with a specific reason before any credits are consumed.
5. **Given** an audit over user source, **When** the audit ends for any reason including failure or
   cancellation, **Then** no working copy of that source remains.
6. **Given** an audit of a URL with no source attached, **When** the audit runs, **Then** checks
   requiring source are reported as not applicable rather than as passing or failing.

---

### User Story 5 - Pay for capacity with plans and credits (Priority: P5)

A user exhausts their free allocation and subscribes. Their plan sets a monthly credit allocation
and what kinds of audit they may run. Every operation deducts a known cost, and any operation that
fails through no fault of theirs is not charged.

**Why this priority**: Required for the business but not for demonstrating the product. Free
allocation carries early users through the P1–P3 loop.

**Independent Test**: Consume the free allocation, subscribe to a paid tier, confirm the new
allocation and entitlements apply, then force a platform-side failure mid-audit and confirm the
balance is made whole.

**Acceptance Scenarios**:

1. **Given** a user on the free allocation, **When** they attempt an audit costing more than they
   hold, **Then** they are shown the shortfall and offered the plans that would cover it.
2. **Given** a user on a paid plan, **When** their billing period renews, **Then** their allocation
   is replenished according to their tier.
3. **Given** a plan that excludes an input type, **When** the user attempts that input type,
   **Then** it is refused with the reason and the tier that permits it, before any work starts.
4. **Given** an audit that fails because of a platform or provider fault, **When** it terminates,
   **Then** the user's credits are restored and the restoration is visible to them.
5. **Given** any completed operation, **When** the user reviews their account, **Then** they can see
   what was charged, for what, and when.
6. **Given** a paid user holding both plan credits and purchased credits, **When** an operation is
   charged, **Then** plan credits are consumed first and the account shows which balance was drawn
   against.
7. **Given** a paid user with unused plan credits, **When** their billing period renews, **Then**
   the unused plan credits are gone, the purchased credits remain untouched, and the user was
   warned before the renewal that this would happen.

---

### User Story 6 - Tailor the design audit to brand intent (Priority: P6)

Midway through the audit, before judging the site's design, the system asks the user a short set of
questions about their intent — audience, desired style, brand colors, sites they admire. The design
findings are then framed against what the user was actually trying to achieve.

**Why this priority**: Materially improves the usefulness of design findings, but the design audit
still functions on defaults if the user never answers.

**Independent Test**: Run an audit including the design area, answer the questions, and confirm the
resulting design findings reference the stated intent; then run one without answering and confirm
the audit still completes.

**Acceptance Scenarios**:

1. **Given** an audit including the design area, **When** the design stage begins, **Then** the user
   is prompted with a short set of intent questions and the audit waits.
2. **Given** a pending question set, **When** the user submits answers, **Then** the audit resumes
   and the design findings are framed against those answers.
3. **Given** a pending question set, **When** the user does not answer within the waiting period,
   **Then** the audit resumes on documented defaults and the report records that intent was not
   supplied.
4. **Given** a pending question set, **When** the user chooses to skip it, **Then** the audit
   resumes immediately without penalty.

---

### User Story 7 - Operate and grow the platform (Priority: P7)

An operator manages the platform: who the users are, what plans exist, whether the business is
profitable per audit, which audit capabilities are switched on for which tiers, whether the work
queue is healthy, and which AI providers are in use. They can add a new audit capability and put it
in front of customers without a product release.

**Why this priority**: Necessary to run the business and to grow audit coverage over time, but no
customer value is delivered by it directly.

**Independent Test**: As an operator, disable one audit capability, confirm subsequent audits omit
it and still complete; re-enable it and confirm it returns. Separately, confirm the margin of a
completed audit is visible.

**Acceptance Scenarios**:

1. **Given** an operator, **When** they disable an audit capability, **Then** subsequent audits omit
   it, complete successfully, and report it as unavailable rather than failing.
2. **Given** an operator, **When** they restrict a capability to specific tiers, **Then** only users
   on those tiers receive its findings.
3. **Given** a completed audit, **When** the operator inspects it, **Then** they can see credits
   charged, actual provider cost incurred, and the resulting margin, broken down by area and by
   capability.
4. **Given** an operator, **When** they add a new audit capability, **Then** it becomes available to
   customers without a product release.
5. **Given** an operator adding an unreviewed capability, **When** it is installed, **Then** it runs
   under restriction and cannot reach the platform's data, credentials, or network.
6. **Given** an operator, **When** they inspect the work queue, **Then** they can see waiting,
   running, and failed work, and can retry or cancel individual items.
7. **Given** a non-operator user, **When** they attempt to reach any operator capability, **Then**
   they are refused regardless of how the request is made.

---

### Edge Cases

**Target reachability and behavior**

- A submitted URL does not resolve, times out, returns a server error, or requires a login: the
  attempt is refused or reported as unauditable, and credits are not consumed for work not done.
- A submitted URL resolves to a private, loopback, link-local, or cloud metadata address, or
  redirects to one mid-audit: the audit is refused at that point. This holds for the initial
  request and every subsequent redirect.
- A site behaves differently for automated visitors, blocks the auditor, or serves a challenge page:
  the report states that the observed page may not represent real visitors rather than scoring a
  challenge page.
- A site is a single-page application whose content renders only after scripting: the audit judges
  the rendered result, not the initial payload.

**Source input**

- An archive is within the size limit but expands to an unreasonable size, or contains paths that
  escape the extraction target: it is refused without extraction.
- A repository is very large, is empty, or contains no recognizable project: the audit reports what
  it could not analyze rather than reporting a clean result.
- A repository connection is revoked between selection and audit: the audit fails clearly and
  credits are restored.
- Source contains embedded secrets: they are excluded from anything sent to an AI provider, while
  still being reported to the user as a finding.

**Execution and failure**

- One audit area fails, one capability throws, or an AI provider chain is exhausted: the audit
  completes with that part marked incomplete, and the user is charged only for what was delivered.
- Every AI provider is unavailable: measured findings are still delivered, without explanation or
  prioritization, and the report says so.
- A user closes the browser during an audit: the audit continues and the completed result is waiting
  when they return.
- The user cancels mid-audit: work stops, temporary data is destroyed, and the unconsumed portion of
  the cost is restored.
- The same target is submitted twice concurrently by the same user: the duplicate is refused or
  joined to the existing audit rather than charged twice.
- An audit exceeds its maximum permitted duration: it is terminated, reported as timed out, and
  charged only for completed areas.

**Verification and readiness**

- An issue's re-check can no longer be performed because the page or route no longer exists: the
  issue is marked unverifiable rather than green.
- A user marks every issue fixed in bulk without fixing anything: no issue turns green.
- An issue reappears after being verified green: it is reopened and its history retains that it was
  previously verified.
- The readiness pass discovers new critical issues absent from the original audit: they are
  reported as blockers, and the verdict is no-go.

**Account and billing**

- Credits are exhausted mid-audit because a concurrent operation consumed them: the running audit
  completes, and the shortfall is reported rather than the audit being killed midway.
- A subscription lapses while reports exist: reports remain readable for the retention period of the
  lapsed tier, and new audits are refused.
- A user registers with an address that already has an account through a social provider: the
  identities are joined rather than creating a duplicate account.
- A user deletes their account: their audits, reports, source copies, and stored third-party
  credentials are destroyed.

## Requirements *(mandatory)*

### Functional Requirements

#### Accounts and Authentication

- **FR-001**: System MUST allow registration with an email address and password, and MUST refuse
  registration for an address that already holds an account.
- **FR-002**: System MUST require email confirmation before granting access to audit capability, and
  MUST allow a confirmation message to be re-sent.
- **FR-003**: System MUST allow sign-in via a supported social identity provider, and MUST treat a
  provider-confirmed address as already confirmed.
- **FR-004**: System MUST join a social identity to an existing account when the confirmed address
  matches, rather than creating a second account.
- **FR-005**: System MUST allow a user to request a password reset and to complete it through a
  single-use, time-limited link.
- **FR-006**: System MUST keep a user signed in across sessions without requiring the user to
  re-enter credentials for each request, and MUST allow the user to end their session.
- **FR-007**: System MUST allow a user to connect and disconnect a code hosting account, and MUST
  request only the access needed to read the repositories the user selects.
- **FR-008**: System MUST refuse any request for capability the requester does not hold, regardless
  of how the request is constructed, and MUST enforce this independently of what the interface
  offers.
- **FR-009**: System MUST allow a user to delete their account, and MUST destroy their audits,
  reports, retained source, and stored third-party credentials on deletion.

#### Audit Intake and Validation

- **FR-010**: Users MUST be able to submit an audit target as a live web address, a connected
  repository, or an uploaded project archive.
- **FR-011**: Users MUST be able to choose which audit areas to run, and MUST be shown the exact
  credit cost of that selection before work begins.
- **FR-012**: System MUST NOT begin chargeable work until the user has accepted the stated cost.
- **FR-013**: System MUST validate that a submitted web address is publicly reachable before
  charging for an audit.
- **FR-014**: System MUST refuse any target that resolves to a private, loopback, link-local, or
  cloud metadata address, and MUST re-apply this check on every redirect encountered during an
  audit.
- **FR-015**: System MUST refuse uploaded archives that exceed the published size limit, are not a
  supported format, expand beyond a bounded ratio, or contain paths that escape the extraction
  target — in every case before extracting content and before charging.
- **FR-016**: System MUST refuse an input type the user's plan does not permit, naming the tier that
  permits it, before charging.
- **FR-017**: System MUST gate checks that act against a target behind two escalating levels of
  established control, and MUST NOT perform a check above the level the user has established.
  - **Level 1 — attested.** The user explicitly affirms they are authorised to audit the target.
    This unlocks checks that observe the target and probe its behaviour at ordinary request volume,
    including authentication and rate-limiting behaviour. System MUST record who attested, for
    which target, and when.
  - **Level 2 — verified.** The user demonstrates control by publishing a system-issued token,
    either as a file at a system-specified path on the target or as a DNS record for its domain.
    This is required for any check that deliberately generates load beyond ordinary request volume.
  - System MUST refuse a Level 2 check on an unverified target, naming which verification methods
    are accepted, before charging.
  - System MUST re-confirm verification has not lapsed before each Level 2 check, and MUST treat a
    removed token as loss of verification.
  - System MUST bound Level 1 probing to a published request rate regardless of attestation, so
    that a false attestation cannot itself cause harm.
- **FR-018**: System MUST refuse a duplicate concurrent audit of the same target by the same user,
  or join it to the audit already running, rather than charging twice.

#### Audit Capabilities (Skills)

- **FR-019**: System MUST treat each audit capability as independently installable, so that adding,
  removing, updating, enabling, or disabling one requires no product release.
- **FR-020**: System MUST discover the audit areas, input needs, and cost estimate of a capability
  from the capability itself, rather than from configuration held elsewhere.
- **FR-021**: System MUST skip a capability whose preconditions are unmet and report it as not
  applicable, rather than running it or reporting a pass.
- **FR-022**: System MUST complete an audit when an individual capability fails, marking the
  affected area incomplete rather than failing the audit.
- **FR-023**: System MUST retain a complete local copy of every externally sourced capability, such
  that removal of the original source has no effect on any audit.
- **FR-024**: System MUST NOT retrieve capability code from a third party while an audit is running.
- **FR-025**: System MUST restrict network access during an audit to the audit target and the
  platform's configured providers.
- **FR-026**: Operators MUST be able to restrict a capability to specific plan tiers.
- **FR-027**: System MUST execute any capability that has not passed review under restriction such
  that it cannot reach stored data, credentials, the network, the filesystem, or other running work.
- **FR-028**: System MUST bound every restricted execution by time and memory and MUST be able to
  terminate it from outside.
- **FR-029**: System MUST verify that a newly installed capability satisfies the capability contract
  before its first use, and MUST perform that verification under the same restriction.

#### Audit Execution

- **FR-030**: System MUST complete all deterministic measurement for an area before any AI
  interpretation of that area begins, and deterministic measurement MUST consume no AI budget.
- **FR-031**: System MUST NOT allow AI interpretation to contradict, restate as its own, or
  substitute for a measured value.
- **FR-032**: System MUST label every reported issue as either evidenced by measurement or as an AI
  judgment, and MUST NOT deliver an unattributed issue.
- **FR-033**: System MUST run independent audit areas concurrently and deliver each area's result as
  soon as it is available, rather than holding all results until the last finishes.
- **FR-034**: System MUST attempt an alternative AI provider when the first is unavailable, across
  at least two distinct providers.
- **FR-035**: System MUST deliver measured findings without interpretation, and say so, when no AI
  provider can be reached.
- **FR-036**: System MUST continue an audit when the user's browser disconnects, and MUST present
  the completed result when they return.
- **FR-037**: Users MUST be able to cancel an audit in progress, and cancellation MUST stop work,
  destroy temporary data, and restore the cost of areas not delivered.
- **FR-038**: System MUST terminate an audit that exceeds its maximum permitted duration, report it
  as timed out, and charge only for delivered areas.
- **FR-039**: System MUST record, for every AI interaction, which provider and model served it, what
  it consumed, how long it took, what it cost, and whether it succeeded.

#### Design Intent Questionnaire

- **FR-040**: System MUST prompt the user for design intent before judging design, and MUST pause
  that area while waiting.
- **FR-041**: System MUST resume on documented defaults if the user does not respond within the
  published waiting period, and MUST record in the report that intent was not supplied.
- **FR-042**: Users MUST be able to skip the questionnaire and have the audit continue immediately.
- **FR-043**: System MUST NOT block audit areas other than design while waiting for design intent.

#### Live Progress

- **FR-044**: System MUST show audit progress as it happens, without the user refreshing or
  repeatedly re-requesting it.
- **FR-045**: System MUST show each area's individual state — waiting, running, complete,
  incomplete, or not applicable — and its score once known.
- **FR-046**: System MUST notify the user when their input is required to continue.
- **FR-047**: System MUST reflect the current true state of an audit when a user returns to it after
  being away, including one that finished while they were gone.

#### Report and Remediation

- **FR-048**: System MUST deliver a single report containing an overall health score, an executive
  summary in plain language, and a score for each audited area.
- **FR-049**: System MUST order issues by severity, and MUST classify each as critical, high,
  medium, low, or informational.
- **FR-050**: System MUST provide, for each issue, what is wrong, why it matters in terms of user or
  business consequence, where it occurs, and the evidence behind it.
- **FR-051**: System MUST provide for each issue a self-contained remediation prompt that can be
  acted on without reading the rest of the report.
- **FR-052**: Users MUST be able to copy any remediation prompt in a single action.
- **FR-053**: System MUST mark any area that did not complete as incomplete in the report, and MUST
  NOT let its absence inflate the overall score.
- **FR-054**: System MUST present visual findings against the captured evidence, indicating where on
  the page each finding applies.
- **FR-055**: Users MUST be able to review their past reports for as long as their plan's retention
  period allows.
- **FR-056**: System MUST NOT include secrets discovered in user source or markup in anything sent
  to an AI provider, while still reporting their presence to the user.

#### Fix Verification

- **FR-057**: System MUST present every issue from every area of an audit in a single tracker, with
  counts of what is outstanding and what is resolved.
- **FR-058**: Users MUST be able to assert that an individual issue is fixed.
- **FR-059**: System MUST re-run only the narrow check governing an asserted issue, and MUST NOT
  re-audit the target.
- **FR-060**: System MUST mark an issue resolved only when its check passes, and MUST NOT mark it
  resolved on the user's assertion alone.
- **FR-061**: System MUST return current failing evidence when a re-check does not pass.
- **FR-062**: System MUST charge materially less for a targeted re-check than for the audit that
  found the issue.
- **FR-063**: System MUST mark an issue unverifiable, rather than resolved, when its check can no
  longer be performed.
- **FR-064**: System MUST reopen a previously resolved issue that recurs, and MUST retain that it
  was previously verified.
- **FR-065**: System MUST record when each issue was last verified.

#### Production Readiness

- **FR-066**: System MUST offer a readiness pass, and MUST indicate when it is premature because
  critical or high issues remain outstanding.
- **FR-067**: System MUST audit every area fresh during a readiness pass, and MUST NOT reuse earlier
  results.
- **FR-068**: System MUST compare each area against the original audit and report the direction and
  size of change.
- **FR-069**: System MUST identify and name any area or issue that has become worse since the
  original audit.
- **FR-070**: System MUST return an explicit go or no-go verdict, and MUST name the specific
  blockers behind a no-go.
- **FR-071**: System MUST apply published per-area thresholds and an absence of regressions when
  determining a go verdict, and MUST show which criteria passed and which failed.
- **FR-072**: System MUST give the user something durable and shareable on a go verdict.

#### Credits, Plans and Billing

- **FR-073**: System MUST publish a fixed credit cost for every chargeable operation.
- **FR-074**: System MUST verify a sufficient balance before starting chargeable work, and MUST
  report the shortfall rather than starting and failing.
- **FR-075**: System MUST NOT charge for work not delivered, and MUST restore credits when an
  operation fails through platform, provider, or infrastructure fault.
- **FR-076**: System MUST make every credit movement visible to the user, stating what was charged
  or restored, for what, and when.
- **FR-077**: System MUST grant a new account a starting allocation sufficient to audit some but not
  all areas, so the product can be evaluated before purchase.
- **FR-078**: System MUST replenish a paid plan's allocation on each billing renewal by replacing
  the remaining plan allocation rather than adding to it. Unused plan credits MUST expire at
  renewal.
  - System MUST tell the user, before renewal, how many plan credits they are about to lose.
  - Users on a paid plan MUST be able to purchase additional credits outside their plan allocation.
  - Purchased credits MUST NOT expire at renewal or at any other time.
  - System MUST consume plan allocation before purchased credits, so that credits about to expire
    are always spent first.
  - System MUST show plan allocation and purchased credits as distinct balances, and MUST state
    which was drawn against for any given operation.
  - System MUST NOT offer credit purchase on the free allocation, so that the free tier remains an
    evaluation of the product rather than a route around subscribing.
- **FR-079**: System MUST enforce each plan's entitlements — permitted input types, concurrent audit
  limit, queue precedence, and retention period.
- **FR-080**: System MUST allow a user to change or cancel their plan, and MUST keep existing reports
  readable for the lapsed tier's retention period while refusing new audits.
- **FR-081**: System MUST record actual provider cost per operation so that it can be reconciled
  against credits charged.
- **FR-082**: System MUST require a capability to declare its expected consumption, and MUST surface
  a capability whose real consumption persistently exceeds its declaration.

#### Administration

- **FR-083**: Operators MUST be able to view and manage user accounts, their plans, and their
  balances.
- **FR-084**: Operators MUST be able to define and change plan tiers and their entitlements.
- **FR-085**: Operators MUST be able to see revenue, provider cost, and resulting margin per audit,
  per area, and per capability.
- **FR-086**: Operators MUST be able to enable, disable, restrict, add, and remove audit
  capabilities without a product release.
- **FR-087**: Operators MUST be able to configure AI providers and their fallback order.
- **FR-088**: Operators MUST be able to inspect waiting, running, and failed work, and retry or
  cancel individual items.
- **FR-089**: System MUST record every operator action against a user account or the platform
  configuration, attributable to the operator who took it.

#### Data Handling and Retention

- **FR-090**: System MUST store user source only for the duration of the audit, and MUST destroy it
  when the audit ends, including on failure, timeout, and cancellation.
- **FR-091**: System MUST encrypt stored third-party credentials, and MUST NOT reveal them in logs,
  error messages, or AI prompts.
- **FR-092**: System MUST retain reports for the user's plan retention period, and MUST tell the
  user when a report is approaching removal.
- **FR-093**: Users MUST be able to export a report so it outlives their retention period.
- **FR-094**: System MUST treat all audit target content as untrusted, and MUST NOT let it influence
  platform behavior beyond becoming reported findings.

### Key Entities *(include if feature involves data)*

- **User**: An individual with credentials and confirmed identity. Holds email, confirmation state,
  authentication methods, connected third-party identities, operator flag, and connected code
  hosting credentials held encrypted. Owns audits, credit movements, and one subscription.
- **Plan**: A named tier. Defines credit allocation and renewal, permitted input types, concurrent
  audit limit, queue precedence, retention period, and which capabilities are available.
- **Subscription**: A user's current relationship to a plan. Holds status, current billing period,
  and renewal date. Determines entitlements at the moment of each request.
- **Credit Movement**: A single immutable change to a balance. Records direction, amount, reason,
  the operation responsible, and time. Also records which kind of credit moved — plan allocation or
  purchased — because the two have different lifetimes, and for plan allocation the renewal at
  which it expires. A balance is the sum of movements of that kind, never an independently edited
  figure.
- **Target**: Something auditable, owned by a user. Either a web address, a repository reference, or
  an uploaded archive reference. Holds its established level of control — attested or verified —
  together with who attested and when, and for a verified target the method used, the issued token,
  and when verification was last confirmed. Groups audits over time so that progress across audits
  is comparable.
- **Audit**: One execution against a target. Holds requested areas, state, cost quoted and charged,
  timestamps, overall score once known, and whether it was an initial audit or a readiness pass.
  Parent of area results.
- **Area Result**: The outcome for one audit area within one audit. Holds state (complete,
  incomplete, not applicable), score, which capabilities contributed, which were skipped and why,
  and a summary. Parent of issues.
- **Issue**: A single reported problem. Holds severity, title, explanation, consequence, location,
  evidence, attribution (measured or AI judgment), remediation prompt, resolution state, and a
  stable identifier that survives re-auditing so the same problem is recognizable across audits.
- **Verification Attempt**: One narrow re-check of one issue. Holds outcome, evidence captured,
  cost, and time. An issue's history is its ordered verification attempts.
- **Capability**: An installable audit capability. Holds identifier, version, origin, licence, the
  area it serves, whether it measures or interprets, its input needs, declared expected consumption,
  trust level, enabled state, and the tiers it serves.
- **Capability Execution**: One run of one capability within one audit. Holds outcome, duration,
  what it consumed, what it cost, and the findings it produced. The unit that makes cost
  attributable.
- **AI Interaction**: One exchange with an AI provider. Holds provider, model, consumption, latency,
  cost, outcome, and position in the fallback chain.
- **Design Intent**: A user's stated design goals for a target. Holds audience, style preference,
  admired references, brand colors, and whether it was supplied, skipped, or defaulted.
- **Readiness Verdict**: The outcome of a readiness pass. Holds per-area pass or fail against
  threshold, comparison to the original audit, named regressions, go or no-go, and blockers.
- **Operator Action**: One administrative act. Holds actor, action, subject, before and after state,
  and time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from arriving with a web address to reading a delivered
  report in under 10 minutes, unaided, on their first attempt.
- **SC-002**: 90% of audits of a reachable target deliver a complete report with every requested
  area finished.
- **SC-003**: 99% of audits deliver at least a partial report; fewer than 1% end with nothing
  delivered.
- **SC-004**: A user marking one issue fixed receives a verdict in under 30 seconds.
- **SC-005**: A targeted re-check costs no more than 5% of what a full audit costs.
- **SC-006**: 100% of delivered issues carry either measurement evidence or an explicit AI-judgment
  label. No unattributed issue reaches a user.
- **SC-007**: Zero issues turn green without a check passing, verified by adversarial testing in
  which issues are falsely asserted as fixed.
- **SC-008**: Zero users are charged for an operation the platform failed to deliver.
- **SC-009**: Margin is attributable to the individual capability that caused the cost for 100% of
  completed audits.
- **SC-010**: An operator can put a new audit capability in front of customers without a product
  release, in under one hour.
- **SC-011**: Disabling any single capability leaves every audit still able to complete.
- **SC-012**: Complete unavailability of a single AI provider does not prevent any audit from
  delivering a report.
- **SC-013**: 70% of users who receive a report with at least one critical or high issue resolve at
  least one of them.
- **SC-014**: 30% of users who resolve their first issue go on to reach a readiness verdict.
- **SC-015**: Zero audits retain user source after ending, verified by inspection following normal
  completion, failure, timeout, and cancellation.
- **SC-016**: Zero secrets found in user source or markup appear in provider-bound content, verified
  by adversarial testing with planted credentials.
- **SC-017**: Zero unreviewed capabilities reach platform data, credentials, or network, verified by
  installing a capability that deliberately attempts each.
- **SC-018**: Attempts to audit private, loopback, link-local, or metadata addresses are refused in
  100% of cases, including via redirect and via address forms designed to evade checks.
- **SC-019**: The platform sustains its published concurrent audit capacity without any audit
  exceeding its maximum permitted duration.
- **SC-020**: Fewer than 5% of delivered issues are reported by users as inaccurate or not
  reproducible.
- **SC-021**: Zero load-generating checks execute against a target whose control has not been
  verified, tested adversarially by requesting one against an attested-only target, a target whose
  verification token was removed after issue, and a target verified by another account.
- **SC-022**: Zero purchased credits are lost at a billing renewal, and zero operations draw
  purchased credits while plan credits remain.

### Credit Cost Schedule

Resolves the constitution's `TODO(CREDIT_PRICE_TABLE)`. Credits are the single internal unit for
all chargeable work.

| Operation | Credits |
| --- | --- |
| Performance area | 20 |
| Security area | 20 |
| Design area | 25 |
| Testing area | 20 |
| Search visibility area | 10 |
| All five areas, bundled as a full audit | 80 |
| Targeted re-check of one issue | 3 |
| Production readiness pass | 60 |
| Documentation generation | 10 |

The five areas total 95 credits bought individually against 80 bundled, so a full audit is always
the cheapest route to complete coverage. A targeted re-check at 3 credits is under 4% of a full
audit, satisfying FR-062 and SC-005. The readiness pass is discounted below a full audit despite
doing equivalent work, because reaching it is the behaviour the product exists to produce.

### Plan Tiers and Entitlements

Resolves the constitution's `TODO(PLAN_TIERS)`.

| | Free | Starter | Pro | Business |
| --- | --- | --- | --- | --- |
| Plan credits | 50, once | 300 monthly | 1,200 monthly | 4,000 monthly |
| Plan credits expire at renewal | n/a | Yes | Yes | Yes |
| Purchase extra credits (never expire) | No | Yes | Yes | Yes |
| Live web address | Yes | Yes | Yes | Yes |
| Uploaded archive | No | Yes | Yes | Yes |
| Connected repository | No | No | Yes | Yes |
| Load generation checks (needs verified control) | No | No | Yes | Yes |
| Readiness pass | No | Yes | Yes | Yes |
| Concurrent audits | 1 | 1 | 3 | 6 |
| Queue precedence | Lowest | Normal | High | Highest |
| Report retention | 7 days | 30 days | 12 months | 24 months |
| Operator-installed custom capabilities | No | No | No | Yes |

The free allocation of 50 credits is deliberately below the 80 needed for a full audit. A new user
can audit two or three areas of their choosing and see real findings, but reaching complete coverage
requires a plan. This is the intended conversion mechanism, not an oversight.

## Assumptions

- **Single-user accounts.** Each account belongs to one person. Shared workspaces, seats, and
  role delegation beyond the operator distinction are out of scope for this baseline, though the
  entity model above keeps ownership on a user so that a workspace owner can be introduced later
  without restructuring.
- **Two kinds of credit, with different lifetimes.** Plan allocation expires at renewal; purchased
  credits do not (FR-078). Consumption draws plan allocation first. This bounds the liability
  carried on subscriptions while giving heavy users a route that is not a forced tier upgrade, and
  it means a balance is never a single number — every balance shown is two figures.
- **Monetary price points are provisional.** The tier table above fixes credits and entitlements,
  which are product decisions. The currency amounts attached to each tier are a commercial decision
  outside this specification.
- **English only.** Reports, remediation prompts, and interface text are English for this baseline.
- **Public pages only; no credential custody.** Audits address publicly reachable pages. This
  baseline does not accept user credentials, session tokens, or any other means of reaching content
  behind a sign-in, and the platform is therefore never a custodian of customer access. Checks that
  can only produce a meaningful result past a sign-in MUST report as not applicable under FR-021,
  not as passing. This is a deliberate trade: it thins the testing area and part of the security
  area, and it is the reason no requirement here describes a signed-in audit. Authenticated
  auditing is a later feature with its own specification, not an extension of this one.
- **The user has an AI coding assistant.** Remediation prompts are written to be pasted into a
  capable coding agent. The product does not apply fixes itself, and this baseline does not open
  pull requests against user repositories.
- **One target per audit.** Audits address a single page or project, not an entire site crawl.
  Multi-page crawling is a later extension.
- **Severity thresholds are published and fixed.** The per-area scores required for a go verdict
  are published to users in advance rather than being determined per audit.
- **Retention counts from audit completion.** A report's retention period begins when its audit
  finishes, not when it was last opened.
- **Provider cost is knowable per operation.** Reconciling margin per capability assumes AI
  providers report consumption per request. Where a provider does not, cost is attributed by
  measured consumption at published rates.
- **The persistence data model is resolved conceptually here, not physically.** The Key Entities
  section above resolves the constitution's `TODO(DATA_MODEL)` at the level a specification can
  own: what exists, what it holds, and how it relates. Tables, keys, indexes, and migrations are
  design decisions belonging to `/speckit-plan`.
- **The sandbox mechanism is deliberately not resolved here.** The constitution's
  `TODO(SANDBOX_MECHANISM)` asks which isolation technology replaces the forbidden one. That is an
  implementation choice, and naming a technology in a specification would violate both this
  template's rules and the specification's own altitude. FR-027, FR-028, and FR-029 instead fix the
  properties any acceptable mechanism must deliver, and SC-017 makes them adversarially testable.
  The mechanism itself belongs to `/speckit-plan`.

## Resolved Clarifications

Three decisions had no safe default and materially changed scope, exposure, or the funnel. All were
resolved on 2026-08-23 and are now folded into the requirements above.

- **Q1 — Proof of control before checks that act against a target.** *Resolved: two-level gate.*
  An explicit authorisation attestation unlocks observation and ordinary-volume probing, including
  authentication and rate-limiting behaviour. Deliberately generating load beyond ordinary volume
  additionally requires demonstrated control, by publishing a system-issued token as a file on the
  target or as a DNS record. Level 1 probing is rate-bounded regardless of attestation, so a false
  attestation cannot itself cause harm. See FR-017; Target entity carries the control state.
- **Q2 — Auditing behind a sign-in.** *Resolved: out of scope for this baseline.* The platform
  accepts no credentials or session tokens and is never a custodian of customer access. Checks that
  need a signed-in session report as not applicable under FR-021. Authenticated auditing is a later
  feature with its own specification. Recorded in Assumptions.
- **Q3 — Credit expiry and purchased credits.** *Resolved: plan allocation expires at renewal;
  purchased credits do not.* Consumption draws expiring plan allocation first. Purchase is
  available on paid plans only, keeping the free allocation an evaluation rather than a route around
  subscribing. See FR-078; Credit Movement carries the kind and the expiry.
