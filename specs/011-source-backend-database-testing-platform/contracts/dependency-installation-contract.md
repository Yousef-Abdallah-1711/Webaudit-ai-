# Contract: Dependency Installation

Per FR-062 through FR-069 (FR-067 lifecycle scripts and native binaries included; with FR-042, FR-043, FR-046, FR-065, FR-066). This contract is the authority for the dependency proxy rules; `research.md` R9 and `plan.md` P1 conform to it. Installing dependencies is code execution: package-manager
hooks, lifecycle scripts and repository configuration can run arbitrary code. Consumers: untrusted-execution-contract
(phases 4-6), command-policy (`node.install.*`), build-typecheck, source-evidence (DEPENDENCY observations), Source Checks.

## Signature (shape, not final TypeScript)

```text
inspectDependencies(snapshot) -> DependencyPlan            // P0, trusted side, pure, no network, no execution
DependencyPlan = { manager: npm|pnpm|yarn-classic|yarn-berry, managerVersion, lockfile{path,format,version},
  packages[{name,version,resolvedUrl,integrity,hasInstallScript,sourceKind}], refused[{name,sourceKind,reason}],
  observations[], allowlist: AllowlistEntry[], estimatedBytes }
AllowlistEntry = { url (exact), integrity, bytes? }
proxyPolicy(runId, allowlist) -> ProxyHandle               // EP edge, populated by trusted side
```

## Inputs

Snapshot manifest, `package.json` files and lockfile (parsed as data), the signed image's pinned package-manager
versions, the public-registry host allowlist (code-level config).

## Outputs

`DEPENDENCY` evidence (static observations), `EXECUTION_STEP_RESULT` for `node.install.*`, install log Artifact,
proxy access log (allowed/denied URLs, bytes) as evidence, network-cut verification result.

## Ownership

P0 and allowlist derivation: trusted Supervisor side. P1: Guest agent running the image-pinned manager under proxy
policy enforced by the EP edge. Probe and integrity re-check: Supervisor. Customer owns only lockfile content.

## Invariants

Phases (FR-063):

| Phase | Who | Network | Scripts | Output |
|-------|-----|---------|---------|--------|
| P0 static inspection | trusted worker/E12 child | none | none | `DependencyPlan`, observations, refusals |
| P1 fetch/install | Guest, pinned manager | proxy to exact allowlisted URLs only (no metadata exception, no cache) | disabled | `node_modules` in scratch |
| P2 lifecycle scripts | none in v1 | n/a | disabled by default | `REQUIRES_LIFECYCLE_SCRIPTS` |
| P3 build + type-check | Guest | cut, probe-verified | none | step results |
| P4 tests | Guest | cut | none | test results |

1. Lockfile required for execution; absent means `NO_LOCKFILE`, dependent Steps `NOT_TESTED`. Installs are frozen; no
   floating range, `latest`, or lockfile regeneration is ever performed (FR-064). A lockfile out of sync with `package.json`
   is `LOCKFILE_OUT_OF_SYNC`, detected statically in P0 and by the frozen-install exit.
2. Supported lockfiles for EXECUTION (the set VERIFIED against real lockfiles on 2026-10-10, see "Lockfile verification record"): npm `package-lock.json` `lockfileVersion` 3; pnpm `pnpm-lock.yaml` `lockfileVersion` '9.0'; yarn classic `yarn.lock` v1 (`# yarn lockfile v1`). Every other format or version (npm lockfile v1/v2, pnpm 5-8, any yarn variant) is BLOCKED for execution pending verification against representative fixtures: it yields `UNSUPPORTED` with reason `UNSUPPORTED_VERSION` and never runs; static analysis is unaffected. `npm-shrinkwrap.json` is treated as an npm lockfile. **Yarn berry is analysis-only in v1** (static P0 inspection works; execution is `UNSUPPORTED`) because its `checksum` is computed over Yarn's repacked archive, not the registry tarball, so neither exact-URL derivation nor the supervisor's recompute-and-compare integrity check is possible. Others (bun, Plug'n'Play linker) are `UNSUPPORTED`. Per-format derivation of the allowlist entry (verified against real lockfiles for the supported set above): npm v2/v3 = `resolved` + `integrity`; yarn classic = `resolved` (with its `#sha1` fragment) + `integrity` when present, else `MISSING_INTEGRITY`; pnpm = the public-registry tarball URL derived from the registry convention `https://registry.npmjs.org/<name>/-/<basename>-<version>.tgz` plus the `integrity` recorded in the lockfile (pnpm lockfiles normally omit `tarball`), and a `tarball` entry that is present must itself match that convention or the package is `UNSUPPORTED_DEPENDENCY_SOURCE`.
3. Package managers come only from the signed image; repo-supplied binaries and config are neutralized (FR-065):

