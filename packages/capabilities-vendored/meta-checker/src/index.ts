/**
 * T123 — meta-checker: title, meta description, viewport, and canonical
 * link, extracted from the fetched page's own markup.
 *
 * **Regex extraction, not a DOM parser.** No HTML parsing library is a
 * dependency anywhere in this repo, and adding one for four narrowly-scoped
 * tag lookups is more than this check needs — a full DOM tree is not
 * required to find a `<title>` or a `<meta name="...">` tag. The patterns
 * below are deliberately narrow (attribute order tolerant, both quote
 * styles, case-insensitive) rather than a general HTML parser's worth of
 * edge cases; a page with markup unusual enough to defeat them is itself
 * something worth knowing about, and a missed tag reads as "missing", which
 * is the same conservative direction every other check in this vertical
 * slice takes on ambiguity.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] === undefined ? null : match[1].trim();
}

function extractMetaContent(html: string, name: string): string | null {
  // Matches `<meta name="X" content="Y">` and `<meta content="Y" name="X">`.
  const pattern = new RegExp(
    `<meta\\s+(?:[^>]*?\\s)?name=["']${name}["'][^>]*?content=["']([^"']*)["']|` +
      `<meta\\s+(?:[^>]*?\\s)?content=["']([^"']*)["'][^>]*?name=["']${name}["']`,
    'i',
  );
  const match = pattern.exec(html);
  if (match === null) return null;
  return (match[1] ?? match[2] ?? '').trim();
}

function extractCanonical(html: string): string | null {
  const pattern =
    /<link\s+(?:[^>]*?\s)?rel=["']canonical["'][^>]*?href=["']([^"']*)["']|<link\s+(?:[^>]*?\s)?href=["']([^"']*)["'][^>]*?rel=["']canonical["']/i;
  const match = pattern.exec(html);
  if (match === null) return null;
  return (match[1] ?? match[2] ?? '').trim();
}

function finding(
  checkId: string,
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  location: string,
): CapabilityFinding {
  return {
    checkId,
    fingerprintParts: [checkId],
    severity,
    title,
    description,
    consequence,
    location,
    fixable: true,
  };
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const response = await ctx.fetch(input.targetUrl!, { signal: ctx.signal });
  const html = response.text();
  const url = response.url;
  const findings: CapabilityFinding[] = [];

  const title = extractTitle(html);
  if (title === null || title === '') {
    findings.push(
      finding(
        'meta.title-missing',
        'HIGH',
        'Missing page title',
        'No non-empty <title> tag was found in the page.',
        'Search engines and browser tabs both rely on the title tag; without one, search ' +
          'results show a generic or truncated fallback instead of a meaningful page name.',
        url,
      ),
    );
  } else if (title.length > 60) {
    findings.push(
      finding(
        'meta.title-too-long',
        'LOW',
        'Page title is longer than typically displayed',
        `The <title> tag is ${String(title.length)} characters, past the roughly 60 characters ` +
          'most search results display before truncating.',
        'A truncated title in search results can cut off the most important words, which ' +
          'reduces click-through from that result.',
        url,
      ),
    );
  }

  const description = extractMetaContent(html, 'description');
  if (description === null || description === '') {
    findings.push(
      finding(
        'meta.description-missing',
        'MEDIUM',
        'Missing meta description',
        'No non-empty <meta name="description"> tag was found in the page.',
        'Without a meta description, search engines generate a snippet from arbitrary page ' +
          'text, which is less likely to match what a searcher is looking for.',
        url,
      ),
    );
  } else if (description.length > 160) {
    findings.push(
      finding(
        'meta.description-too-long',
        'LOW',
        'Meta description is longer than typically displayed',
        `The meta description is ${String(description.length)} characters, past the roughly ` +
          '160 characters most search results display before truncating.',
        'A truncated description in search results can cut off the call to action or the ' +
          'most relevant detail.',
        url,
      ),
    );
  }

  if (extractMetaContent(html, 'viewport') === null) {
    findings.push(
      finding(
        'meta.viewport-missing',
        'MEDIUM',
        'Missing viewport meta tag',
        'No <meta name="viewport"> tag was found in the page.',
        'Without a viewport tag, mobile browsers render the page at desktop width and scale ' +
          'it down, which most search engines penalise as not mobile-friendly.',
        url,
      ),
    );
  }

  if (extractCanonical(html) === null) {
    findings.push(
      finding(
        'meta.canonical-missing',
        'LOW',
        'Missing canonical link',
        'No <link rel="canonical"> tag was found in the page.',
        'Without a canonical link, search engines must guess which URL variant (with or ' +
          'without query parameters, trailing slash, etc.) is the authoritative one to index.',
        url,
      ),
    );
  }

  return findings;
}

export const metaChecker: AuditCapability = {
  id: 'meta-checker',
  module: 'SEO',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default metaChecker;
