import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminCapabilitiesPage from '../../app/(admin)/admin/capabilities/page';

describe('admin capability tier restrictions', () => {
  it('renders a plan-access control in the capability catalogue', () => {
    const html = renderToStaticMarkup(createElement(AdminCapabilitiesPage));
    expect(html).toContain('Plan access');
    expect(html).toContain('Free');
    expect(html).toContain('Starter');
    expect(html).toContain('Pro');
    expect(html).toContain('Business');
  });
});
