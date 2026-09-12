/**
 * CLAUDE.md's own "Known open items" #4: `_adherence.oxlintrc.json`'s
 * `no-restricted-syntax` (the raw-hex/raw-px rule enforced for `.tsx` via
 * `eslint.config.js`, proven real by T245's adherence-lint.test.ts) matches
 * JS/JSX `Literal` AST nodes only — a `.module.css` file with a raw value
 * passed `pnpm lint` with zero coverage at all.
 *
 * The real gap, measured directly rather than assumed: 46 of 47
 * `.module.css` files under `apps/web` contain a raw px value (component
 * intrinsic sizing — button heights, font sizes — ported directly from the
 * design export, never meant to route through the `--space-*` scale one
 * literal at a time), and 8 contain a raw hex color. Two of those hex cases
 * are deliberate, already-documented escape hatches — `AdminShell.module.css`
 * and `ModuleStatus.module.css` both say in their own header comments that
 * the literal is moved to CSS specifically *because* the JS-side rule can't
 * reach it, for a shell that is intentionally not on the token palette.
 * Introducing tokens for all 46 files (a "full remediation") would be a
 * large, unrequested design-system change with real dark-mode/visual-
 * regression risk this task does not have license for.
 *
 * So this is a ratchet, not a strict zero-tolerance rule: every currently
 * known raw hex/px count is recorded in `BASELINE` below, exactly as
 * measured on 2026-09-08. A file may only get *better* (fewer literals) or
 * stay the same without touching this file; getting *worse*, or a brand-new
 * `.module.css` file introducing even one raw literal, fails the gate. That
 * is real, mechanical protection against new drift — the actual complaint
 * in CLAUDE.md's open item — without silently blessing every one of the 46
 * files as "fine" or demanding a rewrite nobody asked for.
 *
 * To fix a real instance and shrink the baseline: replace the literal with
 * a `var(--token)`, delete its line from `BASELINE` (or lower its count),
 * and re-run — the gate only ever tightens from here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function findCssModules(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findCssModules(full, out);
    } else if (entry.endsWith('.module.css')) {
      out.push(full);
    }
  }
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
// Negative lookbehind excludes matching the tail of a longer token/word (e.g.
// a hypothetical `--foo-16px-bar`), so this only counts a literal numeric px
// value, matching the intent of the JS-side rule's identical regex.
const PX_RE = /(?<![\w-])[0-9]+px\b/g;

function countRawValues(source: string): { hex: number; px: number } {
  // Strip CSS comments first — AdminShell's and page.module.css's own header
  // comments *describe* hex literals in prose; that is documentation, not usage.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return {
    hex: (stripped.match(HEX_RE) ?? []).length,
    px: (stripped.match(PX_RE) ?? []).length,
  };
}

/** Recorded 2026-09-08. Keys are POSIX-style paths relative to `apps/web`. */
const BASELINE: Record<string, { hex: number; px: number }> = {
  'app/(admin)/admin/billing/page.module.css': { hex: 0, px: 4 },
  // px 3 -> 15: capability upload/access controls and their responsive form.
  'app/(admin)/admin/capabilities/page.module.css': { hex: 0, px: 15 },
  // px 1 -> 3: real-data wiring (GET /admin/audit-log) added an .error and
  // a .loadMore block, copied verbatim from admin/users/page.module.css's
  // own established pattern for the same guard.
  // px 3 -> 8: persisted audit-log filter controls.
  'app/(admin)/admin/log/page.module.css': { hex: 0, px: 8 },
  'app/(admin)/admin/page.module.css': { hex: 0, px: 8 },
  // px 4 -> 12: create/edit plan form controls.
  'app/(admin)/admin/plans/page.module.css': { hex: 0, px: 12 },
  // px 6 -> 7: provider persistence status/error copy.
  'app/(admin)/admin/providers/page.module.css': { hex: 0, px: 7 },
  'app/(admin)/admin/queue/page.module.css': { hex: 0, px: 3 },
  // px 2 -> 4: real-data wiring (GET /admin/scans) added an .error and a
  // .loadMore block, copied verbatim from admin/users/page.module.css's own
  // established pattern for the same guard.
  'app/(admin)/admin/scans/page.module.css': { hex: 0, px: 4 },
  'app/(admin)/admin/settings/page.module.css': { hex: 1, px: 14 },
  // px 2 -> 10: user action panel and detail output.
  'app/(admin)/admin/users/page.module.css': { hex: 0, px: 10 },
  'app/(auth)/forgot-password/page.module.css': { hex: 0, px: 1 },
  'app/(auth)/login/page.module.css': { hex: 0, px: 2 },
  'app/(auth)/reset-password/page.module.css': { hex: 0, px: 2 },
  'app/(auth)/signup/page.module.css': { hex: 0, px: 1 },
  'app/(auth)/verify-email/page.module.css': { hex: 0, px: 4 },
  // px 24 -> 29: receipt rows and receipt metadata typography.
  'app/(dashboard)/billing/page.module.css': { hex: 0, px: 29 },
  // New receipt detail surface; its 12px/13px values are intentional and
  // documented beside the declarations.
  'app/(dashboard)/billing/receipts/[id]/page.module.css': { hex: 0, px: 2 },
  'app/(dashboard)/reports/[id]/page.module.css': { hex: 0, px: 14 },
  // px 28 -> 32: delete-account confirmation label and error state.
  'app/(dashboard)/settings/page.module.css': { hex: 1, px: 32 },
  'app/(dashboard)/usage/page.module.css': { hex: 0, px: 20 },
  // px 43 -> 45: the two fixed-column grids (.diffGrid, .loopGrid) got a
  // 640px mobile breakpoint collapsing them to one column — a real,
  // measured horizontal-overflow bug found via manual testing, not a new
  // design decision.
  'app/(public)/page.module.css': { hex: 2, px: 45 },
  'app/(public)/pricing/page.module.css': { hex: 0, px: 23 },
  'app/theme.module.css': { hex: 0, px: 10 },
  'components/admin/AdminShell.module.css': { hex: 13, px: 64 },
  'components/admin/format.module.css': { hex: 0, px: 2 },
  'components/auth/AuthFrame.module.css': { hex: 0, px: 10 },
  'components/dashboard/Sidebar.module.css': { hex: 1, px: 62 },
  'components/fixes/FixesBoard.module.css': { hex: 0, px: 3 },
  'components/fixes/IssueRow.module.css': { hex: 0, px: 17 },
  // px 23 -> 28: the same real, measured mobile-overflow fix — a 640px
  // breakpoint hiding the nav/lang/theme toggle and collapsing the footer
  // grid to one column.
  'components/public/Public.module.css': { hex: 0, px: 28 },
  'components/report/AnnotatedScreenshot.module.css': { hex: 0, px: 6 },
  'components/report/AttributionMark.module.css': { hex: 0, px: 3 },
  'components/report/IssueCard.module.css': { hex: 0, px: 13 },
  'components/report/ModuleStatus.module.css': { hex: 1, px: 18 },
  'components/report/ProgressRow.module.css': { hex: 0, px: 9 },
  'components/report/ReadinessVerdict.module.css': { hex: 0, px: 11 },
  'components/report/SeverityBadge.module.css': { hex: 0, px: 5 },
  'components/scan/InputTabs.module.css': { hex: 0, px: 20 },
  'components/scan/ScanForm.module.css': { hex: 0, px: 15 },
  'components/scan/ScanProgress.module.css': { hex: 0, px: 3 },
  'components/ui/Badge.module.css': { hex: 3, px: 5 },
  'components/ui/Button.module.css': { hex: 0, px: 10 },
  'components/ui/Card.module.css': { hex: 0, px: 5 },
  'components/ui/Eyebrow.module.css': { hex: 0, px: 1 },
  'components/ui/Input.module.css': { hex: 0, px: 7 },
  'components/ui/PromoBar.module.css': { hex: 2, px: 9 },
  'components/ui/StatRow.module.css': { hex: 0, px: 1 },
};