| Manager | Repo-supplied vector | Neutralization |
|---------|----------------------|----------------|
| npm | project `.npmrc` (registry, `script-shell`, `ignore-scripts=false`, `onload-script`) | `--userconfig`/`--globalconfig` point to platform file, `--no-workspaces-update`; project `.npmrc` excluded from snapshot (FR-009) and registry forced |
| pnpm | `.pnpmfile.cjs`, `pnpm-workspace` hooks, `.npmrc` | `--ignore-pnpmfile`, `--ignore-scripts`, `--config.manage-package-manager-versions=false`, forced `registry` |
| yarn classic | `.yarnrc` `yarn-path`, `.yarnrc` registry | `--ignore-scripts`, `--use-yarnrc <platform file>`, `YARN_IGNORE_PATH=1`, `--frozen-lockfile` |
| yarn berry | `.yarnrc.yml` `yarnPath`, `plugins`, `npmRegistryServer`, `enableScripts` | `YARN_IGNORE_PATH=1`, `YARN_ENABLE_SCRIPTS=false`, `YARN_NPM_REGISTRY_SERVER` forced, repo `.yarnrc.yml` replaced by platform file; `plugins`/`yarnPath` present means `EXECUTABLE_CONFIG_PRESENT` and refusal to run that manager config |

   `packageManager` field version outside the image set is `UNSUPPORTED_VERSION` (substitution only if recorded as `TOOLCHAIN_SUBSTITUTED`).
4. Allowlist proxy algorithm (FR-066), deny-by-default at the EP edge:
   a. For each lockfile entry derive `{resolved URL, integrity}`; normalize URL (scheme `https`, lowercase host, no userinfo,
      no fragment, canonical path). An entry lacking `resolved` is `UNSUPPORTED_DEPENDENCY_SOURCE`; an entry that has
      `resolved` but lacks an integrity hash is `MISSING_INTEGRITY` (`NOT_TESTED` for the dependent Steps; it is never
      fetched unverified and never defaulted).
   b. Host must be in the public-registry allowlist (npm registry, and yarn registry mirror host) for the entry to be admitted
      to the set; otherwise refused. The host list admits entries only; it never permits traffic by itself.
   c. Build the exact-URL set; the proxy is deny-by-default and permits ONLY `GET` of those exact URLs. There is NO
      metadata-path exception and no widened allowlist: an installer that needs registry metadata (packument/resolution
      requests) under `--frozen` fails, and the result is `LOCKFILE_OUT_OF_SYNC` (lockfile insufficient for a frozen
      install) or `UNSUPPORTED_DEPENDENCY_SOURCE` (source form requires resolution), never a wider allowlist. Everything
      else returns 403 and is logged.
   d. Redirects: the proxy does not follow a redirect blindly. A registry 3xx is followed only if its target URL is itself
      on this run's exact-URL allowlist (re-validated on every hop); otherwise it is denied (403, logged, `NETWORK_BLOCKED_BY_POLICY`).
   e. Cumulative bytes capped at 1 GiB (`RESOURCE_LIMIT_EXCEEDED`); allowlist entries are removed at teardown.
   g. Mechanism: an exact-URL policy over HTTPS cannot be enforced by a CONNECT/SNI allowlist (it cannot see paths). The proxy is therefore a TLS-terminating REVERSE MIRROR: the Guest is configured with a per-run CA, the Guest resolver is pinned to the proxy address (no other DNS answers), the manager's registry configuration is forced to the mirror, there is NO CONNECT or forward-proxy mode, request headers are normalized to a fixed set (everything else, including cookies and custom headers, is dropped so headers cannot carry data to the registry), and any request that would resolve to a non-public address is refused. Fixture `proxy-bypass-matrix` covers CONNECT, redirect-to-other-host, header smuggling, DNS rebinding and IP-literal hosts.
   f. No cache. There is no cross-run and no cross-tenant tarball, metadata or build cache at the proxy or anywhere else
      (FR-042, FR-046): every run fetches fresh from the registry, so a hit/miss timing channel cannot reveal another tenant's
      dependency set. Per-run bytes are held only in the run's own scratch and destroyed with the Guest.
