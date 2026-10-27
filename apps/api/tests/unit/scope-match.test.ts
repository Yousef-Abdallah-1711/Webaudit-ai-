/**
 * T008 — SPEC 007 `contracts/scope-matching-contract.md` (FR-007/FR-008/FR-010).
 *
 * `isInScope` is pure: no database, no network. Every case here pins one rule of
 * the contract so a later "simplification" cannot silently widen a Scope.
 */

import { describe, expect, it } from 'vitest';
import {
  isInScope,
  type RepositoryDestination,
  type ScopeDefinitionData,
  type WebDestination,
} from '../../src/services/authorization/scope-match.js';

function webScope(overrides: Partial<ScopeDefinitionData> = {}): ScopeDefinitionData {
  return {
    targetKind: 'WEB',
    includedHosts: ['example.com'],
    excludedHosts: [],
    includedPathPrefixes: [''],
    excludedPathPrefixes: [],
    schemes: [],
    ports: [],
    repositoryFullName: null,
    includedRefs: [],
    excludedRefs: [],
    ...overrides,
  };
}

function repoScope(overrides: Partial<ScopeDefinitionData> = {}): ScopeDefinitionData {
  return {
    targetKind: 'REPOSITORY',
    includedHosts: [],
    excludedHosts: [],
    includedPathPrefixes: [''],
    excludedPathPrefixes: [],
    schemes: [],
    ports: [],
    repositoryFullName: 'acme/widgets',
    includedRefs: ['main'],
    excludedRefs: [],
    ...overrides,
  };
}

function web(overrides: Partial<WebDestination> = {}): WebDestination {
  return { host: 'example.com', path: '/', scheme: 'https', port: null, ...overrides };
}

function repo(overrides: Partial<RepositoryDestination> = {}): RepositoryDestination {
  return { repositoryFullName: 'acme/widgets', ref: 'main', path: '/', ...overrides };
}

describe('isInScope — host matching', () => {
  it('wildcard *.example.com admits exactly one extra label', () => {
    const scope = webScope({ includedHosts: ['*.example.com'] });
    expect(isInScope(scope, web({ host: 'a.example.com' }))).toBe(true);
  });

  it('wildcard *.example.com does not admit two extra labels', () => {
    const scope = webScope({ includedHosts: ['*.example.com'] });
    expect(isInScope(scope, web({ host: 'a.b.example.com' }))).toBe(false);
  });

  it('wildcard *.example.com does not admit the bare domain', () => {
    const scope = webScope({ includedHosts: ['*.example.com'] });
    expect(isInScope(scope, web({ host: 'example.com' }))).toBe(false);
  });

  it('exact example.com admits example.com', () => {
    expect(isInScope(webScope(), web({ host: 'example.com' }))).toBe(true);
  });

  it('exact example.com does not admit a subdomain', () => {
    expect(isInScope(webScope(), web({ host: 'a.example.com' }))).toBe(false);
  });

  it('does not admit a look-alike suffix without a dot boundary', () => {
    const scope = webScope({ includedHosts: ['*.example.com'] });
    expect(isInScope(scope, web({ host: 'attackerexample.com' }))).toBe(false);
    expect(isInScope(scope, web({ host: 'a.attackerexample.com' }))).toBe(false);
  });

  it('empty includedHosts admits nothing (fail closed, no implicit wildcard)', () => {
    expect(isInScope(webScope({ includedHosts: [] }), web())).toBe(false);
  });

  it('exclusion beats an overlapping inclusion wildcard', () => {
    const scope = webScope({
      includedHosts: ['*.example.com'],
      excludedHosts: ['checkout.example.com'],
    });
    expect(isInScope(scope, web({ host: 'checkout.example.com' }))).toBe(false);
    expect(isInScope(scope, web({ host: 'api.example.com' }))).toBe(true);
  });

  it('an exclusion wildcard applies the same single-level rule', () => {
    const scope = webScope({
      includedHosts: ['*.example.com', 'a.b.example.com'],
      excludedHosts: ['*.example.com'],
    });
    expect(isInScope(scope, web({ host: 'x.example.com' }))).toBe(false);
    expect(isInScope(scope, web({ host: 'a.b.example.com' }))).toBe(true);
  });
});

