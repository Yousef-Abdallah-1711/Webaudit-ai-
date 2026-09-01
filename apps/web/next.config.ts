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
