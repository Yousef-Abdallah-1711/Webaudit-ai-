/**
 * T125 — the shared conformance suite, run against all six real T119-124
 * capabilities.
 *
 * **Reads each capability's real `capability.manifest.json` off disk**
 * rather than hand-writing one per capability in this file — the whole
 * point of `manifest-valid` is to catch code and manifest drifting apart,
 * and a hand-copied manifest here would only ever agree with itself.
 *
 * **A real fixture server, not `refusingContext`.** `apps/worker/tests/
 * helpers/stub-registry.ts`'s `refusingContext` makes every door throw,
 * which is correct for testing a capability's *containment* but means
 * `runCodeLayer` always rejects and `fingerprint-stable` always skips
 * (zero findings both runs) rather than genuinely exercising fingerprint
 * stability against real findings. `deficient-site.ts` serves one page
 * missing everything these six capabilities check for, so every capability
 * but `data-leak-scanner` (which legitimately finds nothing on a page with
 * no secret-shaped text) gets real findings to compute a stable fingerprint
 * from.
 *
 * **T136-142 addendum.** `createCodeLayerContext` below is built with no
 * `pageProvider`, matching the orchestrator's own current state (no
 * cross-process browser-pool transport is wired anywhere yet — see
 * `capability-loader.ts`'s note). Against this fixture specifically,
 * `cwv-analyzer` (needs a real render for Core Web Vitals),
 * `network-inspector` (the fixture page references only one same-origin
 * `<img>`, and image references are excluded from its compression/broken
 * checks by design), and `playwright-runner` (the fixture page has no
 * `<a href>` tags at all) each legitimately produce zero findings — a
 * documented, legal `fingerprint-stable` skip, same as `data-leak-scanner`'s.
 * `lighthouse-analyzer` (missing Content-Encoding/Cache-Control headers) and
 * `screenshot-capture` (the fixture's one `<img>` resolves to HTML, not a
 * decodable image) still get real, deterministic findings from their
 * `ctx.fetch`-only checks even with no page available. `impeccable` has no
 * code layer at all, so every behavioural check but `contract-shape`/
 * `manifest-valid`/`can-run-has-no-side-effects` skips structurally.
 * `contradiction-detector` gets a real finding from the deliberately
 * inconsistent `priorModuleResults` sample below.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCodeLayerContext, runConformanceSuite } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { startDeficientSite, type FixtureSite } from './fixtures/deficient-site.js';
import { createDeficientSource, type FixtureSource } from './fixtures/deficient-source.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

interface CapabilityUnderTest {
  readonly dir: string;
  readonly load: () => Promise<{ default: AuditCapability }>;
  /**
   * T175-T177 read the scan workspace rather than the served page. Handing them
   * the URL-only input every other capability gets would make `runCodeLayer`
   * reject on the first `ctx.readFile` — `throwing-is-contained` would pass
   * (a rejection is contained) while `fingerprint-stable` failed, and the
   * failure would say nothing about the capability. They get a real temporary
   * workspace and a real confined context instead.
   */
  readonly sourceBacked?: true;
}

const CAPABILITIES: readonly CapabilityUnderTest[] = [
  { dir: 'headers-checker', load: () => import('@webaudit/capability-headers-checker') },
  { dir: 'ssl-analyzer', load: () => import('@webaudit/capability-ssl-analyzer') },
  { dir: 'data-leak-scanner', load: () => import('@webaudit/capability-data-leak-scanner') },
  { dir: 'owasp-checker', load: () => import('@webaudit/capability-owasp-checker') },
  { dir: 'meta-checker', load: () => import('@webaudit/capability-meta-checker') },
  { dir: 'content-checker', load: () => import('@webaudit/capability-content-checker') },
  { dir: 'lighthouse-analyzer', load: () => import('@webaudit/capability-lighthouse-analyzer') },
  { dir: 'network-inspector', load: () => import('@webaudit/capability-network-inspector') },
  { dir: 'cwv-analyzer', load: () => import('@webaudit/capability-cwv-analyzer') },
  { dir: 'screenshot-capture', load: () => import('@webaudit/capability-screenshot-capture') },
  { dir: 'impeccable', load: () => import('@webaudit/capability-impeccable') },
  { dir: 'playwright-runner', load: () => import('@webaudit/capability-playwright-runner') },
  {
    dir: 'contradiction-detector',
    load: () => import('@webaudit/capability-contradiction-detector'),
  },
  {
    dir: 'dependency-scanner',
    load: () => import('@webaudit/capability-dependency-scanner'),
    sourceBacked: true,
  },
  {
    dir: 'bundle-analyzer',
    load: () => import('@webaudit/capability-bundle-analyzer'),
    sourceBacked: true,
  },
  { dir: 'css-analyzer', load: () => import('@webaudit/capability-css-analyzer'), sourceBacked: true },
];

let fixture: FixtureSite;
let source: FixtureSource;

beforeAll(async () => {
  fixture = await startDeficientSite();
  source = await createDeficientSource();
  // ctx.fetch runs through the real, guarded safeFetch — a loopback fixture
  // needs the same allowlist T109's e2e spec uses, scoped to this process.
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
});

afterAll(async () => {
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
  await fixture.close();
  await source.close();
});

describe.each(CAPABILITIES)('conformance: $dir', ({ dir, load, sourceBacked }) => {
  it('passes every conformance check', async () => {
    const capability = (await load()).default;
    const rawManifest: unknown = JSON.parse(
      await readFile(`${HERE}../${dir}/capability.manifest.json`, 'utf8'),
    );

    const input: CapabilityInput = {
      targetUrl: `${fixture.origin}/`,
      ...(sourceBacked === true ? { code: source.tree } : {}),
      // A deliberately inconsistent sample so `contradiction-detector`
      // (T142) has something real to find: SECURITY here reports a CRITICAL
      // worst severity under a near-perfect score, which is exactly the
      // shape `contradiction.high-score-despite-severe-finding` exists to
      // catch. The other six capabilities in this suite ignore
      // `priorModuleResults` entirely, so enriching it here does not change
      // their behaviour.
      priorModuleResults: {
        SECURITY: { state: 'COMPLETE', score: 95, findingCount: 1, worstSeverity: 'CRITICAL' },
      },
      controlLevel: 'NONE',
    };

    const report = await runConformanceSuite(capability, {
      makeContext: (signal) =>
        createCodeLayerContext({
          signal,
          capabilityId: capability.id,
          ...(sourceBacked === true ? { workspaceRoot: source.root } : {}),
        }),
      input,
      rawManifest,
      timeoutMs: 5_000,
      abortGraceMs: 1_000,
    });

    const failed = report.results.filter((result) => !result.passed && !result.skipped);
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
    expect(report.passed).toBe(true);
  });
});