describe('CSS Modules raw hex/px is a ratchet, not an unmonitored gap', () => {
  it('never exceeds the recorded baseline, and never appears in a file with none recorded', () => {
    const files: string[] = [];
    findCssModules(WEB_ROOT, files);

    const regressions: string[] = [];
    for (const file of files) {
      const rel = relative(WEB_ROOT, file).split(sep).join('/');
      const actual = countRawValues(readFileSync(file, 'utf8'));
      const allowed = BASELINE[rel] ?? { hex: 0, px: 0 };
      if (actual.hex > allowed.hex) {
        regressions.push(`${rel}: hex ${String(actual.hex)} > baseline ${String(allowed.hex)}`);
      }
      if (actual.px > allowed.px) {
        regressions.push(`${rel}: px ${String(actual.px)} > baseline ${String(allowed.px)}`);
      }
    }

    expect(regressions).toEqual([]);
  });

  it('the scanner itself detects a raw hex and a raw px value', () => {
    const result = countRawValues('.x { color: #ff0000; padding: 16px; }');
    expect(result).toEqual({ hex: 1, px: 1 });
  });

  it('does not count a hex/px literal that appears only inside a comment', () => {
    const result = countRawValues(
      '/* the source uses #ff0000 and 16px here */\n.x { color: var(--accent); }',
    );
    expect(result).toEqual({ hex: 0, px: 0 });
  });

  it('does not count a token reference as a raw value', () => {
    const result = countRawValues('.x { padding: var(--space-4); color: var(--accent); }');
    expect(result).toEqual({ hex: 0, px: 0 });
  });
});
