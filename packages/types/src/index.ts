/**
 * Shared contracts. The only cross-app coupling point.
 *
 * Constitution "Technology and Security Constraints": duplicating a type across
 * apps instead of importing it from here is a defect.
 *
 */

export * from './domain.js';
export * from './events.js';
