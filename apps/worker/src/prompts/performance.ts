/** T083 — the PERFORMANCE area's AI layer. */
import { modulePromptFor } from './shared.js';

export const performancePrompt = modulePromptFor(
  'PERFORMANCE',
  [
    'The measurements cover page weight, request counts, render timings, caching',
    'headers, and asset composition, at both desktop and mobile viewports.',
    '',
    'What is useful from you here:',
    '',
    '- Name the single largest cause, not the longest list. A page with forty',
    '  findings usually has two causes; the report is useful when it says which.',
    '- Translate numbers into experience. "2.4MB of JavaScript" means little;',
    '  "roughly eight seconds before this page responds on a mid-range phone over',
    '  4G" is actionable.',
    '- Distinguish what the owner controls from what they do not. A slow',
    '  third-party tag is a decision to revisit, not a bug to fix.',
    '- Where mobile and desktop measurements differ sharply, say why. That gap is',
    '  usually the most valuable thing in the area.',
    '- Do not estimate a score. The code layer scores what it measured.',
  ],
  4000,
);
