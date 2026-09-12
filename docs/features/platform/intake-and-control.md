# Targets, Control Proof, and Intake

## Overview

Users submit URL, GitHub repository, or ZIP targets for audit. The API must establish the target’s required control level before it quotes or creates work.

## Source and flow

Control logic is in `apps/api/src/services/control-gate/` and `apps/api/src/routes/targets.routes.ts`. Intake is in `apps/api/src/services/intake/`, `apps/api/src/routes/intake.routes.ts`, and `apps/worker/src/intake/`; ZIP processing uses `packages/safe-archive/`. The UI starts at `apps/web/components/scan/InputTabs.tsx`. Accepted source material is staged, validated, and linked to `Target`/`TargetVerification`/`Scan` state.

## Edge cases and verification

Malformed archives, revoked repositories, unsafe target access, and inadequate control proof reject work before execution. Use intake/upload/source-materialisation/control-gate API and worker tests; archive guarantees live in `packages/safe-archive/tests/adverse/`.
