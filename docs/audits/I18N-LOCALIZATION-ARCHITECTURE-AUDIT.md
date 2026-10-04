# Fahes i18n / Localization Architecture Audit

**Date:** 2026-09-30 · **Scope:** `apps/web/` · **Mode:** Read-only investigation, no code changed
**Method:** Independently dispatched to two implementers (Codex/gpt-6-luna and Kimi-Code) against the
same brief, cross-checked against each other and against source directly by the orchestrator. Where
the two disagreed, the orchestrator resolved it by reading the file directly (noted inline). No files
were modified by either investigation or by this report — verified via `git status --porcelain`.

---

## A. Current i18n architecture

```
apps/web/lib/strings.ts  (372 lines, ~19.6KB, single module)
  L9   export type Lang = 'en' | 'ar'                    ← exactly two locales, at the type level
  L11  const en = { ...164 keys... }
  L195 const ar: Record<keyof typeof en, string> = {...}  ← forces all 164 keys to exist in ar
  L370 export type StringKey = keyof typeof en
  L372 export const WA_STRINGS: Record<Lang, Record<StringKey, string>> = { en, ar }
         │ static import
         ▼
apps/web/app/theme.tsx  ('use client', module-scope pub-sub store)
  L28-35   localStorage read, browser-guarded
  L43-68   createStore(key, initial, apply) + subscriber Set
  L76-80   waLang store ('wa-lang') → sets html.lang + html.dir on change
  L101-105 useT() → [t, lang, setLang]; t(key) = WA_STRINGS[lang][key] ?? WA_STRINGS.en[key] ?? key
  L107-119 ThemeScript — inline <script>, runs pre-paint, sets html lang/dir from localStorage
  L182-214 LangToggle — a binary en↔ar button, not a locale list
         │ consumed by (verified call sites: Sidebar.tsx, 5 auth pages, 2 public pages — and nothing
         │ else; every dashboard/admin page has zero t() calls)
         ▼
apps/web/app/layout.tsx
  L45  <html lang="en">  (hardcoded server default, suppressHydrationWarning on the element)
  L58  <ThemeScript/> in <head>
```

This is a direct port of the design system's vendored `design-system/ui_kits/strings.jsx` /
`theme.jsx` — the file's own header comment says so, and the fallback chain (`tb[lang][k] ?? tb.en[k]
?? k`) is identical to the vendored source.

**No i18n library is used.** Confirmed absent from both `package.json` files, the lockfile, and every
import in `apps/web` source: no next-intl, i18next, react-i18next, next-i18next, react-intl/FormatJS,
or Lingui.

## B. Translation flow

1. **Selection:** `LangToggle` — one button: `const next: Lang = lang === 'ar' ? 'en' : 'ar'`
   (`theme.tsx:184`).
2. **Persistence:** written to `localStorage['wa-lang']`, subscribers notified (`theme.tsx:51-64`).
3. **Lookup:** `t(key)` → active locale → English → the raw key string (`theme.tsx:101-105`). No
   parameters, no pluralization.
4. **Rendering:** subscribing components re-render via a `useReducer`-based force-update
   (`theme.tsx:82-91`); `t()` is called inline in JSX.
5. **Direction:** `html.dir` set both by the store on change and by the pre-paint script
   (`theme.tsx:79, 117`) — then **overridden per-view at six separate sites** (see C-3).

**Two worked examples:**

| Key | English | Arabic | Used at |
|---|---|---|---|
| `auth_verify_lead` | "We sent a verification link to {email}. It expires in 24 hours." (`strings.ts:143`) | "أرسلنا رابط تحقق إلى {email}. تنتهي صلاحيته خلال ٢٤ ساعة." (`strings.ts:319`) | `verify-email/page.tsx:115` — `t('auth_verify_lead').replace('{email}', email \|\| '...')` |
| `n_report` | "Report" (`strings.ts:78`) | "التقرير" (`strings.ts:261`) | `Sidebar.tsx:88,251` |

**Fonts:** `layout.tsx:20-32` loads Lexend Deca / JetBrains Mono with `subsets: ['latin']` only — no
Arabic font subset is loaded at all.

## C. Hardcoded language assumptions — the three-way split

### C-1. Hardcoded text bypassing `t()`

**~430 findings across 45 files.** Sharply split by surface:

- **Fully translated today:** the landing page (`(public)/page.tsx` — 0 hardcoded findings, 24 real
  `t()` calls), all 5 auth pages, and the sidebar's own chrome (nav labels, credit balance, top-up).
- **Entirely untranslated (zero `t()` calls at all):** every dashboard page and every admin page.
  Worst offenders: `admin/users/page.tsx` (~55 strings), `(dashboard)/billing/page.tsx` (~48),
  `(dashboard)/settings/page.tsx` (~26), `(dashboard)/readiness/page.tsx` (~26),
  `admin/capabilities/page.tsx` (~26), `admin/plans/page.tsx` (~23), `(public)/pricing/page.tsx`
  (~18), `components/admin/AdminShell.tsx` (~18 — all 10 of its nav labels are hardcoded English).

Concrete examples: `settings/page.tsx:221` `'Change password'`, `:288` `'Sign out'`; `reports/[id]/
page.tsx:191` `'Executive summary'`, `:196-199` `'critical'/'high'/'medium'/'low'`; `readiness/
page.tsx:220` `'Regressions since the original audit'`.

One genuine bug found here: `verify-email/page.tsx:115,122` — the fallback display string `'the email
you registered with'` is raw hardcoded English **injected into an otherwise-translated Arabic
sentence**, producing mixed-language output for a real user-facing case (session already returning,
no stored display email).

