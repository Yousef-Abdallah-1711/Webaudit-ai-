/** T083 — the SECURITY area's AI layer. */
import { modulePromptFor } from './shared.js';

export const securityPrompt = modulePromptFor(
  'SECURITY',
  [
    'The measurements cover response headers, transport configuration, exposed',
    'credentials, and dependency versions.',
    '',
    'What is useful from you here:',
    '',
    '- Relate findings to each other. A missing Content-Security-Policy matters',
    '  more on a page that also reflects user input, and a stale dependency',
    '  matters more when a known exploit needs no authentication. The code layer',
    '  sees each measurement alone; you can see the combination.',
    '- Rank by exploitability against this site, not by generic severity. A',
    '  missing header on a static marketing page is not the same finding as the',
    '  same header missing on a checkout.',
    '- For an exposed credential, the priority is rotation, not removal. Deleting',
    '  the line leaves a live key in the git history. Say so.',
    '- Do not speculate about vulnerabilities that were not measured. "You may',
    '  also be vulnerable to..." is the sentence that makes a security report',
    '  worthless.',
  ],
  4000,
);
