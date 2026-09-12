// @vitest-environment jsdom
/**
 * 2026-09-04 US7 admin adversarial review, Finding 7: none of the admin
 * frontend's unit tests exercised the error/401/403 rendering path — every
 * one used `renderToStaticMarkup`, under which a page's `useEffect` fetch
 * never fires, so only the pre-data shell was ever proven. A regression test
 * for Finding 2 (Users' fabricated "0 accounts") was the sole exception.
 *
 * This suite closes the gap for the five pages that review named
 * (`retrofitting all five pages`): Users, Capabilities, Billing (margin
 * report), Queue, and Plans. Each mocks its one `lib/api` call to reject
 * with the real `ApiError` the app throws on a 401/403 (or any failure) and
 * asserts the page renders that real message rather than silently showing
 * an empty or fabricated-looking table — using `renderClient` (real jsdom +
 * `act`), not the static-shell renderer every sibling test file uses.
 */
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderClient, type ClientRender } from '../helpers/render-client.js';
import { ApiError } from '../../lib/api.js';
import type * as ApiModule from '../../lib/api.js';

vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    getAdminUsers: vi.fn(),
    getAdminCapabilities: vi.fn(),
    getMarginReport: vi.fn(),
    getAdminQueueJobs: vi.fn(),
    getAdminPlans: vi.fn(),
    getAdminScans: vi.fn(),
    getAdminAuditLog: vi.fn(),
  };
});

const api = await import('../../lib/api.js');

let mounted: ClientRender | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.clearAllMocks();
});

const REFUSED = new ApiError(403, 'FORBIDDEN', 'Operators only.');

describe('admin pages render the real refusal, not an empty or fabricated table', () => {
  it('AdminUsersPage', async () => {
    vi.mocked(api.getAdminUsers).mockRejectedValueOnce(REFUSED);
    const { default: AdminUsersPage } = await import('../../app/(admin)/admin/users/page.js');
    mounted = await renderClient(createElement(AdminUsersPage));
    expect(mounted.html()).toContain('Operators only.');
    expect(mounted.html()).not.toContain('accounts');
  });

  it('AdminCapabilitiesPage', async () => {
    vi.mocked(api.getAdminCapabilities).mockRejectedValueOnce(REFUSED);
    const { default: AdminCapabilitiesPage } =
      await import('../../app/(admin)/admin/capabilities/page.js');
    mounted = await renderClient(createElement(AdminCapabilitiesPage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('AdminBillingPage (margin report)', async () => {
    vi.mocked(api.getMarginReport).mockRejectedValueOnce(REFUSED);
    const { default: AdminBillingPage } = await import('../../app/(admin)/admin/billing/page.js');
    mounted = await renderClient(createElement(AdminBillingPage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('AdminQueuePage', async () => {
    vi.mocked(api.getAdminQueueJobs).mockRejectedValueOnce(REFUSED);
    const { default: AdminQueuePage } = await import('../../app/(admin)/admin/queue/page.js');
    mounted = await renderClient(createElement(AdminQueuePage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('AdminPlansPage', async () => {
    vi.mocked(api.getAdminPlans).mockRejectedValueOnce(REFUSED);
    const { default: AdminPlansPage } = await import('../../app/(admin)/admin/plans/page.js');
    mounted = await renderClient(createElement(AdminPlansPage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('AdminScansPage', async () => {
    vi.mocked(api.getAdminScans).mockRejectedValueOnce(REFUSED);
    const { default: AdminScansPage } = await import('../../app/(admin)/admin/scans/page.js');
    mounted = await renderClient(createElement(AdminScansPage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('AdminLogPage', async () => {
    vi.mocked(api.getAdminAuditLog).mockRejectedValueOnce(REFUSED);
    const { default: AdminLogPage } = await import('../../app/(admin)/admin/log/page.js');
    mounted = await renderClient(createElement(AdminLogPage));
    expect(mounted.html()).toContain('Operators only.');
  });

  it('falls back to a generic message when the rejection is not an ApiError', async () => {
    vi.mocked(api.getAdminUsers).mockRejectedValueOnce(new Error('ECONNRESET'));
    const { default: AdminUsersPage } = await import('../../app/(admin)/admin/users/page.js');
    mounted = await renderClient(createElement(AdminUsersPage));
    expect(mounted.html()).toContain('Users could not be loaded.');
  });
});
