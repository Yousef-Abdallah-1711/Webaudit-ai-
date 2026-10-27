/**
 * SPEC 007 contract surface of `apps/api/src/services/authorization/index.ts`.
 *
 * T012b (FR-009): `ScopeDefinition` content is immutable because the barrel
 * never defines an operation that edits one — `narrowAuthorization` creates a new
 * scope rather than changing the old. That is structural, so it is asserted as
 * an export-surface property, not a runtime rejection. A future "convenience"
 * `updateScope` would fail here and force the FR-009 conversation.
 *
 * T027 (Phase 5) asserts every function `contracts/*.md` documents is exported
 * with the documented shape (arity and result type; behaviour is tested elsewhere).
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import * as authorization from '../../src/services/authorization/index.js';

describe('authorization barrel — Phase 3 exports (T016)', () => {
  it('exports the four User Story 1 functions', () => {
    for (const name of [
      'createAuthorization',
      'classifyEnvironment',
      'isAuthorized',
      'isInScope',
    ]) {
      expect(typeof (authorization as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});

describe('authorization barrel — Phase 4 exports (T025)', () => {
  it('exports revokeAuthorization, and keeps deriveState internal', () => {
    const surface = authorization as Record<string, unknown>;
    expect(typeof surface['revokeAuthorization']).toBe('function');
    expect(surface['deriveState']).toBeUndefined();
  });
});

describe('authorization barrel — documented contract surface (T027)', () => {
  const surface = authorization as Record<string, unknown>;

  it('exports every function the contracts document', () => {
    for (const name of [
      'createAuthorization',
      'classifyEnvironment',
      'revokeAuthorization',
      'narrowAuthorization',
      'isAuthorized',
      'isInScope',
    ]) {
      expect(typeof surface[name], name).toBe('function');
    }
  });

  it('matches the documented argument shapes (required parameters)', () => {
    // (db, input[, probe][, now?]): optional trailing `now` has a default, so it
    // does not count toward `length`; `probe` is required where a live control
    // re-check can happen (create, narrow).
    expect(authorization.createAuthorization.length).toBe(3);
    expect(authorization.narrowAuthorization.length).toBe(3);
    expect(authorization.classifyEnvironment.length).toBe(2);
    expect(authorization.revokeAuthorization.length).toBe(2);
    expect(authorization.isAuthorized.length).toBe(2);
    expect(authorization.isInScope.length).toBe(2);
  });

  it('matches the documented result types', () => {
    type Grant = Awaited<ReturnType<typeof authorization.createAuthorization>>;
    expectTypeOf<
      Awaited<ReturnType<typeof authorization.revokeAuthorization>>
    >().toEqualTypeOf<Grant>();
    expectTypeOf<
      Awaited<ReturnType<typeof authorization.narrowAuthorization>>
    >().toEqualTypeOf<Grant>();
    expectTypeOf<
      Awaited<ReturnType<typeof authorization.isAuthorized>>
    >().toEqualTypeOf<authorization.AuthzResult>();
    expectTypeOf(authorization.isInScope).returns.toEqualTypeOf<boolean>();
    expectTypeOf<
      authorization.NarrowAuthorizationInput['narrowedScope']
    >().toEqualTypeOf<authorization.ScopeDefinitionInput>();
  });
});

describe('authorization barrel — no ScopeDefinition mutation surface (T012b, FR-009)', () => {
  const exported = () => Object.keys(authorization);

  it('exposes no function that updates, edits, patches or replaces a scope', () => {
    const mutating = exported().filter((name) =>
      /(update|edit|patch|mutate|modify|replace|widen|set).*scope|scope.*(update|edit|patch|mutate|modify|replace|widen|set)/i.test(
        name,
      ),
    );
    expect(mutating).toEqual([]);
  });

  it('exposes no raw ScopeDefinition model accessor or prisma handle', () => {
    for (const name of exported()) {
      expect(name).not.toMatch(/^(prisma|db|client)$/i);
      expect(name).not.toMatch(/scopeDefinition/i);
    }
  });

  it('exports only documented functions (plus error classes)', () => {
    // Every exported function is a documented lifecycle/check function, so an
    // undocumented scope-writing helper cannot slip in unnoticed.
    const functions = exported().filter(
      (name) =>
        typeof (authorization as Record<string, unknown>)[name] === 'function' &&
        !name.endsWith('Error'),
    );
    const documented = new Set([
      'createAuthorization',
      'classifyEnvironment',
      'revokeAuthorization',
      'narrowAuthorization',
      'isAuthorized',
      'isInScope',
      'normalizeHost',
      'normalizePath',
    ]);
    expect(functions.filter((name) => !documented.has(name))).toEqual([]);
  });
});
