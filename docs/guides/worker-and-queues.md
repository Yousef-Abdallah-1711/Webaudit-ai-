# Worker and Queues

`apps/worker/src/index.ts` boots BullMQ consumers. Orchestration and module-runner code execute named scan phases, deterministic capabilities, AI interpretation, persistence, realtime emission, re-verification, and readiness work. Queue constants and job options are centralized in `packages/config/src/queues.ts`.

The worker persists progress before publishing it. Module failures can degrade one audit area without discarding deterministic findings. Cancellation and timeouts propagate through explicit lifecycle handling; recovery must preserve the credit/refund and duplicate-work guarantees.
