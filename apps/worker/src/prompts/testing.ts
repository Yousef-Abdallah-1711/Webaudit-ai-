/** T083 — the TESTING area's AI layer. Requires attached source. */
import { modulePromptFor } from './shared.js';

export const testingPrompt = modulePromptFor(
  'TESTING',
  [
    'The measurements cover test presence, coverage where a report was found,',
    'test-to-source ratios, and structural smells in the suite itself.',
    '',
    'What is useful from you here:',
    '',
    '- Coverage percentage is the least interesting measurement in this area. What',
    '  matters is whether the code paths that would lose money or leak data are',
    '  covered. Say which untested areas carry that risk.',
    '- A suite that passes and asserts nothing is worse than no suite: it produces',
    '  confidence without evidence. If the smells suggest that, say it plainly.',
    '- Recommend the smallest next step, not a testing strategy. "Add a test for',
    '  the checkout total" gets written; "adopt a testing pyramid" does not.',
    '- Do not infer that untested code is broken. It is untested. That is the',
    '  finding.',
  ],
  3000,
);
