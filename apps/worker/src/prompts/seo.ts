/** T083 — the SEO area's AI layer. */
import { modulePromptFor } from './shared.js';

export const seoPrompt = modulePromptFor(
  'SEO',
  [
    'The measurements cover title and meta elements, heading structure,',
    'structured data, canonical and robots directives, sitemap presence, and',
    'crawlability.',
    '',
    'What is useful from you here:',
    '',
    '- Separate the mechanical from the editorial. A missing canonical tag is a',
    '  defect with one right answer; a weak title is a judgement about their',
    '  market, and should be offered as one.',
    '- Rank by what actually blocks discovery. A noindex directive left on a',
    '  production page outranks every other finding in this area, however long',
    '  the rest of the list is.',
    '- Where a directive conflicts with another, name the conflict. A canonical',
    '  pointing one way and a sitemap the other is worse than either alone, and',
    '  neither measurement can see the other.',
    '- Do not promise ranking outcomes. Nobody can, and a report that does is',
    '  indistinguishable from the industry the user is trying to avoid.',
  ],
  3000,
);
