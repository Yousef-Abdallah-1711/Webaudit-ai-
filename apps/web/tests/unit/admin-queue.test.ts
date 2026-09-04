/**
 * T214 — the operator queue screen (`/admin/queue`).
 *
 * Same discipline as admin-billing.test.ts: `renderToStaticMarkup`, no
 * jsdom — the page's `useEffect` fetch never fires under static render, so
 * this asserts the pre-data shell: the header and its two inert bulk
 * actions, the empty table's column headers, and the trailing explanatory
 * note, which is kept verbatim from the mock regardless of real vs mock
 * data.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminQueuePage from '../../app/(admin)/admin/queue/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminQueuePage', () => {
  it('renders the header and its two inert bulk actions', () => {
    const html = render(createElement(AdminQueuePage));
    expect(html).toContain('Queue');
    expect(html).toContain('BullMQ');
    expect(html).toContain('Pause intake');
    expect(html).toContain('Retry stalled');
  });

  it('renders the table column headers before any data arrives', () => {
    const html = render(createElement(AdminQueuePage));
    expect(html).toContain('Job');
    expect(html).toContain('State');
    expect(html).toContain('Attempts');
    expect(html).toContain('Waiting since');
  });

  it('keeps the questionnaire-pause note verbatim', () => {
    const html = render(createElement(AdminQueuePage));
    expect(html).toContain('A questionnaire pause holds no worker slot');
    expect(html).toContain('only delivered areas are charged');
  });
});