### C-2. Hardcoded locale logic

Every occurrence of two-locale-specific logic in `apps/web`:

- `strings.ts:9` — `type Lang = 'en' | 'ar'` (the union itself hardcodes exactly two locales)
- `strings.ts:372` — `Record<Lang, ...>` inherits that restriction
- `theme.tsx:184` — the binary toggle
- `theme.tsx:196-197, 212` — labels/titles hardcode the literal words "Arabic"/"English" and the
  glyphs `ع`/`EN`

No `isArabic` boolean or other ad hoc two-language flag was found beyond these.

### C-3. Hardcoded RTL logic (direction coupled to the literal string `'ar'`)

**Six decision sites, every one of them a name-check on `'ar'`, none using locale metadata:**

| Site | Code |
|---|---|
| `theme.tsx:79` | `html.dir = value === 'ar' ? 'rtl' : 'ltr'` |
| `theme.tsx:117` | Same check, duplicated in the pre-paint script |
| `Sidebar.tsx:105, 328` | `const TRANSLATED = new Set(['scan'])`; `lang === 'ar' && !TRANSLATED.has(activeKey) ? 'ltr' : undefined` — **every dashboard route except `/scan` is explicitly forced back to LTR when Arabic is active**, by the source's own comment |
| `AuthFrame.tsx:30` | `dir={lang === 'ar' ? 'ltr' : undefined}` — the **entire auth flow** (signup, login, verify-email, reset-password) is forced LTR in Arabic |
| `pricing/page.tsx:130` | `const dir = lang === 'ar' ? 'ltr' : undefined` |
| `AdminShell.tsx:227` | `<main dir="ltr">` — unconditional, not even locale-checked |

Two existing tests already encode this pinning as expected behavior: `tests/unit/dashboard-shell.
test.ts:91`, `report-status.test.ts:78`.

## D. Verdict on hardcoded strings (consolidated)

Cross-referencing C-1: **every dashboard and admin page has zero `t()` calls at all** — this isn't
partial coverage drifting toward complete, it's two entirely separate populations of surfaces (auth +
marketing + sidebar chrome: translated; dashboard + admin content: not wired to the translation system
at all). Adding a new locale's dictionary values would light up the first population and do nothing
for the second.

## E. Third-language (French) simulation — exact change list

**Tier 1 — dictionary (mechanical, forced-complete by the type system):**
- `strings.ts:9` — widen the union to include `'fr'`
- New `const fr: Record<keyof typeof en, string> = {...}` — the `Record` type forces all 164 keys
- `strings.ts:372` — add `fr` to `WA_STRINGS`

