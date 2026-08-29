export { fingerprintOf, normalizeLocation } from './fingerprint.js';
export type { FingerprintInput, NormalizeOptions } from './fingerprint.js';
export {
  isScorable,
  overallScore,
  scoreFromFindings,
  SEVERITY_WEIGHT,
  worstSeverity,
} from './aggregate.js';
export type { AreaScore, OverallScore, ScoreInput } from './aggregate.js';
