# AI Interpretation, Redaction, and Metering

## Overview

AI explains deterministic measurements; it does not choose checks or create findings. Calls are single-shot, schema-validated, redacted, and recorded with provider cost/latency/token information.

## Source and flow

`packages/ai-executor/` owns providers, chain validation/fallback, pricing, records, and output validation. `packages/redaction/` creates branded redacted prompts. Module prompts are in `apps/worker/src/prompts/`; the caller is `apps/worker/src/module-runner/ai-layer.ts`, with final synthesis in `orchestrator/master-report.ts`. `AiInvocation` and `CapabilityExecution` persist metering.

## Security and verification

Trusted instructions and untrusted labelled segments remain separate. Schema failure advances the configured provider chain; exhaustion degrades an area. Run executor chain/schema/pricing tests, redaction adverse tests, prompt snapshots, and worker provider-exhaustion/prompt-injection tests with fixture mode.