**Tier 2 — the toggle is a hard, silent break:**
- `theme.tsx:184` — `lang === 'ar' ? 'en' : 'ar'` ping-pongs forever between only two values. **A
  French user's toggle click is literally unreachable from this control.** The `Lang` type will
  compile fine with `'fr'` added; the UI to reach it does not exist.
- `theme.tsx:196-197, 212` — labels are hardcoded to the words/glyphs for English and Arabic
  specifically, not generated from any locale list.

**Tier 3 — the `lang === 'ar'` direction guards work for French by accident, not by design:**
Sidebar.tsx:328, AuthFrame.tsx:30, pricing/page.tsx:130 all fall through to `undefined`/LTR for
`'fr'` — correct output, wrong reasoning. **This matters concretely for the next RTL locale** (Hebrew,
Urdu, Persian): it would need to be individually added to all six sites in C-3, one at a time, because
none of them derive direction from locale metadata.

**Tier 4 — the real cost, and it dwarfs Tiers 1-3:** the ~430 hardcoded strings across 45 files (C-1)
are untouched by adding a French dictionary. **Adding French today yields French marketing + auth +
sidebar, with the entire dashboard and admin area still in English** — a materially inconsistent
product experience, not a completed localization.

## F. 20-100 language scalability — where it actually breaks

Named thresholds, each tied to a specific mechanism already in this codebase:

1. **Locale #3 — immediate, silent break.** The toggle (`theme.tsx:184`) and its labels
   (`196-197, 212`) are structurally binary. A third locale added to the type/dictionary compiles
   fine and is simply unreachable through the UI.
2. **True today, at any locale count — missing interpolation/pluralization.** `t()`'s signature is
   `(key: StringKey) => string` — no parameters at all. The `{email}` substitution in verify-email is
   the *only* interpolation mechanism in the entire app, and it's a caller-side manual `.replace()`,
   not a feature of `t()`. Arabic plural/gender agreement cannot be expressed through this system as
   it exists.
3. **~5 locales — file becomes unmaintainable, not broken.** 164 keys × 5 locales ≈ 1,000 entries in
   one 372-line file; every key addition touches N object literals in the same diff hunk. (The
   `Record<keyof typeof en, string>` completeness check *does* scale mechanically to any locale
   count under strict `tsc` — that part of the type system is sound — but the single-file structure
   does not scale for human maintenance.)
4. **~10-20 locales — bundle cost becomes material.** All locales are shipped to every visitor today
   (no lazy loading, no namespaces, no code-splitting — `WA_STRINGS` is one statically-imported
   object). At the current ~4-5KB gzip per locale, 20 locales ≈ 90-100KB of untree-shakable string
   data in the shared client bundle; 100 locales ≈ roughly 450-500KB gzipped, with `en` permanently
   resident regardless since it's the hard-coded fallback.
5. **100 locales — pure governance failure.** One file becomes on the order of 18,000 lines with no
   per-namespace ownership and no runtime missing-key telemetry (detection is compile-time only).

**Hydration risk, independent of locale count:** the server always renders with the English fallback
(`theme.tsx:29-31`); the client reads the real preference from `localStorage` after mount. Arabic
users likely see a real English→Arabic text swap post-hydration, and **crawlers always see English**
— `suppressHydrationWarning` on `<html>` covers the `lang`/`dir` *attributes* only, not the text
content mismatch underneath.

## G. Current system vs. next-intl vs. i18next — for this specific stack

