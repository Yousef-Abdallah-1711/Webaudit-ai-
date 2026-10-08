# Execution-Class Contract Template

Per Constitution Principle XIV, every future execution engine or capability category MUST declare
the following before its owning child spec may proceed to `/speckit-plan`. This template is the
enforcement artifact — a child spec's author fills in every field; a reviewer blocks the spec at
`/speckit-checklist` if any field is missing. The nine classes already filled in for the current
planning pass are in `plan.md`'s Execution-Class Matrix; this file is the reusable template for
any further class a future child spec proposes.

```markdown
## Execution Class: <NAME>

- **Trust boundary**: <passive / browser-rendered / untrusted-code-execution / adversarial / other, named class>
- **Input**: <what this class consumes>
- **Output**: <what this class produces>
- **Statefulness**: <stateless-per-call | stateful, and what state>
- **Expected duration**: <range, e.g. seconds / minutes / tens of minutes / hours>
- **Isolation requirement**: <process-level | container/VM-grade | none needed, and why>
- **Network requirement**: <none | SSRF-guarded fetch | scoped/allowlisted | explicit minimal egress>
- **Credential requirement**: <none | target-testing credential (CredentialBinding) | platform-integration credential>
- **Required Authorization level**: <one of the FR-004 placeholder levels, or a justified new one>
- **Permitted Environment classifications**: <which TargetEnvironment values this class may run against, and under what additional grant for production, if any>
- **Queue / runtime placement**: <existing scan-phase queue | a new dedicated queue, and why>
- **Evidence types produced**: <from the Evidence contract's `kind` enum, or a justified addition>
- **Finding-identity strategy**: <confirm it uses the existing fingerprint mechanism; no new scheme>
- **Cost / metering model**: <flat per domain | metered, and on what dimension, per FR-020's narrow-scope rule>
- **Reverify strategy**: <which of FR-018's reverify classes it fits, or a new one, justified>
- **Retention requirements**: <default to report-retention parity per the 2026-10-07 Clarifications, or justify a deviation>
- **Observability requirements**: <what an operator must see, and confirmation no customer secret/payload is exposed>
- **Cancellation semantics**: <what "stop" actually stops for this class — queued work, an open session, in-flight generation, a running execution environment>
```

A child spec that submits this template with any field marked "TBD" or left blank is incomplete
per Constitution Principle XIV and MUST NOT proceed past `/speckit-plan` until every field is filled.
