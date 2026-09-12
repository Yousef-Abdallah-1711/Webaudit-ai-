# Security Boundaries

HTTP, queue, capability, and AI boundaries validate their inputs. Safe network access performs SSRF checks across connections; archive handling enforces path, ratio, and byte limits. Prompts are redacted and separate trusted instructions from untrusted labelled segments.

Installed capabilities execute only in `apps/sandbox-runner`, with bounded/killable isolation and without credentials or egress. Privileged actions are authorized server-side; realtime subscriptions are authorized per subscription. Cleanup is required on success, failure, timeout, and cancellation.
