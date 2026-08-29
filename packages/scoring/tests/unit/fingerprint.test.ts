/**
 * T073 — R3's fingerprint.
 *
 * The collision test is the one that matters. Everything else here is
 * determinism, which is easy to get right; injectivity is the property that
 * silently fails and takes a finding with it.
 */

import { describe, expect, it } from 'vitest';
import { fingerprintOf, normalizeLocation } from '../../src/index.js';

const BASE = { targetId: 'tgt_1', module: 'SECURITY' as const, checkId: 'headers.csp' };

describe('fingerprintOf', () => {
  it('is deterministic across calls', () => {
    const a = fingerprintOf({ ...BASE, parts: ['https://example.com/', 'csp'] });
    const b = fingerprintOf({ ...BASE, parts: ['https://example.com/', 'csp'] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates two targets with the same defect', () => {
    const a = fingerprintOf({ ...BASE, targetId: 'tgt_1', parts: ['/'] });
    const b = fingerprintOf({ ...BASE, targetId: 'tgt_2', parts: ['/'] });
    expect(a).not.toBe(b);
  });

  it('separates two checks and two modules', () => {
    const base = fingerprintOf({ ...BASE, parts: ['/'] });
    expect(fingerprintOf({ ...BASE, checkId: 'headers.hsts', parts: ['/'] })).not.toBe(base);
    expect(fingerprintOf({ ...BASE, module: 'SEO', parts: ['/'] })).not.toBe(base);
  });

  it('is order-sensitive', () => {
    expect(fingerprintOf({ ...BASE, parts: ['a', 'b'] })).not.toBe(
      fingerprintOf({ ...BASE, parts: ['b', 'a'] }),
    );
  });

  describe('injectivity — the reason parts are length-prefixed', () => {
    /**
     * With any separator, one of these pairs collides, two findings become one
     * issue, and one of them vanishes from the report. Which one depends on
     * insertion order.
     */
    const shouldAllDiffer: readonly (readonly string[])[] = [
      ['a|b', 'c'],
      ['a', 'b|c'],
      ['a', 'b', 'c'],
      ['a:b', 'c'],
      ['a', 'b:c'],
      ['ab', 'c'],
      ['a', 'bc'],
      ['a\u0000b', 'c'],
      ['a', 'b\u0000c'],
      ['a,b', 'c'],
      ['a', 'b,c'],
      ['', 'abc'],
      ['abc', ''],
      ['a', '', 'bc'],
    ];

    it('gives every one of these a distinct fingerprint', () => {
      const seen = new Map<string, readonly string[]>();
      for (const parts of shouldAllDiffer) {
        const id = fingerprintOf({ ...BASE, parts });
        const clash = seen.get(id);
        expect(
          clash,
          `${JSON.stringify(parts)} collides with ${JSON.stringify(clash)}`,
        ).toBeUndefined();
        seen.set(id, parts);
      }
      expect(seen.size).toBe(shouldAllDiffer.length);
    });

    it('cannot be forged by a part that imitates the framing', () => {
      // The encoding is `<byteLength>:<bytes>`. A part that looks like framing
      // must not be able to reproduce a different part list.
      expect(fingerprintOf({ ...BASE, parts: ['1:a'] })).not.toBe(
        fingerprintOf({ ...BASE, parts: ['a'] }),
      );
      expect(fingerprintOf({ ...BASE, parts: ['3:abc', '1:d'] })).not.toBe(
        fingerprintOf({ ...BASE, parts: ['abc', 'd'] }),
      );
    });

    it('counts bytes, not characters, so multi-byte content is unambiguous', () => {
      // 'é' is two bytes. A character count would frame it wrongly.
      expect(fingerprintOf({ ...BASE, parts: ['é'] })).not.toBe(
        fingerprintOf({ ...BASE, parts: ['e'] }),
      );
      expect(fingerprintOf({ ...BASE, parts: ['éa'] })).not.toBe(
        fingerprintOf({ ...BASE, parts: ['é', 'a'] }),
      );
    });

    it('does not let a checkId imitate the parts framing', () => {
      expect(fingerprintOf({ ...BASE, checkId: 'x', parts: ['y'] })).not.toBe(
        fingerprintOf({ ...BASE, checkId: 'x\u00001:y', parts: [] }),
      );
    });
  });
});

describe('normalizeLocation', () => {
  it('drops a query string and a fragment', () => {
    expect(normalizeLocation('https://example.com/page?v=123#top')).toBe(
      'https://example.com/page',
    );
  });

  it('drops a cache-busting hash from an asset name', () => {
    expect(normalizeLocation('https://example.com/assets/main.4f3a9c1b.js')).toBe(
      'https://example.com/assets/main.js',
    );
    expect(normalizeLocation('/static/styles-8e2d4f6a.min.css')).toBe('/static/styles.min.css');
  });

  it('strips the workspace root so the same repo checked out twice is one issue', () => {
    expect(
      normalizeLocation('/var/scans/abc123/src/app.ts', { workspaceRoot: '/var/scans/abc123' }),
    ).toBe('src/app.ts');
    expect(
      normalizeLocation('C:\\scans\\abc123\\src\\app.ts', { workspaceRoot: 'C:\\scans\\abc123' }),
    ).toBe('src/app.ts');
  });

  it('gives one answer for a path audited on Windows and on Linux', () => {
    expect(normalizeLocation('src\\components\\Button.tsx')).toBe('src/components/Button.tsx');
  });

  it('drops a trailing line and column, which move with unrelated edits', () => {
    expect(normalizeLocation('src/app.ts:42:7')).toBe('src/app.ts');
    expect(normalizeLocation('src/app.ts:42')).toBe('src/app.ts');
  });

  it('leaves a selector alone', () => {
    expect(normalizeLocation('main > .card:nth-child(2) button')).toBe(
      'main > .card:nth-child(2) button',
    );
  });

  it('normalises a bare origin to a single slash rather than an empty string', () => {
    expect(normalizeLocation('https://example.com/')).toBe('https://example.com');
    expect(normalizeLocation('/')).toBe('/');
    expect(normalizeLocation('')).toBe('/');
  });

  it('makes two locations that differ only in volatile parts equal', () => {
    const a = normalizeLocation('https://example.com/app/main.abc12345.js?v=1');
    const b = normalizeLocation('https://example.com/app/main.def67890.js?v=2');
    expect(a).toBe(b);

    // And therefore one fingerprint, which is what FR-064's recurrence
    // detection depends on across two deploys of the same bundle.
    expect(fingerprintOf({ ...BASE, parts: [a] })).toBe(fingerprintOf({ ...BASE, parts: [b] }));
  });

  it('keeps two genuinely different paths different', () => {
    expect(normalizeLocation('/app/main.js')).not.toBe(normalizeLocation('/app/vendor.js'));
  });
});
