import type { ExecutionClass, TargetEnvironmentClassification } from '@webaudit/types';

/** The caller-supplied shape of a `ScopeDefinition` (FR-007); no `id`, no `createdAt`. */
export interface ScopeDefinitionInput {
  targetKind: 'WEB' | 'REPOSITORY';
  includedHosts?: readonly string[];
  excludedHosts?: readonly string[];
  includedPathPrefixes?: readonly string[];
  excludedPathPrefixes?: readonly string[];
  schemes?: readonly string[];
  ports?: readonly number[];
  repositoryFullName?: string | null;
  includedRefs?: readonly string[];
  excludedRefs?: readonly string[];
  includedAccountRefs?: readonly string[];
  includedRoles?: readonly string[];
  includedActionCategories?: readonly string[];
}

export interface AuthorizationBudgets {
  requestBudget: number;
  concurrencyBudget: number;
  durationBudget: number;
}

export interface CreateAuthorizationInput {
  targetId: string;
  requestingUserId: string;
  executionClasses: readonly ExecutionClass[];
  scope: ScopeDefinitionInput;
  environmentRestriction: readonly TargetEnvironmentClassification[];
  budgets: AuthorizationBudgets;
}
