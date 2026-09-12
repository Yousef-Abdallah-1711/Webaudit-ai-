import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminPlansPage from '../../app/(admin)/admin/plans/page';

describe('admin plan forms', () => {
  it('renders controls for creating and editing real plan limits', () => {
    const html = renderToStaticMarkup(createElement(AdminPlansPage));
    expect(html).toContain('Create plan');
    expect(html).toContain('Monthly credits');
    expect(html).toContain('Concurrent scan limit');
    expect(html).toContain('Retention days');
    expect(html).toContain('Save plan');
  });
});
