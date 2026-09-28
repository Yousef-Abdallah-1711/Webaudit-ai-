import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * T236a — the Next.js scaffold.
 *
 * `transpilePackages` is required, not optional, here: `@webaudit/types` and
 * `@webaudit/config` export raw `.ts` source (`"main": "./src/index.ts"`),
 * matching the monorepo-wide convention every other app already uses. Next's
 * default bundler config excludes `node_modules` — where pnpm's workspace
 * symlinks land — from its TypeScript pipeline, so without this an import from
 * either package fails to compile rather than failing at runtime, which is a
 * worse failure to debug.
 */
const nextConfig: NextConfig = {
  /**
   * Phase 8 (production-without-Paymob-or-AI master plan): a self-contained
   * `.next/standalone` output — a minimal `server.js` plus only the
   * `node_modules` the built app actually traces as used — is Next.js's own
   * documented shape for a Docker production image, replacing "copy the
   * whole `node_modules` and run `next start`" with a much smaller final
   * layer. Affects only `next build`'s output layout; `next dev` is
   * unchanged.
   *
   * Gated behind `DOCKER_BUILD` (set only by `apps/web/Dockerfile`), not
   * unconditional — the key is omitted entirely rather than set to
   * `undefined` (`exactOptionalPropertyTypes` in tsconfig.base.json rejects
   * an explicit `undefined` for a non-optional-undefined property). Tracing
   * the standalone bundle copies files by creating real symlinks, which
   * Windows refuses without Developer Mode or admin elevation (`EPERM:
   * operation not permitted, symlink ...`) — a real, reproducible failure
   * hit running `next build` locally for `apps/web/tests/e2e`/`tests/visual`
   * on an unprivileged Windows checkout (Linux containers have no such
   * restriction, which is why the Docker build itself was never affected).
   * Those harnesses only need an ordinary `next build` + `next start`, never
   * the standalone bundle, so there is no reason to pay this cost outside
   * the one build that actually uses it.
   */
  ...(process.env['DOCKER_BUILD'] === '1' ? { output: 'standalone' as const } : {}),
  /**
   * Points Next's file tracer at the monorepo root rather than
   * `apps/web` alone, so a `pnpm`-hoisted workspace package (symlinked from
   * the root `node_modules`) is correctly traced into `.next/standalone`
   * instead of silently missing from it — a real, commonly-hit gap in
   * monorepos that Vercel's own standalone-output docs name explicitly.
   */
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@webaudit/types', '@webaudit/config'],
  /**
   * The other half of `transpilePackages`, and without it the build fails.
   *
   * Every shared package is `"type": "module"` and writes ESM-correct relative
   * specifiers — `export * from './constants.js'` in `packages/config/src/
   * index.ts`. Node and `tsc --moduleResolution bundler` both accept that
   * against a `constants.ts`; webpack takes the specifier literally and reports
   * `Can't resolve './constants.js'`, naming a file that will never exist
   * because nothing in this monorepo emits JavaScript. `extensionAlias` is
   * webpack's own answer to exactly this, and it has to list `.js` last so a
   * genuine `.js` file still resolves.
   *
   * This is the same trap PROGRESS.md records as known issue 0b from the other
   * direction: a `.js` specifier pointing at a `.tsx` file typechecks and does
   * not bundle. There the fix was to change the import; here the imports belong
   * to a shared package that is correct as written, so the bundler is what has
   * to be told.
   */
  webpack: (config: { resolve?: Record<string, unknown> }) => {
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.mjs': ['.mts', '.mjs'],
      },
    };
    return config;
  },
  eslint: {
    // The repo's actual lint gate is `pnpm lint` — the root flat `eslint.config.js`
    // plus `design-system/_adherence.oxlintrc.json` via oxlint (T245). Next's
    // build-time step expects `eslint-config-next`, which this repo does not use,
    // so it only warns about a missing plugin that was never meant to exist here.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
