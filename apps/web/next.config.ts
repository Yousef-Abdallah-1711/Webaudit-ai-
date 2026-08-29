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
  eslint: {
    // The repo's actual lint gate is `pnpm lint` — the root flat `eslint.config.js`
    // plus `design-system/_adherence.oxlintrc.json` via oxlint (T245). Next's
    // build-time step expects `eslint-config-next`, which this repo does not use,
    // so it only warns about a missing plugin that was never meant to exist here.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
