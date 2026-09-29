import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { monitoringPath } from '../../src/app.js';

function requestFor(path: string, routePath?: string): Request {
  return {
    path,
    ...(routePath === undefined ? {} : { route: { path: routePath } }),
  } as Request;
}

describe('monitoringPath', () => {
  it('replaces a token-shaped route parameter with its route placeholder', () => {
    expect(monitoringPath(requestFor('/auth/verify/secret-value', '/verify/:token'))).toBe(
      '/auth/verify/:token',
    );
  });

  it('redacts other credential-shaped parameter names generically', () => {
    expect(monitoringPath(requestFor('/reset/private-value', '/:resetSecret'))).toBe(
      '/reset/:resetSecret',
    );
  });

  it('preserves paths whose route parameters are not secret-shaped', () => {
    expect(monitoringPath(requestFor('/admin/users/user-123', '/users/:id'))).toBe(
      '/admin/users/user-123',
    );
  });

  it('preserves the path when no route pattern is available', () => {
    expect(monitoringPath(requestFor('/health'))).toBe('/health');
  });
});
