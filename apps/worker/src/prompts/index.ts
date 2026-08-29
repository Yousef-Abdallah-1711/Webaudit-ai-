/**
 * T083 — every prompt the AI layer uses, in one place.
 *
 * `MODULE_PROMPTS` is keyed by `ModuleType` and exhaustive, which is what makes
 * "did we forget an area" a type error rather than a gap discovered in a report.
 */

import type { ModuleType } from '@webaudit/types';
import { performancePrompt } from './performance.js';
import { securityPrompt } from './security.js';
import { seoPrompt } from './seo.js';
import { testingPrompt } from './testing.js';
import { uiPrompt } from './ui.js';
import type { ModulePrompt } from './shared.js';

export const MODULE_PROMPTS: Readonly<Record<ModuleType, ModulePrompt>> = {
  PERFORMANCE: performancePrompt,
  SECURITY: securityPrompt,
  UI: uiPrompt,
  TESTING: testingPrompt,
  SEO: seoPrompt,
};

export { SHARED_PREAMBLE, moduleInsightSchema, modulePromptFor } from './shared.js';
export type { ModuleInsight, ModulePrompt } from './shared.js';
export { masterReportPrompt, masterReportSchema } from './master-report.js';
export type { MasterReport } from './master-report.js';
