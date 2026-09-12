# Capability Registry and Sandbox Isolation

## Overview

Capabilities are the product’s pluggable audit checks. Core code discovers them through contracts rather than importing individual implementations; installed code runs outside the API/worker process.

## Source and flow

The contract, manifests, discovery, containment, and conformance suite live in `packages/capability-sdk/`; vendored checks live in `packages/capabilities-vendored/`. Registry services are `apps/api/src/services/registry/` and the admin upload service, with worker loading in `apps/worker/src/orchestrator/capability-loader.ts`. Installed dispatch is hosted by `apps/sandbox-runner/src/`.

## Boundaries and verification

Manifests are validated, calls are timeout-contained, and installed capabilities have bounded isolation without credentials or egress. Run conformance, installed-capability, sandbox escape/limit/deployment, and capability failure tests.