| Dimension | Current custom system | next-intl | i18next / react-i18next |
|---|---|---|---|
| Server components | Cannot serve translated text — dashboard/admin server routes render English only, structurally | First-class RSC support (`getTranslations` in layouts/`generateMetadata`) | Possible but requires custom provider plumbing; more awkward in RSC |
| Type safety | `Record<keyof typeof en, string>` gives real compile-time completeness for whichever locales exist, but no per-message parameter typing | Generates a `Messages` type; catches bad keys *and* missing interpolation params | TS augmentation available; less integrated with Next specifically |
| RTL | Six `lang === 'ar'` name-checks, no metadata table | You still derive direction yourself, but from a locale you already have centrally | Same — direction derivation is your own code either way |
| Dynamic loading/namespaces | None — one statically-imported object | Per-locale message loading, route-level splitting | Namespaces and on-demand loading are core features |
| Pluralization/interpolation | None; one hand-rolled `.replace()` | ICU messages: interpolation, plurals, `select` | ICU via plugin, or JSON plural rules |
| Formatting | Nothing bound to `wa-lang`; `toLocaleString` calls follow the *browser's* locale, not the app's selected one | `useFormatter` → `Intl` bound to the active locale | `Intl` via formatting plugins |
| SEO/metadata/routing | No locale URL effect anywhere; one static English `<metadata>` | `generateMetadata` per locale + optional `[locale]` middleware routing + hreflang | Same capability, more manual wiring |
| Migration cost here | — | Moderate: the existing `useT()` shape (`[t, lang, setLang]`) maps closely onto `useTranslations`/`useLocale`, so most of the ~107 real `t()` call sites are cheap to preserve behind an adapter; the ~430 hardcoded strings need manual keying regardless of which path is chosen | Comparable effort, slightly worse fit for App Router specifically |

## H. Recommended target architecture

**The reasoning, not just the conclusion:**

1. The current system is genuinely adequate **for the two locales it already covers, at the surfaces
   that actually use it** (landing, auth, sidebar chrome) — compile-time completeness and a sane
   fallback chain are real, working properties today.
2. It is **already insufficient at exactly two locales**, independent of ever adding a third: no
   interpolation beyond one hand-rolled case, no formatting bound to the selected language, and
   Arabic content that's invisible to search crawlers (see L/12).
3. The 45 files of hardcoded dashboard/admin English are the dominant cost of going to a third
   locale — and that cost is **identical whether the custom system is kept or a library is adopted**.
   No library purchases you out of that work.
4. Because `useT()`'s existing shape already resembles `next-intl`'s API, the ~107 real call sites
   that do use `t()` are cheap to carry forward behind a thin adapter if a migration is ever done.

**Recommendation, conditioned on an actual trigger:**
- **If Fahes commits to a third locale:** adopt **next-intl** — it directly solves the RSC gap (the
  dashboard/admin pages that structurally cannot serve translated text today), and its ICU support
  replaces the ad hoc interpolation this system can't grow into. In the same motion, introduce a
  `{code, label, direction}` locale-metadata table that replaces all six sites in C-3 at once — this
  single abstraction is what actually decouples "RTL" from "the string `'ar'`."
- **If Fahes stays at two locales:** **do not migrate.** Fix the three concrete gaps that already
  exist today (interpolation, locale-bound formatting, SEO/metadata for Arabic) inside the current
  custom system, at a fraction of the risk and effort a migration would cost.

## I. Migration effort/risk (phased, no behavior change until each phase's own cutover)

1. **Phase 0 — guardrails.** Inventory every string in `strings.ts` as the extraction source; add a
   lint rule forbidding new hardcoded JSX text literals (this repo already has a comparable adherence
   oxlint gate pattern to extend). Freeze new ad hoc keys until Phase 1 lands.
2. **Phase 1 — dictionary transplant (small, reversible).** Move `en`/`ar` into `messages/en.json` /
   `ar.json`; generate types; keep `useT()` exported from `theme.tsx` as a drop-in adapter so all
   existing call sites and tests are untouched. Verify: typecheck, unit tests, adherence lint.
3. **Phase 2 — the real fork: provider/routing decision.** Mount next-intl at the root layout; decide
   explicitly whether locale stays `localStorage`-only (zero URL/SEO change, lowest risk) or moves to
   cookie/middleware with `[locale]` routing (real SEO win, but touches every internal link, requires
   reconciling the `ThemeScript` pre-paint pattern with middleware, and needs e2e test updates). Do
   not let this happen by default — it's a product decision, not an implementation detail.