describe('isInScope — host normalization', () => {
  it('lowercases destination host and pattern entries', () => {
    expect(isInScope(webScope(), web({ host: 'EXAMPLE.COM' }))).toBe(true);
    expect(isInScope(webScope({ includedHosts: ['Example.COM'] }), web())).toBe(true);
  });

  it('strips exactly one trailing dot', () => {
    expect(isInScope(webScope(), web({ host: 'example.com.' }))).toBe(true);
    expect(isInScope(webScope({ includedHosts: ['example.com.'] }), web())).toBe(true);
    expect(isInScope(webScope(), web({ host: 'example.com..' }))).toBe(false);
  });

  it('folds a Unicode host and its punycode form to the same value', () => {
    const scope = webScope({ includedHosts: ['xn--bcher-kva.example'] });
    expect(isInScope(scope, web({ host: 'bücher.example' }))).toBe(true);
    expect(isInScope(scope, web({ host: 'xn--bcher-kva.example' }))).toBe(true);
  });

  it('a Unicode homograph does not match the ASCII pattern', () => {
    // Cyrillic "а" (U+0430) in place of Latin "a".
    expect(isInScope(webScope({ includedHosts: ['apple.com'] }), web({ host: 'аpple.com' }))).toBe(
      false,
    );
  });

  it('refuses an unparseable host rather than guessing', () => {
    expect(isInScope(webScope(), web({ host: '' }))).toBe(false);
    expect(isInScope(webScope(), web({ host: 'exa mple.com' }))).toBe(false);
  });
});

describe('isInScope — path prefixes', () => {
  const scope = webScope({ includedPathPrefixes: ['/api'] });

  it('matches on a path-segment boundary', () => {
    expect(isInScope(scope, web({ path: '/api' }))).toBe(true);
    expect(isInScope(scope, web({ path: '/api/v1/users' }))).toBe(true);
    expect(isInScope(scope, web({ path: '/apiary' }))).toBe(false);
  });

  it('treats a trailing slash on destination and entry as the same boundary', () => {
    expect(isInScope(scope, web({ path: '/api/' }))).toBe(true);
    expect(isInScope(webScope({ includedPathPrefixes: ['/api/'] }), web({ path: '/api' }))).toBe(
      true,
    );
  });

  it('an empty-string prefix is the root and admits every path', () => {
    expect(isInScope(webScope({ includedPathPrefixes: [''] }), web({ path: '/anything/x' }))).toBe(
      true,
    );
  });

  it('no included prefix admits nothing (the root must be listed explicitly)', () => {
    expect(isInScope(webScope({ includedPathPrefixes: [] }), web({ path: '/' }))).toBe(false);
  });

  it('percent-decodes before matching', () => {
    expect(isInScope(scope, web({ path: '/%61pi/users' }))).toBe(true);
  });

  it('resolves dot segments before matching (traversal out of the prefix is refused)', () => {
    expect(isInScope(scope, web({ path: '/api/../admin' }))).toBe(false);
    expect(isInScope(scope, web({ path: '/api/%2e%2e/admin' }))).toBe(false);
    expect(isInScope(scope, web({ path: '/admin/../api/users' }))).toBe(true);
  });

  it('cannot traverse above the root', () => {
    expect(isInScope(scope, web({ path: '/../api' }))).toBe(true);
    expect(isInScope(scope, web({ path: '/%2e%2e/%2e%2e/admin' }))).toBe(false);
  });

  it('refuses a malformed percent-encoding', () => {
    expect(isInScope(webScope(), web({ path: '/%zz' }))).toBe(false);
  });

  it('applies exclusion path prefixes regardless of host', () => {
    const s = webScope({ includedPathPrefixes: [''], excludedPathPrefixes: ['/admin'] });
    expect(isInScope(s, web({ path: '/admin/users' }))).toBe(false);
    expect(isInScope(s, web({ path: '/%61dmin' }))).toBe(false);
    expect(isInScope(s, web({ path: '/adminish' }))).toBe(true);
  });

  it('discards the query string and fragment before matching', () => {
    expect(isInScope(scope, web({ path: '/api?x=/admin' }))).toBe(true);
    expect(isInScope(scope, web({ path: '/admin?next=/api' }))).toBe(false);
    expect(isInScope(scope, web({ path: '/api#/admin' }))).toBe(true);
  });
});

