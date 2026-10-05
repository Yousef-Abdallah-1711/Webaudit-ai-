import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import enPublic from '../../messages/en/public.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: keyof typeof enPublic, values?: Record<string, number>) => {
    let message = enPublic[key];
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replace(`{${name}, number}`, String(value));
    }
    return message;
  },
}));

describe('marketing workflow structure', () => {
  it('shows the approved step symbols and localized captions without changing the four-step flow', async () => {
    const { Loop } = await import('../../components/marketing/loop');
    const html = renderToStaticMarkup(await Loop());

    expect(html.match(/<article/g)).toHaveLength(4);
    expect(html).toContain('max-marketing-mobile:!grid-cols-1');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('>↗</span>');
    expect(html).toContain('>≡</span>');
    expect(html).toContain('>⌘</span>');
    expect(html).toContain('>✓</span>');
    expect(html).toContain('Measurement starts here');
    expect(html).toContain('You control the change');
    expect(html).toContain('3 credits to re-check');
    expect(html).toContain('Fresh go/no-go');
  });
});