5. Refused dependency sources (any means `UNSUPPORTED_DEPENDENCY_SOURCE`, never a customer finding): `git+`/`github:` specifiers,
   tarball URLs not matching the registry pattern, `file:`, `link:`, `portal:`, `workspace:` outside the snapshot, and private
   or custom registries (credentials are SPEC 012). Workspace-internal `workspace:*` links resolved inside the snapshot are permitted.
6. Lifecycle scripts: `--ignore-scripts` always; a package whose `hasInstallScript` is true and that is known to require it
   (image-maintained list) makes dependent Steps `NOT_TESTED` with `REQUIRES_LIFECYCLE_SCRIPTS`; other install-script packages are recorded as observations.
7. Native/Prisma rule: the image bakes Prisma query/schema engines for supported majors, needed only for Prisma client
   generation (type-check and backend runs); the Prisma version from the lockfile outside that range yields
   `PRISMA_ENGINE_UNAVAILABLE`, `NOT_TESTED`, for those Steps only. SQL migration application (psql) does not use the engine. Other native binaries not derivable from the lockfile: `NOT_TESTED` with a specific reason.
8. Integrity: the package manager verifies hashes; the Supervisor additionally recomputes the SHA-512/SHA-1 of each fetched
   object from the proxy log and compares with the lockfile; mismatch is `INTEGRITY_MISMATCH`, run aborted; if the Guest tampered the signal is recorded as `SANDBOX_POLICY_VIOLATION` and the outcome is `CONTAINMENT_ABORT`.
9. Dependency-confusion observation (static, FR-068): a scoped or internal-looking name that resolves from the public
   registry while a workspace/private marker exists, unpinned ranges, git deps, install scripts present, are emitted as `DEPENDENCY` observations.
10. Network cut before P3/P4 (FR-063): the EP swaps the host network policy to deny-all outside the Guest, acknowledges it, and the
    Supervisor runs a probe (connect to the proxy, a public IP, DNS, metadata IP from inside via the host agent) expecting all to fail; no P3 customer Step starts until the probe passes.
11. Missing dependency vs failed build (FR-069): refusals, absent lockfile, unsupported source, script-required, engine-unavailable and proxy-denied fetches map to `NOT_TESTED`/`UNSUPPORTED`/`BLOCKED`, never `FINDING`.

## Lockfile verification record (2026-10-10, structure only, read-only; no contents recorded)

| Format | Real fixtures examined | Result |
|---|---|---|
| pnpm `lockfileVersion` '9.0' | 1 repository lockfile, 812 `resolution:` entries | 812/812 are exactly `resolution: {integrity: sha512-...}`; 0 `tarball` entries; 0 git or directory resolutions. Confirms that the tarball URL must be derived from the registry convention and that `integrity` is always present. |
| npm `lockfileVersion` 3 | 6 lockfiles, 3 539 package entries | 3 537 have `resolved` + `integrity` (100% of those with `resolved`); 3 537/3 537 match `https://registry.npmjs.org/<name>/-/<basename>-<version>.tgz` including scoped names; 0 non-registry hosts, 0 git, 0 links; 2 entries (one in each of two lockfiles) have no `resolved` and therefore take the `UNSUPPORTED_DEPENDENCY_SOURCE` path by rule. |
| yarn classic v1 | 1 lockfile, 906 blocks | 905/905 `resolved` entries have `integrity`; 0 carry a `#sha1` fragment; 905/905 on `registry.npmjs.org` matching the same URL convention. The older-format case (no `integrity`, `#sha1` fragment) was NOT observed; the rule (`MISSING_INTEGRITY`, `NOT_TESTED`) is the safe default and stays unverified. |

