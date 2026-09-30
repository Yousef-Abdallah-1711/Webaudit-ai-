import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../app/theme';
import { describe, expect, it } from 'vitest';
import AdminPlansPage from '../../app/(admin)/admin/plans/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(createElement(I18nProvider, null, element));
}

describe('admin plan forms', () => {
  it('renders controls for creating and editing real plan limits', () => {
    const html = render(createElement(AdminPlansPage));
    expect(html).toContain('Create plan');
    expect(html).toContain('Monthly credits');
    expect(html).toContain('Concurrent scan limit');
    expect(html).toContain('Retention days');
    expect(html).toContain('Save plan');
  });
});