4. **Phase 3 — the bulk work.** Convert the ~430 hardcoded strings, page by page, dashboard/admin
   first since that's 100% of the current gap. Each page lands independently, gated by this project's
   existing adherence + 1440/390 visual-comparison rules.
5. **Phase 4 — direction/metadata generalization.** Build the `{code, label, direction}` table;
   replace all six C-3 sites and the toggle at `theme.tsx:184`. Audit dashboard/admin CSS modules for
   physical (`left`/`right`/`margin-left`) properties while doing this, since they're adjacent risk.
6. **Phase 5 — SEO, only if Phase 2 chose routing.** Per-locale `generateMetadata`, hreflang, sitemap
   entries, and an Arabic font subset (currently `latin` only).

**Real risks to plan for:** hydration-mismatch behavior changes once messages can load server-side
(needs real browser/e2e verification, not just unit tests); any existing test asserting literal
English copy will need updating; the `TRANSLATED` route-pinning in `Sidebar.tsx` is currently
load-bearing for two existing tests and removing it without a replacement direction-decision breaks
them intentionally, not accidentally; translators will need ICU-format training if next-intl is
adopted.

## J. Final verdict — the 12 questions

1. **How does i18n work today?** Fully custom: one 164-key `en`/`ar` dictionary object
   (`strings.ts`), a client-only `localStorage`-backed store and `useT()` hook (`theme.tsx`), a
   binary toggle, and an imperative pre-paint script setting `html.lang`/`dir`. No server/client
   translation sharing — server-rendered dashboard/admin routes have no path to translated text at
   all.
2. **Are English/Arabic hardcoded?** Yes, on all three distinguishable axes: ~430 hardcoded strings
   across 45 files (dashboard + admin entirely untranslated); locale logic hardcoded to exactly two
   values at the type level plus the toggle; RTL hardcoded as a literal `'ar'` check at six separate
   call sites with no shared abstraction.
3. **What does adding French require, concretely?** Three mechanical edits to `strings.ts` (cheap,
   forced-complete by the type system) plus a **mandatory rewrite of the binary toggle**, which
   otherwise makes French genuinely unreachable in the UI even though the type would compile. Full
   French coverage additionally requires wiring `t()` into all 45 currently-hardcoded files.
4. **Does this scale to 20-100 languages?** No, not as built. Concrete, named breakpoints: the toggle
   breaks at locale #3; interpolation/pluralization is already missing today, at 2 locales; the
   single-file dictionary becomes a maintenance problem around 5 locales; bundle size becomes
   material around 10-20 locales (everything ships to every visitor, no splitting exists); 100
   locales is a governance failure (one ~18,000-line file).
5. **Is a real i18n library in use?** **Confirmed absent.** Searched both `package.json` files, the
   lockfile, and every `apps/web` import for next-intl, i18next, react-i18next, next-i18next,
   react-intl/FormatJS, and Lingui — none found. This is entirely custom code, ported from the
   design system's vendored kit.
6. **Should we migrate?** Not to merely add one more dictionary entry — the current system handles
   that adequately at the surfaces it already covers. The real trigger is **the first genuinely
   committed third locale**, because at that point the toggle hard-breaks and the 430-string gap
   must be closed regardless of which system is chosen — and at that point, next-intl is the better
   fit for this specific Next.js App Router / mixed-RSC stack than either staying custom or adopting
   i18next.
7. **Is RTL coupled to "Arabic" specifically?** **Yes, at every one of the six direction-decision
   sites in the codebase** — every single one branches on the literal string `'ar'`, and none derives
   direction from any locale-metadata abstraction. A `{code, label, direction}` table would replace
   all six sites in one stroke and is the concrete fix named repeatedly in this report — but it does
   not, by itself, translate any of the 430 hardcoded strings or fix the toggle.
8. **Is the language switcher scalable?** No — it is a literal binary toggle with hardcoded
   language-name labels, not a list/dropdown driven by locale configuration. Five languages requires
   a full rewrite of the control, not a config change; worse, adding a locale to the *type* without
   rewriting the toggle compiles cleanly and fails silently (the new locale is simply unreachable).