NOT verified, therefore blocked for execution: npm lockfile v1/v2; pnpm 5-8; yarn berry (also analysis-only by design); any lockfile with git/tarball/file/link/workspace-protocol dependencies (refused by rule); private registries. The fetch behavior of each package manager against the derived URLs (that pnpm and yarn request exactly the derived URL) is established only by structure here; it is proven by the `proxy-bypass-matrix` and the new lockfile-derivation fixtures (tasks T345-T346) before activation. Support for a blocked format is added only by an additive amendment that cites a passing fixture.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|-----------|-------------|--------------|---------|
| No lockfile | `NO_LOCKFILE` | none | `NOT_TESTED` |
| Git/tarball/file/link/private registry | `UNSUPPORTED_DEPENDENCY_SOURCE` | none | `UNSUPPORTED` |
| Needs lifecycle script | `REQUIRES_LIFECYCLE_SCRIPTS` | none | `NOT_TESTED` |
| Prisma engine not baked | `PRISMA_ENGINE_UNAVAILABLE` | none | `NOT_TESTED` |
| Allowlist denial of a needed URL, or a redirect to a non-allowlisted URL | `NETWORK_BLOCKED_BY_POLICY` | none | `NOT_TESTED` (not a code defect) |
| Lockfile entry with `resolved` but no integrity | `MISSING_INTEGRITY` | none | `NOT_TESTED` |
| Lockfile format or version outside the verified set (npm v1/v2, pnpm 5-8, ...) | `UNSUPPORTED_VERSION` | none | `UNSUPPORTED` (execution blocked pending fixture verification; static analysis still runs) |
| Yarn berry project, execution requested | `UNSUPPORTED_DEPENDENCY_SOURCE` | none | `UNSUPPORTED` (static analysis still runs) |
| Frozen install needs registry metadata not in the lockfile | `LOCKFILE_OUT_OF_SYNC` / `UNSUPPORTED_DEPENDENCY_SOURCE` | none | `NOT_TESTED` / `UNSUPPORTED` |
| Run envelope exhausted before install starts | `RUN_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` |
| Download cap | `RESOURCE_LIMIT_EXCEEDED` | none (measured) | `INCONCLUSIVE` |
| Install wall limit | `TIMED_OUT` | none (measured) | `INCONCLUSIVE` |
| Network cut not verified | `NETWORK_CUT_UNVERIFIED` | `ENGINE_DEFECT` | `BLOCKED`, Guest destroyed |
| Registry outage while fetching | none | `TRANSIENT_INFRASTRUCTURE` | `BLOCKED`; provisioning retry only before customer Steps |
| Integrity mismatch | `INTEGRITY_MISMATCH` | `CUSTOMER_CODE_FAILURE` only on tamper evidence (signal flag `SANDBOX_POLICY_VIOLATION`, abort `CONTAINMENT_ABORT`) | `BLOCKED` |

## Safety

Install never runs customer-authored scripts in v1; the manager runs with an empty secret environment, no project
config, and only the proxy as a route. A second tenant never sees another tenant's `node_modules` or proxy log, and no package bytes are cached across runs.

## Idempotency

`inspectDependencies` is pure per snapshot digest; allowlist derivation is deterministic; `node.install.*` step key is
`H(executionUnitId, attempt, stepIndex)`; the proxy policy is create-or-replace per `runId`.

## Consumers

untrusted-execution-contract, command-policy-contract, build-typecheck-contract, Source Checks in `AUTOMATED_TESTS`/`SOURCE_QUALITY`.

## Non-negotiable boundary rules

1. Never resolve a version, regenerate a lockfile, or contact a URL not derived exactly from the lockfile.
2. Never run a repo-supplied package-manager binary, hook, plugin or registry setting.
3. Never run lifecycle scripts by default; no tenant or grant may enable them in v1.
4. No customer-code Step in P3/P4 starts before the network-cut probe passes.
5. A dependency limitation is never reported as a build or test failure of the customer's code.
6. Never widen the allowlist for metadata, follow a redirect to a non-allowlisted URL, or cache package bytes across runs or tenants.
