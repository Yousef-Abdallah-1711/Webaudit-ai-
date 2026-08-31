/**
 * T124 — content-checker: heading structure, page language, image alt text,
 * and thin content, extracted from the fetched page's own markup.
 *
 * Same regex-extraction approach as `meta-checker` (see its own module
 * note for why no HTML parser dependency was added) — narrow, tolerant
 * patterns rather than a general parser, missing something reads as absent
 * rather than as a false pass.
 *
 * **Image alt text is reported once, aggregated**, not once per image: a
 * page with forty unlabelled images would otherwise produce forty issues
 * for what is really one problem, and `evidence.count` carries the number
 * so the report can still say how many.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';

const MIN_WORD_COUNT = 200;

function countTags(html: string, tag: string): number {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
  return html.match(pattern)?.length ?? 0;
}

function hasLangAttribute(html: string): boolean {
  return /<html\s+(?:[^>]*\s)?lang=["'][^"']+["']/i.test(html);
}

/** Every `<img ...>` tag that has no `alt` attribute at all. */
function countImagesWithoutAlt(html: string): number {
  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  return imgTags.filter((tag) => !/\salt=["']/i.test(tag)).length;
}

/** Visible text, stripped of tags/scripts/styles, for a rough word count. */
function visibleWordCount(html: string): number {
  const withoutScriptsAndStyles = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = withoutScriptsAndStyles.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

function finding(
  checkId: string,
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  location: string,
  evidence?: Readonly<Record<string, unknown>>,
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
    ...(evidence === undefined ? {} : { evidence }),
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

  const h1Count = countTags(html, 'h1');
  if (h1Count === 0) {
    findings.push(
      finding(
        'content.h1-missing',
        'HIGH',
        'Missing H1 heading',
        'No <h1> tag was found in the page.',
        'Search engines and assistive technology both use the H1 as the page’s primary topic ' +
          'signal; without one there is no clear heading hierarchy to anchor either on.',
        url,
      ),
    );
  } else if (h1Count > 1) {
    findings.push(
      finding(
        'content.h1-multiple',
        'LOW',
        'Multiple H1 headings',
        `${String(h1Count)} <h1> tags were found in the page.`,
        'More than one H1 dilutes the single clear topic signal an H1 is meant to provide.',
        url,
        { count: h1Count },
      ),
    );
  }

  if (!hasLangAttribute(html)) {
    findings.push(
      finding(
        'content.lang-missing',
        'MEDIUM',
        'Missing html lang attribute',
        'No lang attribute was found on the <html> tag.',
        'Without a lang attribute, screen readers cannot choose the correct pronunciation ' +
          'rules and search engines cannot reliably determine the page’s language.',
        url,
      ),
    );
  }

  const imagesWithoutAlt = countImagesWithoutAlt(html);
  if (imagesWithoutAlt > 0) {
    findings.push(
      finding(
        'content.images-missing-alt',
        'MEDIUM',
        'Images missing alt text',
        `${String(imagesWithoutAlt)} <img> tag(s) have no alt attribute.`,
        'Without alt text, screen reader users get no description of the image and search ' +
          'engines cannot index what it shows.',
        url,
        { count: imagesWithoutAlt },
      ),
    );
  }

  const words = visibleWordCount(html);
  if (words < MIN_WORD_COUNT) {
    findings.push(
      finding(
        'content.thin-content',
        'LOW',
        'Thin content',
        `The page’s visible text is approximately ${String(words)} words, below the commonly ` +
          `cited ${String(MIN_WORD_COUNT)}-word threshold for substantive content.`,
        'Search engines tend to rank pages with very little unique text lower, since there is ' +
          'not much for them to determine relevance from.',
        url,
        { wordCount: words },
      ),
    );
  }

  return findings;
}

/** T153 — one check, re-run against the recorded URL's current markup. */
async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  if (issue.location === undefined) {
    return { outcome: 'UNVERIFIABLE', reason: 'content-checker needs the recorded URL to re-check.' };
  }
  const response = await ctx.fetch(issue.location, { signal: ctx.signal });
  const html = response.text();
  const url = response.url;

  const pass: ReverifyResult = { outcome: 'PASSED' };
  const fail = (evidence: Record<string, unknown>): ReverifyResult => ({
    outcome: 'FAILED',
    evidence: { url, ...evidence },
  });

  switch (issue.checkId) {
    case 'content.h1-missing':
      return countTags(html, 'h1') >= 1 ? pass : fail({ h1Count: 0 });
    case 'content.h1-multiple': {
      const count = countTags(html, 'h1');
      return count <= 1 ? pass : fail({ h1Count: count });
    }
    case 'content.lang-missing':
      return hasLangAttribute(html) ? pass : fail({ lang: null });
    case 'content.images-missing-alt': {
      const missing = countImagesWithoutAlt(html);
      return missing === 0 ? pass : fail({ imagesMissingAlt: missing });
    }
    case 'content.thin-content': {
      const words = visibleWordCount(html);
      return words >= MIN_WORD_COUNT ? pass : fail({ wordCount: words, minimum: MIN_WORD_COUNT });
    }
    default:
      return { outcome: 'UNVERIFIABLE', reason: `content-checker does not own ${issue.checkId}.` };
  }
}

export const contentChecker: AuditCapability = {
  id: 'content-checker',
  module: 'SEO',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
  reverify,
};

export default contentChecker;