describe('isInScope — scheme and port', () => {
  it('empty schemes admit both http and https', () => {
    expect(isInScope(webScope(), web({ scheme: 'http' }))).toBe(true);
    expect(isInScope(webScope(), web({ scheme: 'https' }))).toBe(true);
  });

  it('a narrowed schemes list refuses the other scheme', () => {
    const s = webScope({ schemes: ['https'] });
    expect(isInScope(s, web({ scheme: 'https' }))).toBe(true);
    expect(isInScope(s, web({ scheme: 'http' }))).toBe(false);
  });

  it('refuses any scheme other than http/https', () => {
    expect(isInScope(webScope(), web({ scheme: 'ftp' }))).toBe(false);
    expect(isInScope(webScope(), web({ scheme: 'file' }))).toBe(false);
  });

  it('scheme comparison is case-insensitive', () => {
    expect(isInScope(webScope({ schemes: ['https'] }), web({ scheme: 'HTTPS' }))).toBe(true);
  });

  it('an absent port resolves to the scheme standard port', () => {
    expect(isInScope(webScope(), web({ scheme: 'https', port: null }))).toBe(true);
    expect(isInScope(webScope(), web({ scheme: 'http', port: null }))).toBe(true);
    expect(isInScope(webScope(), web({ scheme: 'https', port: 443 }))).toBe(true);
  });

  it('empty ports means the standard port only', () => {
    expect(isInScope(webScope(), web({ scheme: 'https', port: 8443 }))).toBe(false);
    expect(isInScope(webScope(), web({ scheme: 'http', port: 443 }))).toBe(false);
  });

  it('an explicit ports list is compared against the resolved port, never against "absent"', () => {
    const s = webScope({ ports: [8443] });
    expect(isInScope(s, web({ scheme: 'https', port: 8443 }))).toBe(true);
    expect(isInScope(s, web({ scheme: 'https', port: null }))).toBe(false);
    const std = webScope({ ports: [443] });
    expect(isInScope(std, web({ scheme: 'https', port: null }))).toBe(true);
  });
});

describe('isInScope — repository scopes', () => {
  it('admits the exact repository on an included ref', () => {
    expect(isInScope(repoScope(), repo())).toBe(true);
  });

  it('compares repositoryFullName case-insensitively (canonical lowercase)', () => {
    expect(isInScope(repoScope(), repo({ repositoryFullName: 'Acme/Widgets' }))).toBe(true);
  });

  it('refuses a different repository, including a suffix look-alike', () => {
    expect(isInScope(repoScope(), repo({ repositoryFullName: 'acme/widgets2' }))).toBe(false);
    expect(isInScope(repoScope(), repo({ repositoryFullName: 'evil/acme/widgets' }))).toBe(false);
  });

  it('a null scope repositoryFullName admits nothing', () => {
    expect(isInScope(repoScope({ repositoryFullName: null }), repo())).toBe(false);
  });

  it('refs are exact strings: no glob, case-sensitive', () => {
    const s = repoScope({ includedRefs: ['release/*', 'main'] });
    expect(isInScope(s, repo({ ref: 'release/1.0' }))).toBe(false);
    expect(isInScope(s, repo({ ref: 'Main' }))).toBe(false);
    expect(isInScope(s, repo({ ref: 'main' }))).toBe(true);
  });

  it('an excluded ref beats an included one', () => {
    const s = repoScope({ includedRefs: ['main'], excludedRefs: ['main'] });
    expect(isInScope(s, repo())).toBe(false);
  });

  it('empty includedRefs admits nothing', () => {
    expect(isInScope(repoScope({ includedRefs: [] }), repo())).toBe(false);
  });

  it('repository paths use the same normalization as web paths', () => {
    const s = repoScope({ includedPathPrefixes: ['/src'], excludedPathPrefixes: ['/src/secrets'] });
    expect(isInScope(s, repo({ path: '/src/app.ts' }))).toBe(true);
    expect(isInScope(s, repo({ path: '/src/../etc/passwd' }))).toBe(false);
    expect(isInScope(s, repo({ path: '/src/secrets/key' }))).toBe(false);
    expect(isInScope(s, repo({ path: '/src/%73ecrets/key' }))).toBe(false);
  });
});

describe('isInScope — kind mismatch and independence of dimensions', () => {
  it('a WEB scope never admits a repository destination and vice versa', () => {
    expect(isInScope(webScope(), repo())).toBe(false);
    expect(isInScope(repoScope(), web())).toBe(false);
  });

  it('any one exclusion dimension disqualifies, whatever the others say', () => {
    const s = webScope({
      includedHosts: ['*.example.com'],
      excludedHosts: ['checkout.example.com'],
      excludedPathPrefixes: ['/admin'],
    });
    expect(isInScope(s, web({ host: 'api.example.com', path: '/admin' }))).toBe(false);
    expect(isInScope(s, web({ host: 'checkout.example.com', path: '/ok' }))).toBe(false);
    expect(isInScope(s, web({ host: 'api.example.com', path: '/ok' }))).toBe(true);
  });

  it('a redirect target is judged on its own, not by the originating host (FR-010)', () => {
    const s = webScope({ includedHosts: ['example.com'] });
    expect(isInScope(s, web({ host: 'cdn.thirdparty.net' }))).toBe(false);
  });

  it('does not mutate the scope or destination it is given', () => {
    const s = webScope({ includedHosts: ['*.Example.com'] });
    const d = web({ host: 'A.Example.com.' });
    const sCopy = structuredClone(s);
    const dCopy = structuredClone(d);
    isInScope(s, d);
    expect(s).toEqual(sCopy);
    expect(d).toEqual(dCopy);
  });
});
