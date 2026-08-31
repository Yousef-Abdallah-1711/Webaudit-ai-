/**
 * T245 — the design-adherence gate has to be able to fail.
 *
 * `pnpm run lint:adherence` was `oxlint -c design-system/_adherence.oxlintrc.json
 * apps/web` before this task touched anything, and it already reported clean —
 * 0 warnings on 23 files. That was never a passing gate; it was a silent one.
 * `no-restricted-syntax`, `no-restricted-imports`, and `react/forbid-elements`
 * — the only three rules the vendored config uses — are not in oxlint
 * 0.13.2's implemented rule set (`oxlint --rules` lists what is; none of the
 * three appear). oxlint does not error on an unrecognised rule, it silently
 * drops it, so the gate could not have failed no matter what shipped.
 *
 * This suite runs ESLint's real Node API against `eslint.config.js` — the
 * same engine `pnpm run lint:code` invokes — and proves both directions:
 * known-bad code is flagged, and the components this session already shipped
 * are not.
 *
 * **Why these are real files, briefly written to disk and deleted, rather
 * than `lintText` against a synthetic path.** Tried that first. It fails
 * everything with a parser error — "was not found by the project service" —
 * because the adherence rules sit in the same config block as
 * `tseslint.configs.recommendedTypeChecked`, whose parser needs a file
 * TypeScript's project service can actually resolve. A path that does not
 * exist on disk cannot be resolved, so the file never parses and *no* rule
 * runs, adherence or otherwise — which would have made this suite pass by
 * every fixture failing to parse rather than by any rule catching anything.
 *
 * **Why these are flat files directly under `apps/web/app/`, not in a fresh
 * subdirectory.** Tried `mkdtemp` first, for the usual reason — isolation,
 * no risk of two runs colliding. That failed too, with the identical "not
 * found by the project service" error, even though the file genuinely
 * existed on disk and genuinely matched `tsconfig.json`'s `app/**\/*.tsx`.
 * The project service does not appear to pick up a brand-new *directory*
 * created after it starts, only a new file inside a directory it already
 * knows about. A flat file directly in `app/` — a directory the project
 * service is already watching — resolves correctly. Each fixture therefore
 * gets a random flat filename, and `afterEach` removes exactly the files
 * this run created.
 */
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const APP_DIR = join(REPO_ROOT, 'apps', 'web', 'app');

const written: string[] = [];

afterEach(async () => {
  await Promise.all(written.splice(0).map((path) => rm(path, { force: true })));
});

/**
 * Writes a real, disk-resident, tsconfig-covered fixture and lints it.
 *
 * No leading dot in the filename: `tsconfig.json`'s `app/**\/*.tsx` glob
 * silently excludes dotfiles the way most glob implementations do, so a
 * hidden probe file "not found by the project service" for a second,
 * unrelated reason from the subdirectory issue above — same symptom, this
 * time from the filename rather than the location.
 */
async function lintFixture(source: string): Promise<readonly string[]> {
  const path = join(APP_DIR, `adherence-probe-${Math.random().toString(36).slice(2)}.tsx`);
  written.push(path);
  await writeFile(path, source, 'utf8');

  const eslint = new ESLint({ cwd: REPO_ROOT });
  const [result] = await eslint.lintFiles([path]);
  return (result?.messages ?? []).map((m) => m.message);
}

// Each case spawns an oxlint child process; the first pays cold-start (~5s on
// a loaded machine, right at Vitest's default 5s testTimeout — review finding
// L13, an intermittent CI red that has nothing to do with the assertion).
describe('the adherence gate actually fails on what it claims to forbid', () => {
  it('flags a raw hex colour', { timeout: 20_000 }, async () => {
    const messages = await lintFixture(
      `export function P(){ return <div style={{color:'#ff0000'}}/>; }`,
    );
    expect(messages.some((m) => m.includes('Raw hex color'))).toBe(true);
  });

  it('flags a raw px value', async () => {
    const messages = await lintFixture(
      `export function P(){ return <div style={{padding:'16px'}}/>; }`,
    );
    expect(messages.some((m) => m.includes('Raw px value'))).toBe(true);
  });

  it("flags a <Button> prop that isn't in the declared set", async () => {
    const messages = await lintFixture(
      `import { Button } from '../components/ui';\n` +
        `export function P(){ return <Button nonsense="oops">x</Button>; }`,
    );
    expect(messages.some((m) => m.includes("<Button> doesn't accept that prop"))).toBe(true);
  });

  it('flags a <Button variant> outside the declared enum', async () => {
    const messages = await lintFixture(
      `import { Button } from '../components/ui';\n` +
        `export function P(){ return <Button variant="not-real">x</Button>; }`,
    );
    expect(messages.some((m) => m.includes('<Button> variant must be one of'))).toBe(true);
  });

  it('flags importing a ported component by its own file rather than the barrel', async () => {
    const messages = await lintFixture(
      `import { Card } from '../components/ui/Card';\n` + `export function P(){ return <Card/>; }`,
    );
    expect(messages.some((m) => m.includes('the barrel'))).toBe(true);
  });

  it('does not fire outside apps/web/app and apps/web/components', async () => {
    // The identical hex-colour violation, in a file the adherence rules are
    // not scoped to — proves the scoping is doing something, not that the
    // rule is broken everywhere.
    const path = join(
      REPO_ROOT,
      'apps',
      'api',
      'src',
      `adherence-probe-${Math.random().toString(36).slice(2)}.ts`,
    );
    written.push(path);
    await writeFile(path, `export const x = { color: '#ff0000' };\n`, 'utf8');

    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintFiles([path]);
    const messages = (result?.messages ?? []).map((m) => m.message);
    expect(messages.some((m) => m.includes('Raw hex color'))).toBe(false);
  });
});

describe('the adherence gate does not fire on what is already shipped', () => {
  it('every ported .tsx file in apps/web/components lints clean', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintFiles(['apps/web/components/**/*.tsx']);
    const withProblems = results.filter((r) => r.messages.length > 0);
    expect(
      withProblems.map((r) => ({ file: r.filePath, messages: r.messages.map((m) => m.message) })),
    ).toEqual([]);
  });

  it('every route file in apps/web/app lints clean', async () => {
    // A glob, not a hardcoded path: T236a's placeholder page.tsx named itself
    // as temporary ("T240 replaces this with the real landing page") and
    // T240 did exactly that — a fixed path here would have gone stale the
    // same way, for the same reason, the moment the next route replaces
    // whatever currently sits at app/(public)/page.tsx.
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintFiles(['apps/web/app/**/*.tsx']);
    const withProblems = results.filter((r) => r.messages.length > 0);
    expect(
      withProblems.map((r) => ({ file: r.filePath, messages: r.messages.map((m) => m.message) })),
    ).toEqual([]);
  });
});
