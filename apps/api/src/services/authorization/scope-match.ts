/**
 * T013 — SPEC 007 `contracts/scope-matching-contract.md` (FR-007/FR-008/FR-010).
 *
 * `isInScope` answers one question: does this `ScopeDefinition` admit this one
 * destination? It is pure — no I/O, no DNS, no redirect following — so a crawler
 * or browser can call it per hop without going through the full authorization
 * check (FR-010: every destination is judged on its own, never by association
 * with an earlier admitted one).
 *
 * Everything fails closed. A host that cannot be normalized, a malformed
 * percent-escape, an unknown scheme, an empty inclusion list: each yields
 * `false`. There is no implicit wildcard anywhere — an empty `includedHosts`,
 * `includedPathPrefixes` or `includedRefs` admits nothing, and the root must be
 * listed explicitly as the empty-string prefix.
 *
 * Normalization is applied to the destination *and* every pattern entry before
 * any comparison (FR-008), and is exported so `createAuthorization`'s
 * host-boundedness check can share the identical rules instead of inventing its
 * own.
 */

import { domainToASCII } from 'node:url';

/** The fields of a `ScopeDefinition` row that matching reads. */
export interface ScopeDefinitionData {
  targetKind: 'WEB' | 'REPOSITORY';
  includedHosts: readonly string[];
  excludedHosts: readonly string[];
  includedPathPrefixes: readonly string[];
  excludedPathPrefixes: readonly string[];
  schemes: readonly string[];
  ports: readonly number[];
  repositoryFullName: string | null;
  includedRefs: readonly string[];
  excludedRefs: readonly string[];
}

export interface WebDestination {
  host: string;
  path: string;
  scheme: string;
  /** Absent means the scheme's standard port. */
  port?: number | null;
}

export interface RepositoryDestination {
  repositoryFullName: string;
  ref: string;
  path: string;
}

const STANDARD_PORTS: Readonly<Record<string, number>> = { http: 80, https: 443 };
const LABEL_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Lowercase, strip exactly one trailing dot, punycode-fold. Returns `null` for
 * anything that is not a well-formed hostname so callers can fail closed.
 */
export function normalizeHost(raw: string): string | null {
  const lowered = raw.toLowerCase();
  const stripped = lowered.endsWith('.') ? lowered.slice(0, -1) : lowered;
  if (stripped === '') return null;
  const folded = domainToASCII(stripped);
  if (folded === '') return null;
  for (const label of folded.split('.')) {
    if (!LABEL_PATTERN.test(label)) return null;
  }
  return folded;
}

/**
 * Discard query/fragment, percent-decode once, resolve `.`/`..` against the
 * root, and return the canonical path with no trailing slash (`''` is the
 * root). `null` on a malformed percent-escape.
 */
export function normalizePath(raw: string): string | null {
  const cut = raw.search(/[?#]/);
  const withoutQuery = cut === -1 ? raw : raw.slice(0, cut);
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  const resolved: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.length === 0 ? '' : `/${resolved.join('/')}`;
}

function matchesHostPattern(pattern: string, host: string): boolean {
  if (pattern.startsWith('*.')) {
    const base = normalizeHost(pattern.slice(2));
    if (base === null || !host.endsWith(`.${base}`)) return false;
    const prefix = host.slice(0, host.length - base.length - 1);
    return prefix.length > 0 && !prefix.includes('.');
  }
  return normalizeHost(pattern) === host;
}

function matchesPathPrefix(prefix: string, path: string): boolean {
  const normalizedPrefix = normalizePath(prefix);
  if (normalizedPrefix === null) return false;
  if (normalizedPrefix === '') return true;
  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}

function anyHost(patterns: readonly string[], host: string): boolean {
  return patterns.some((pattern) => matchesHostPattern(pattern, host));
}

function anyPath(prefixes: readonly string[], path: string): boolean {
  return prefixes.some((prefix) => matchesPathPrefix(prefix, path));
}

function isInWebScope(scope: ScopeDefinitionData, destination: WebDestination): boolean {
  const host = normalizeHost(destination.host);
  const path = normalizePath(destination.path);
  const scheme = destination.scheme.toLowerCase();
  const standardPort = STANDARD_PORTS[scheme];
  if (host === null || path === null || standardPort === undefined) return false;
  const port = destination.port ?? standardPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;

  // Exclusion lists are ORed across dimensions and checked before inclusion.
  if (anyHost(scope.excludedHosts, host) || anyPath(scope.excludedPathPrefixes, path)) {
    return false;
  }

  const schemeAdmitted =
    scope.schemes.length === 0
      ? true
      : scope.schemes.some((allowed) => allowed.toLowerCase() === scheme);
  const portAdmitted =
    scope.ports.length === 0 ? port === standardPort : scope.ports.includes(port);

  return (
    schemeAdmitted &&
    portAdmitted &&
    anyHost(scope.includedHosts, host) &&
    anyPath(scope.includedPathPrefixes, path)
  );
}

function isInRepositoryScope(
  scope: ScopeDefinitionData,
  destination: RepositoryDestination,
): boolean {
  if (scope.repositoryFullName === null) return false;
  if (scope.repositoryFullName.toLowerCase() !== destination.repositoryFullName.toLowerCase()) {
    return false;
  }
  const path = normalizePath(destination.path);
  if (path === null) return false;

  if (scope.excludedRefs.includes(destination.ref) || anyPath(scope.excludedPathPrefixes, path)) {
    return false;
  }
  return scope.includedRefs.includes(destination.ref) && anyPath(scope.includedPathPrefixes, path);
}

export function isInScope(
  scope: ScopeDefinitionData,
  destination: WebDestination | RepositoryDestination,
): boolean {
  if ('repositoryFullName' in destination) {
    return scope.targetKind === 'REPOSITORY' && isInRepositoryScope(scope, destination);
  }
  return scope.targetKind === 'WEB' && isInWebScope(scope, destination);
}
