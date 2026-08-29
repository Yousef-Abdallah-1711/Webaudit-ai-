import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // design-system/ is vendored read-only reference (constitution v1.1.0).
    // Never linted, never edited.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'design-system/**',
      '**/prisma/generated/**',
      '**/*.min.js',
      // Next.js writes and owns this file; its own triple-slash reference to
      // `.next/types/routes.d.ts` is regenerated on every build, not a
      // lint-worthy choice this repo made.
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Root-level config files belong to no tsconfig; allowDefaultProject
        // lets the type-aware service parse them anyway.
        projectService: { allowDefaultProject: ['*.js', '*.mjs', '*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Principle IV: only packages/ai-executor may hold a provider client.
    files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],
    ignores: ['packages/ai-executor/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message: 'Principle IV: route every LLM call through packages/ai-executor.',
            },
            {
              name: 'openai',
              message: 'Principle IV: route every LLM call through packages/ai-executor.',
            },
            {
              name: '@google/generative-ai',
              message: 'Principle IV: route every LLM call through packages/ai-executor.',
            },
            {
              // The current Google SDK. The deprecated name above is kept so the
              // rule bites whichever one a contributor reaches for.
              name: '@google/genai',
              message: 'Principle IV: route every LLM call through packages/ai-executor.',
            },
          ],
        },
      ],
    },
  },
  {
    // Principle II / FR-025: capabilities reach the network only via CodeLayerContext.
    // Scoped to each capability's own src/ — not packages/capabilities-vendored/tests/,
    // whose fixture servers legitimately stand up a real node:http server for
    // capabilities to point ctx.fetch at, the same way apps/web/tests/e2e/fixtures/
    // static-site.ts does outside any restricted glob.
    files: ['packages/capabilities-vendored/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'undici',
              message: 'Use ctx.fetch from CodeLayerContext — it is SSRF-guarded.',
            },
            { name: 'node:http', message: 'Use ctx.fetch from CodeLayerContext.' },
            { name: 'node:https', message: 'Use ctx.fetch from CodeLayerContext.' },
            { name: 'node:child_process', message: 'Capabilities may not spawn processes.' },
          ],
        },
      ],
    },
  },
  {
    // supertest types `res.body` as `any`; there is no type information to
    // recover. Relaxed for tests only — source keeps the full rule set.
    files: ['**/*.test.ts', '**/tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Root config files are not part of a typed project. Type-aware rules would
    // only report on the loose types of the tooling they configure.
    files: ['eslint.config.js', 'vitest.workspace.ts', '*.config.js', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    /**
     * T245 — Design Adherence (constitution v1.1.0), and why this lives here
     * rather than in oxlint despite `design-system/_adherence.oxlintrc.json`
     * being the vendored spec and `tasks.md` naming `oxlint.config.json`.
     *
     * `pnpm run lint:adherence` (`oxlint -c design-system/_adherence.oxlintrc.json
     * apps/web`) already ran and already reported clean — 0 warnings on 23
     * files — before this task touched anything. That was never a passing
     * gate; it was a silent one. `oxlint --rules` lists every rule oxlint
     * 0.13.2 actually implements, and `no-restricted-syntax`,
     * `no-restricted-imports`, and `react/forbid-elements` — the only three
     * rules the vendored config uses — are not on it. oxlint does not error
     * on a config rule it does not recognise; it drops it and reports
     * success. Confirmed by injecting a raw `#ff0000` into `app/page.tsx`:
     * still 0 warnings. The gate had never once been able to fail.
     *
     * Every selector below is copied verbatim from
     * `design-system/_adherence.oxlintrc.json` (read-only reference, never
     * edited) into the one rule that actually implements this kind of custom
     * AST-selector check — ESLint's own `no-restricted-syntax`, already
     * proven working elsewhere in this file for Principle IV's provider
     * restriction. `react/forbid-elements`'s `forbid` list is empty in the
     * source (a no-op even in a working config), so it is not ported — doing
     * so would mean adding `eslint-plugin-react` for a rule that forbids
     * nothing. The design-system-internal `no-restricted-imports` pattern
     * (`components/core/**` etc.) is not ported either: it polices imports
     * *inside* `design-system/`, which is never linted at all (see the
     * `ignores` block above) — the pattern cannot match anything in
     * `apps/web`, whose ported barrels are a different path shape entirely.
     * The barrel-import discipline that rule exists for is enforced below
     * instead, adapted to where the barrels actually are.
     *
     * Scope is `apps/web/app/**` and `apps/web/components/**` only —
     * production surfaces, not `apps/web/tests/**`. A test that proves
     * `Card`'s `accentRule` prop passes an arbitrary CSS colour through
     * verbatim has to pass a real colour to prove it; forbidding that in
     * tests would be testing nothing.
     */
    files: ['apps/web/app/**/*.tsx', 'apps/web/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '*/components/ui/[A-Z]*',
                '*/components/report/[A-Z]*',
                '*/components/public/[A-Z]*',
                '*/components/dashboard/[A-Z]*',
                '*/components/admin/[A-Z]*',
              ],
              message:
                "Import ported components from the barrel ('../components/ui', " +
                "'../components/report', '../components/public', '../components/dashboard', " +
                "or '../components/admin'), not a component's own file.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Raw hex color — use a design-system color token via var().',
        },
        {
          selector: 'Literal[value=/\\b\\d+px\\b/]',
          message: 'Raw px value — use a design-system spacing token via var().',
        },
        {
          selector:
            'Literal[value=/font-family\\s*:\\s*(?![\'\\"]?(?:Lexend Deca|JetBrains Mono))/i]',
          message:
            'Font not provided by the design system. Available: Lexend Deca, JetBrains Mono.',
        },
        {
          selector:
            "JSXOpeningElement[name.name='AttributionMark'] > JSXAttribute > JSXIdentifier[name!=/^(?:kind|key|ref|className|style|children)$/]",
          message: "<AttributionMark> doesn't accept that prop. Declared props: kind.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='AttributionMark'] > JSXAttribute[name.name='kind'] > Literal[value!=/^(?:measured|ai-judgment)$/]",
          message: "<AttributionMark> kind must be one of 'measured' | 'ai-judgment'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Badge'] > JSXAttribute > JSXIdentifier[name!=/^(?:tone|pill|mono|icon|children|key|ref|className|style|children)$/]",
          message:
            "<Badge> doesn't accept that prop. Declared props: tone, pill, mono, icon, children.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Badge'] > JSXAttribute[name.name='tone'] > Literal[value!=/^(?:neutral|accent|success|inverse)$/]",
          message: "<Badge> tone must be one of 'neutral' | 'accent' | 'success' | 'inverse'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Button'] > JSXAttribute > JSXIdentifier[name!=/^(?:variant|size|disabled|fullWidth|icon|onClick|href|children|key|ref|className|style|children)$/]",
          message:
            "<Button> doesn't accept that prop. Declared props: variant, size, disabled, fullWidth, icon, onClick, href, children.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='variant'] > Literal[value!=/^(?:primary|secondary|ghost|inverse)$/]",
          message: "<Button> variant must be one of 'primary' | 'secondary' | 'ghost' | 'inverse'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='size'] > Literal[value!=/^(?:sm|md|lg)$/]",
          message: "<Button> size must be one of 'sm' | 'md' | 'lg'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Card'] > JSXAttribute > JSXIdentifier[name!=/^(?:title|eyebrow|footer|padding|accentRule|elevated|children|style|key|ref|className|style|children)$/]",
          message:
            "<Card> doesn't accept that prop. Declared props: title, eyebrow, footer, padding, accentRule, elevated, children, style.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Eyebrow'] > JSXAttribute > JSXIdentifier[name!=/^(?:tone|children|key|ref|className|style|children)$/]",
          message: "<Eyebrow> doesn't accept that prop. Declared props: tone, children.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Eyebrow'] > JSXAttribute[name.name='tone'] > Literal[value!=/^(?:muted|accent)$/]",
          message: "<Eyebrow> tone must be one of 'muted' | 'accent'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Input'] > JSXAttribute > JSXIdentifier[name!=/^(?:prefix|placeholder|value|onChange|type|fullWidth|invalid|mono|key|ref|className|style|children)$/]",
          message:
            "<Input> doesn't accept that prop. Declared props: prefix, placeholder, value, onChange, type, fullWidth, invalid, mono.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='IssueCard'] > JSXAttribute > JSXIdentifier[name!=/^(?:severity|title|location|description|attribution|prompt|area|onCopy|key|ref|className|style|children)$/]",
          message:
            "<IssueCard> doesn't accept that prop. Declared props: severity, title, location, description, attribution, prompt, area, onCopy.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='IssueCard'] > JSXAttribute[name.name='severity'] > Literal[value!=/^(?:critical|high|medium|low|info|resolved)$/]",
          message:
            "<IssueCard> severity must be one of 'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='IssueCard'] > JSXAttribute[name.name='attribution'] > Literal[value!=/^(?:measured|ai-judgment)$/]",
          message: "<IssueCard> attribution must be one of 'measured' | 'ai-judgment'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='ModuleStatus'] > JSXAttribute > JSXIdentifier[name!=/^(?:area|state|detail|issues|compact|key|ref|className|style|children)$/]",
          message:
            "<ModuleStatus> doesn't accept that prop. Declared props: area, state, detail, issues, compact.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='ModuleStatus'] > JSXAttribute[name.name='state'] > Literal[value!=/^(?:waiting|running|complete|degraded|not-applicable)$/]",
          message:
            "<ModuleStatus> state must be one of 'waiting' | 'running' | 'complete' | 'degraded' | 'not-applicable'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='ProgressRow'] > JSXAttribute > JSXIdentifier[name!=/^(?:elapsed|phase|done|total|safeToClose|key|ref|className|style|children)$/]",
          message:
            "<ProgressRow> doesn't accept that prop. Declared props: elapsed, phase, done, total, safeToClose.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='PromoBar'] > JSXAttribute > JSXIdentifier[name!=/^(?:message|code|dark|onDismiss|key|ref|className|style|children)$/]",
          message:
            "<PromoBar> doesn't accept that prop. Declared props: message, code, dark, onDismiss.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='ScoreArc'] > JSXAttribute > JSXIdentifier[name!=/^(?:score|delta|size|label|key|ref|className|style|children)$/]",
          message:
            "<ScoreArc> doesn't accept that prop. Declared props: score, delta, size, label.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='SeverityBadge'] > JSXAttribute > JSXIdentifier[name!=/^(?:level|label|count|key|ref|className|style|children)$/]",
          message: "<SeverityBadge> doesn't accept that prop. Declared props: level, label, count.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='SeverityBadge'] > JSXAttribute[name.name='level'] > Literal[value!=/^(?:critical|high|medium|low|info|resolved)$/]",
          message:
            "<SeverityBadge> level must be one of 'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='StatRow'] > JSXAttribute > JSXIdentifier[name!=/^(?:items|align|key|ref|className|style|children)$/]",
          message: "<StatRow> doesn't accept that prop. Declared props: items, align.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='StatRow'] > JSXAttribute[name.name='align'] > Literal[value!=/^(?:left|center)$/]",
          message: "<StatRow> align must be one of 'left' | 'center'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='TwoToneHeading'] > JSXAttribute > JSXIdentifier[name!=/^(?:lead|accent|level|align|as|key|ref|className|style|children)$/]",
          message:
            "<TwoToneHeading> doesn't accept that prop. Declared props: lead, accent, level, align, as.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='TwoToneHeading'] > JSXAttribute[name.name='level'] > Literal[value!=/^(?:display|h2)$/]",
          message: "<TwoToneHeading> level must be one of 'display' | 'h2'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='TwoToneHeading'] > JSXAttribute[name.name='align'] > Literal[value!=/^(?:left|center)$/]",
          message: "<TwoToneHeading> align must be one of 'left' | 'center'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='TwoToneHeading'] > JSXAttribute[name.name='as'] > Literal[value!=/^(?:h1|h2|h3)$/]",
          message: "<TwoToneHeading> as must be one of 'h1' | 'h2' | 'h3'.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='VerdictPanel'] > JSXAttribute > JSXIdentifier[name!=/^(?:verdict|score|baseline|blockers|areas|key|ref|className|style|children)$/]",
          message:
            "<VerdictPanel> doesn't accept that prop. Declared props: verdict, score, baseline, blockers, areas.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='VerdictPanel'] > JSXAttribute[name.name='verdict'] > Literal[value!=/^(?:go|no-go)$/]",
          message: "<VerdictPanel> verdict must be one of 'go' | 'no-go'.",
        },
      ],
    },
  },
);
