import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LIGHT_TOKENS_PATH = fileURLToPath(new URL('../../app/tokens/colors.css', import.meta.url));
const DARK_TOKENS_PATH = fileURLToPath(new URL('../../app/tokens/dark.css', import.meta.url));
const WEB_PACKAGE_PATH = fileURLToPath(new URL('../../package.json', import.meta.url));

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Common competing UI/styling systems; extend deliberately for approved exceptions. */
const DISALLOWED_UI_STYLING_LIBRARIES = [
  '@mui/material',
  '@chakra-ui/react',
  'antd',
  'bootstrap',
  'react-bootstrap',
  'styled-components',
  '@emotion/react',
  '@emotion/styled',
];

function parseCustomProperties(css: string): Record<string, string> {
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const properties: Record<string, string> = {};
  for (const match of uncommented.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    properties[match[1] as string] = (match[2] as string).trim();
  }
  return properties;
}

function severityAccentCollisions(css: string): string[] {
  const properties = parseCustomProperties(css);
  const accents = Object.entries(properties).filter(([name]) => name.startsWith('--accent'));
  return Object.entries(properties)
    .filter(([name]) => name.startsWith('--sev-'))
    .flatMap(([severityName, severityValue]) =>
      accents
        .filter(([, accentValue]) => severityValue === accentValue)
        .map(([accentName]) => `${severityName} equals ${accentName} (${severityValue})`),
    );
}

function disallowedLibraries(manifest: PackageManifest): string[] {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  return DISALLOWED_UI_STYLING_LIBRARIES.filter((name) => name in dependencies);
}

describe('Tailwind migration guardrails', () => {
  it.each([
    ['light', LIGHT_TOKENS_PATH],
    ['dark', DARK_TOKENS_PATH],
  ])('%s severity tokens remain distinct from accent tokens', (_theme, path) => {
    const css = readFileSync(path, 'utf8');
    const collisions = severityAccentCollisions(css);

    expect(collisions, `${path} must not make severity look like a brand CTA`).toEqual([]);
  });

  it('detects a throwaway severity value collapsed onto the real accent value', () => {
    const lightCss = readFileSync(LIGHT_TOKENS_PATH, 'utf8');
    const accent = parseCustomProperties(lightCss)['--accent'];
    const simulatedCss = lightCss.replace('--sev-critical: #b91c1c;', `--sev-critical: ${accent};`);

    expect(severityAccentCollisions(simulatedCss)).toContain(
      `--sev-critical equals --accent (${accent})`,
    );
  });

  it('does not add a competing UI or styling library to the web package', () => {
    const manifest = JSON.parse(readFileSync(WEB_PACKAGE_PATH, 'utf8')) as PackageManifest;
    const violations = disallowedLibraries(manifest);

    expect(
      violations,
      'Remove unapproved UI/styling dependencies or deliberately update DISALLOWED_UI_STYLING_LIBRARIES for an approved exception.',
    ).toEqual([]);
  });

  it('detects a disallowed dependency in a throwaway package manifest copy', () => {
    const manifest = JSON.parse(readFileSync(WEB_PACKAGE_PATH, 'utf8')) as PackageManifest;
    const simulatedManifest: PackageManifest = {
      ...manifest,
      dependencies: {
        ...manifest.dependencies,
        '@mui/material': '0.0.0-throwaway',
      },
    };

    expect(disallowedLibraries(simulatedManifest)).toContain('@mui/material');
  });
});
