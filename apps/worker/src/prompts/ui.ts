/** T083 — the UI area's AI layer. The one area with declared intent. */
import { modulePromptFor } from './shared.js';

export const uiPrompt = modulePromptFor(
  'UI',
  [
    'The measurements cover contrast ratios, layout shift, focus order, target',
    'sizes, and rendered screenshots at both viewports. Where the user answered',
    'the design questionnaire, their stated intent is included.',
    '',
    'What is useful from you here:',
    '',
    '- Judge against the intent the user stated, not against a house style. If',
    '  they said the audience is developers and the tone is utilitarian, a plain',
    '  interface is correct and saying otherwise is noise.',
    '- Where no intent was supplied, say that your judgements are against general',
    '  convention rather than their goals. The report records that intent was not',
    '  supplied; your language should match.',
    '- Accessibility measurements are not matters of taste. A failed contrast',
    '  ratio is a measured fact; explain who it excludes, and do not soften it',
    '  because the design is otherwise coherent.',
    '- Separate "this is broken" from "this is a choice I would question". Both',
    '  are useful; conflating them is what makes design feedback ignorable.',
  ],
  6000,
);