9. **Are translation keys good, and is the type safety real?** Keys are generally semantic and
   sensibly prefixed (`nav_*`, `auth_*`), though "Sign in" is duplicated verbatim across **five**
   separate keys (`signin`, `auth_signin_title`, `auth_signin_submit`, `auth_register_foot_link`,
   `auth_verify_confirmed_submit` — verified directly by the orchestrator, correcting both
   implementers' independent undercounts). The TypeScript completeness guarantee
   (`Record<keyof typeof en, string>` for `ar`) is real and structural under strict `tsc`, though no
   existing test exercises it directly; the runtime fallback for a genuinely missing key is
   English, then the raw key string itself.
10. **What content is translated vs. left dynamic?** UI chrome that's wired up (marketing, auth,
    sidebar) is properly translated. **All dynamic product content — scan issue titles/explanations,
    AI-generated summaries, remediation prompts, severity words — is rendered as-is, never through
    `t()`**, which matches this product's own stated "measured, plain, technical voice" design
    principle as actually built, not merely as documented.
11. **Is formatting locale-aware?** No `Intl.DateTimeFormat` or `Intl.NumberFormat` call exists
    anywhere in `apps/web` application source. Every `toLocaleString`/`toLocaleDateString` call omits
    a locale argument, so it silently follows the **visiting browser's** locale, not the user's
    selected `wa-lang`. Billing amounts are hardcoded to USD. No locale-aware sorting was found
    anywhere.
12. **Does locale affect URLs or SEO?** No — confirmed no `[locale]` route segment, no middleware
    file anywhere in `apps/web`, and no i18n configuration in `next.config.ts`. Locale is a pure
    client-side `localStorage` preference with zero URL effect. Practical implication: the public
    marketing site is effectively **English-only to search engines** (server-rendered HTML is always
    the English fallback; Arabic only appears after client hydration), with no hreflang and no
    Arabic search presence. The authenticated dashboard's lack of locale URLs is much lower-stakes
    since it sits behind auth and indexing doesn't apply — a locale-free shareable report/certificate
    link that simply renders in whatever language the *recipient's own browser* has stored is
    arguably the correct behavior for that specific case, not a defect.

## Open questions for a human product decision

1. Are the Arabic-forces-LTR overrides in `AuthFrame.tsx` and `pricing/page.tsx` (both of which
   render real, translated Arabic copy but pin it LTR) intentional legacy inherited from the vendored
   design-system kit, or an unaddressed defect? Neither file's comments say.
2. Does the product actually intend public marketing/pricing pages and shareable readiness
   certificates to be search-indexable in Arabic? This single decision determines whether Phase 2 of
   any future migration needs real `[locale]` URL routing at all.
3. Should the user's language preference eventually be synced server-side to their account, rather
   than living only in the visiting browser's `localStorage`? No such API field was found in current
   use.

## Highest-priority items if this is acted on

Ranked, independent of whether a library migration ever happens:

1. Decide the Arabic-direction-override question above — right now Arabic users get LTR auth pages
   and LTR-pinned dashboard content *by explicit code design*, not by accident, and that design
   intent isn't documented anywhere.
2. Fix the `t()` interpolation gap (currently one manual `.replace()` for one string) before it
   multiplies — this is a real gap today, at two locales, independent of any future scale question.
3. Decide the SEO/routing question — it blocks a real, current gap (Arabic invisible to search) that
   has nothing to do with adding more languages.
4. If a third locale is ever actually committed to, do the `{code, label, direction}` metadata
   abstraction and the toggle rewrite *before* translating new content into it — otherwise the new
   locale is unreachable from the UI regardless of how complete its dictionary is.

---

*Investigation only. No application files, tests, dependencies, or configuration were modified.
Two independent implementer passes (Codex/gpt-6-luna, Kimi-Code) were cross-checked against each
other and against source directly by the orchestrating session; the one discrepancy found between them
(exact count of duplicated "Sign in" translation keys) was resolved by direct inspection and is noted
in verdict item 9 above.*
