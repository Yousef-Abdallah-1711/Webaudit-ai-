import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from '../visual/harness.js';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_DIR = `${REPO_ROOT}apps/web`;
const PORT = 4186;
const EXTERNAL_BASE_URL = process.env.MARKETING_SURFACE_BASE_URL;

let server: ServerHandle | undefined;

async function hasSameComputedToken(
  locator: import('@playwright/test').Locator,
  property:
    'backgroundColor' | 'backgroundImage' | 'borderColor' | 'boxShadow' | 'color' | 'outlineColor',
  token: string,
): Promise<boolean> {
  return locator.evaluate(
    (element, { cssProperty, cssToken }) => {
      const propertyName = cssProperty.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const probe = document.createElement('i');
      probe.style.setProperty(propertyName, `var(${cssToken})`);
      document.body.append(probe);
      const expected = getComputedStyle(probe).getPropertyValue(propertyName);
      const actual = getComputedStyle(element).getPropertyValue(propertyName);
      probe.remove();
      return cssProperty === 'boxShadow' ? actual.endsWith(expected) : actual === expected;
    },
    { cssProperty: property, cssToken: token },
  );
}

async function focusWithKeyboard(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
): Promise<void> {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Keyboard focus did not reach the requested control');
}

test.beforeAll(async () => {
  if (EXTERNAL_BASE_URL) return;
  test.setTimeout(180_000);
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => {
  server?.close();
});

test('marketing product surfaces retain the approved scanner, report, and remediation hierarchy', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const baseUrl = EXTERNAL_BASE_URL ?? (server ? `${server.url}/` : undefined);
  if (!baseUrl) throw new Error('The marketing surface server did not start');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[data-scan-handoff]').waitFor({ timeout: 120_000 });

  const heroScanner = await page.locator('[data-scan-handoff]').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      backgroundImage: style.backgroundImage,
      shadow: style.boxShadow,
    };
  });
  expect(heroScanner.borderWidth).toBe('1px');
  expect(heroScanner.radius).toBe('17px');
  expect(heroScanner.backgroundImage).toContain('linear-gradient');
  expect(heroScanner.shadow).toContain('inset');

  const reportFrame = await page.locator('#report-showcase > div').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderTopLeftRadius,
      padding: style.paddingTop,
    };
  });
  expect(reportFrame).toEqual({ radius: '17px', padding: '7px' });

  const finding = await page.locator('#report-showcase article').evaluate((element) => {
    const style = getComputedStyle(element);
    return { paddingTop: style.paddingTop, paddingLeft: style.paddingLeft };
  });
  expect(finding).toEqual({ paddingTop: '16px', paddingLeft: '13px' });

  const repair = await page.locator('#remediation article').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      borderColor: style.borderTopColor,
      shadow: style.boxShadow,
    };
  });
  expect(repair.backgroundImage).toContain('linear-gradient');
  expect(repair.borderColor).toBe('rgba(214, 220, 255, 0.18)');
  expect(repair.shadow).toContain('0, 0, 0, 0.2');

  const promptBox = await page
    .locator('#remediation .rounded-marketing-prompt')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderTopLeftRadius, backgroundColor: style.backgroundColor };
    });
  expect(promptBox).toEqual({ radius: '10px', backgroundColor: 'rgba(0, 0, 0, 0)' });

  const workflowBoundary = await page.locator('#remediation .border-s').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      direction: style.direction,
      borderTop: style.borderTopWidth,
      borderRight: style.borderRightWidth,
      borderBottom: style.borderBottomWidth,
      borderLeft: style.borderLeftWidth,
      borderInlineStart: style.borderInlineStartWidth,
    };
  });
  expect(workflowBoundary.borderTop).toBe('0px');
  expect(workflowBoundary.borderBottom).toBe('0px');
  expect(workflowBoundary.borderInlineStart).toBe('1px');
  expect(
    workflowBoundary.direction === 'rtl'
      ? workflowBoundary.borderLeft
      : workflowBoundary.borderRight,
  ).toBe('0px');
  expect(
    workflowBoundary.direction === 'rtl'
      ? workflowBoundary.borderRight
      : workflowBoundary.borderLeft,
  ).toBe('1px');

  const workflowChip = page.locator(
    '#remediation span.rounded-control.border-border-marketing-repair',
  );
  expect(await workflowChip.count()).toBe(1);
  expect(await hasSameComputedToken(workflowChip, 'borderColor', '--border-marketing-repair')).toBe(
    true,
  );

  const remediationCopy = page.locator('#remediation article button');
  expect(
    await hasSameComputedToken(remediationCopy, 'borderColor', '--border-marketing-inverse'),
  ).toBe(true);
  const copyGeometry = await remediationCopy.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { width: bounds.width, height: bounds.height, borderWidth: style.borderWidth };
  });
  await remediationCopy.hover();
  await expect
    .poll(() => hasSameComputedToken(remediationCopy, 'backgroundColor', '--surface-hero'))
    .toBe(true);
  expect(
    await remediationCopy.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: bounds.width, height: bounds.height, borderWidth: style.borderWidth };
    }),
  ).toEqual(copyGeometry);
  await focusWithKeyboard(page, remediationCopy);
  await expect
    .poll(() => hasSameComputedToken(remediationCopy, 'outlineColor', '--brand-highlight'))
    .toBe(true);
  expect(await remediationCopy.evaluate((element) => getComputedStyle(element).outlineOffset)).toBe(
    '2px',
  );
  expect(
    await remediationCopy.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: bounds.width, height: bounds.height, borderWidth: style.borderWidth };
    }),
  ).toEqual(copyGeometry);

  const publicOrigin = new URL(baseUrl).origin;
  await page.goto(`${publicOrigin}/ar`, { waitUntil: 'domcontentloaded' });
  await page.locator('#final-cta').waitFor();

  const finalScanner = await page.locator('#final-cta form').evaluate((form) => {
    const style = getComputedStyle(form.parentElement!);
    return {
      radius: style.borderTopLeftRadius,
      backgroundImage: style.backgroundImage,
      borderColor: style.borderTopColor,
    };
  });
  expect(finalScanner.radius).toBe('17px');
  expect(finalScanner.backgroundImage).toContain('linear-gradient');
  expect(
    await hasSameComputedToken(
      page.locator('#final-cta form').locator('..'),
      'borderColor',
      '--border-marketing-repair',
    ),
  ).toBe(true);
  expect(
    await hasSameComputedToken(
      page.locator('#final-cta form').locator('..'),
      'backgroundImage',
      '--gradient-marketing-repair',
    ),
  ).toBe(true);
  expect(
    await hasSameComputedToken(
      page.locator('#final-cta form').locator('..'),
      'boxShadow',
      '--shadow-marketing-repair',
    ),
  ).toBe(true);

  const finalInput = page.locator('#final-cta input');
  const finalGrid = page.locator('#final-cta form > div');
  expect(await hasSameComputedToken(finalInput, 'backgroundColor', '--surface-dark')).toBe(true);
  expect(await hasSameComputedToken(finalInput, 'color', '--text-marketing-inverse')).toBe(true);
  expect(await hasSameComputedToken(finalInput, 'borderColor', '--border-marketing-scanner')).toBe(
    true,
  );
  await expect
    .poll(() => finalGrid.evaluate((element) => getComputedStyle(element).columnGap))
    .toBe('10px');

  const readInputGeometry = () =>
    finalInput.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        borderWidth: style.borderWidth,
        padding: style.padding,
        radius: style.borderRadius,
      };
    });
  const inputGeometry = await readInputGeometry();
  expect(inputGeometry.borderWidth).toBe('1px');
  await finalInput.hover();
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'borderColor', '--brand-marketing'))
    .toBe(true);
  expect(await readInputGeometry()).toEqual(inputGeometry);

  await finalInput.fill('https://example.com');
  expect(await finalInput.evaluate((element) => (element as HTMLInputElement).value)).toBe(
    'https://example.com',
  );
  expect(await hasSameComputedToken(finalInput, 'backgroundColor', '--surface-dark')).toBe(true);

  await focusWithKeyboard(page, finalInput);
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'outlineColor', '--brand-highlight'))
    .toBe(true);
  expect(await finalInput.evaluate((element) => getComputedStyle(element).outlineOffset)).toBe(
    '2px',
  );
  expect(await readInputGeometry()).toEqual(inputGeometry);
  await finalInput.evaluate((element) => element.setAttribute('aria-invalid', 'true'));
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'borderColor', '--sev-critical'))
    .toBe(true);
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'outlineColor', '--sev-critical'))
    .toBe(true);
  expect(await readInputGeometry()).toEqual(inputGeometry);
  await finalInput.evaluate((element) => {
    element.removeAttribute('aria-invalid');
    element.setAttribute('disabled', '');
  });
  expect(await finalInput.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.6');
  expect(await finalInput.evaluate((element) => getComputedStyle(element).cursor)).toBe(
    'not-allowed',
  );
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'borderColor', '--border-marketing-scanner'))
    .toBe(true);
  expect(await readInputGeometry()).toEqual(inputGeometry);
  await finalInput.evaluate((element) => element.removeAttribute('disabled'));

  const finalButton = page.locator('#final-cta form button');
  const buttonGeometry = await finalButton.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  await finalButton.hover();
  await expect
    .poll(() => finalButton.evaluate((element) => getComputedStyle(element).filter))
    .not.toBe('none');
  await focusWithKeyboard(page, finalButton);
  await expect
    .poll(() => hasSameComputedToken(finalButton, 'outlineColor', '--brand-highlight'))
    .toBe(true);
  expect(
    await finalButton.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }),
  ).toEqual(buttonGeometry);
  await finalButton.evaluate((element) => {
    (element as HTMLButtonElement).disabled = true;
  });
  expect(await finalButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.45');
  expect(await finalButton.evaluate((element) => getComputedStyle(element).cursor)).toBe(
    'not-allowed',
  );
  await finalButton.evaluate((element) => {
    (element as HTMLButtonElement).disabled = false;
  });

  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
  expect(await hasSameComputedToken(finalInput, 'backgroundColor', '--surface-dark')).toBe(true);
  await finalInput.hover();
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'borderColor', '--brand-marketing'))
    .toBe(true);
  await focusWithKeyboard(page, finalInput);
  await expect
    .poll(() => hasSameComputedToken(finalInput, 'outlineColor', '--brand-highlight'))
    .toBe(true);
  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'light'));

  const compactSurfaces = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing surface: ${selector}`);
      const style = getComputedStyle(element);
      return {
        border: style.borderTopColor,
        radius: style.borderTopLeftRadius,
        padding: `${style.paddingTop} ${style.paddingRight}`,
      };
    };
    return {
      evidence: read('#difference article'),
      workflow: read('#loop article'),
      readiness: read('#readiness .rounded-marketing-readiness'),
      explorer: read('#areas > div'),
      pricing: read('#pricing-preview > div'),
      priceHighlight: read('#pricing-preview article'),
      trust: read('#technical-trust dl > div'),
    };
  });
  expect(compactSurfaces).toEqual({
    evidence: { border: 'rgb(223, 230, 246)', radius: '16px', padding: '17px 17px' },
    workflow: { border: 'rgb(225, 231, 245)', radius: '16px', padding: '16px 17px' },
    readiness: { border: 'rgb(223, 229, 244)', radius: '20px', padding: '17px 14px' },
    explorer: { border: 'rgb(222, 229, 245)', radius: '15px', padding: '10px 10px' },
    pricing: { border: 'rgb(223, 229, 242)', radius: '17px', padding: '16px 13px' },
    priceHighlight: { border: 'rgb(228, 233, 245)', radius: '13px', padding: '11px 11px' },
    trust: { border: 'rgb(223, 229, 244)', radius: '0px', padding: '17px 17px' },
  });
  const compactDetails = await page.evaluate(() => {
    const highlight = document.querySelector('#pricing-preview article');
    const amount = highlight?.querySelector('strong');
    const blocker = document.querySelector('#readiness .rounded-marketing-blocker');
    const icon = document.querySelector('#difference article span[aria-hidden="true"]');
    if (!highlight || !amount || !blocker || !icon)
      throw new Error('Missing nested surface detail');
    const highlightStyle = getComputedStyle(highlight);
    const amountStyle = getComputedStyle(amount);
    const blockerStyle = getComputedStyle(blocker);
    const iconStyle = getComputedStyle(icon);
    return {
      priceHighlightDisplay: highlightStyle.display,
      priceAmountPlacement: `${amountStyle.gridColumnStart}/${amountStyle.gridRowStart}/${amountStyle.gridRowEnd}`,
      blockerBorder: blockerStyle.borderInlineStartWidth,
      blockerRadius: blockerStyle.borderTopLeftRadius,
      evidenceIcon: `${iconStyle.width}/${iconStyle.height}/${iconStyle.borderTopLeftRadius}`,
    };
  });
  expect(compactDetails).toEqual({
    priceHighlightDisplay: 'grid',
    priceAmountPlacement: '2/1/span 2',
    blockerBorder: '3px',
    blockerRadius: '8px',
    evidenceIcon: '37px/37px/12px',
  });

  const origin = publicOrigin;
  await page.context().clearCookies();
  for (const { locale, direction } of [
    { locale: 'en', direction: 'ltr' },
    { locale: 'ar', direction: 'rtl' },
  ]) {
    await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-landing-section="hero"]').waitFor();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('[data-landing-section]')).toHaveCount(10);

    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${locale} page at ${width}px`).toBeLessThanOrEqual(
        dimensions.viewport,
      );

      const trustBoundaryWidths = await page.locator('#technical-trust dl').evaluate((ledger) => {
        const readLogicalBorders = (element: Element) => {
          const style = getComputedStyle(element);
          return {
            inlineStart: style.borderInlineStartWidth,
            inlineEnd: style.borderInlineEndWidth,
            blockStart: style.borderBlockStartWidth,
            blockEnd: style.borderBlockEndWidth,
          };
        };
        return {
          columns: getComputedStyle(ledger).gridTemplateColumns.trim().split(/\s+/).length,
          ledger: readLogicalBorders(ledger),
          cells: Array.from(ledger.children, readLogicalBorders),
        };
      });
      expect(trustBoundaryWidths, `${locale} trust borders at ${width}px`).toEqual({
        columns: width <= 640 ? 1 : 2,
        ledger: {
          inlineStart: '1px',
          inlineEnd: '0px',
          blockStart: '1px',
          blockEnd: '0px',
        },
        cells: Array.from({ length: 4 }, () => ({
          inlineStart: '0px',
          inlineEnd: '1px',
          blockStart: '0px',
          blockEnd: '1px',
        })),
      });

      const areaTablistBorders = await page
        .locator('#areas [role="tablist"]')
        .evaluate((tablist) => {
          const style = getComputedStyle(tablist);
          return {
            inlineStart: style.borderInlineStartWidth,
            inlineEnd: style.borderInlineEndWidth,
            blockStart: style.borderBlockStartWidth,
            blockEnd: style.borderBlockEndWidth,
          };
        });
      expect(areaTablistBorders, `${locale} audit area divider at ${width}px`).toEqual({
        inlineStart: '0px',
        inlineEnd: '0px',
        blockStart: '0px',
        blockEnd: '1px',
      });

      const scannerLayout = await page.locator('#final-cta form').evaluate((form) => {
        const shell = form.parentElement!.getBoundingClientRect();
        const input = form.querySelector('input')!.getBoundingClientRect();
        const button = form.querySelector('button')!.getBoundingClientRect();
        return {
          shell: { left: shell.left, right: shell.right },
          input: { left: input.left, right: input.right, top: input.top, bottom: input.bottom },
          button: { left: button.left, right: button.right, top: button.top },
          viewport: document.documentElement.clientWidth,
        };
      });
      expect(scannerLayout.shell.left, `${locale} shell at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(scannerLayout.shell.right, `${locale} shell at ${width}px`).toBeLessThanOrEqual(
        scannerLayout.viewport,
      );
      expect(scannerLayout.input.left, `${locale} input at ${width}px`).toBeGreaterThanOrEqual(
        scannerLayout.shell.left,
      );
      expect(scannerLayout.input.right, `${locale} input at ${width}px`).toBeLessThanOrEqual(
        scannerLayout.shell.right,
      );
      expect(scannerLayout.button.left, `${locale} CTA at ${width}px`).toBeGreaterThanOrEqual(
        scannerLayout.shell.left,
      );
      expect(scannerLayout.button.right, `${locale} CTA at ${width}px`).toBeLessThanOrEqual(
        scannerLayout.shell.right,
      );
      if (width <= 640) {
        expect(scannerLayout.button.top - scannerLayout.input.bottom).toBe(10);
      } else {
        const horizontalGap = Math.max(
          scannerLayout.input.left - scannerLayout.button.right,
          scannerLayout.button.left - scannerLayout.input.right,
        );
        expect(horizontalGap).toBe(10);
        expect(scannerLayout.button.top).toBe(scannerLayout.input.top);
      }
    }
  }

  await page.goto(`${origin}/en`, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
  const darkSurfaces = await page.evaluate(() => ({
    report: getComputedStyle(document.querySelector('#report-showcase > div')!).backgroundColor,
    repair: getComputedStyle(document.querySelector('#remediation article')!).boxShadow,
    scannerBorder: getComputedStyle(document.querySelector('[data-scan-handoff]')!).borderTopWidth,
    supportingBorder: getComputedStyle(document.querySelector('#pricing-preview article')!)
      .borderTopColor,
  }));
  expect(darkSurfaces.report).not.toBe('rgb(255, 255, 255)');
  expect(darkSurfaces.repair).toContain('0, 0, 0, 0.2');
  expect(darkSurfaces.scannerBorder).toBe('1px');
  expect(darkSurfaces.supportingBorder).toBe('rgb(55, 65, 81)');
});

test('audit-area tabs retain visible interaction states and RTL keyboard scrolling', async ({
  page,
}) => {
  const baseUrl = EXTERNAL_BASE_URL ?? (server ? `${server.url}/` : undefined);
  if (!baseUrl) throw new Error('The marketing surface server did not start');
  const origin = new URL(baseUrl).origin;

  for (const { locale, direction, forwardKey } of [
    { locale: 'en', direction: 'ltr', forwardKey: 'ArrowRight' },
    { locale: 'ar', direction: 'rtl', forwardKey: 'ArrowLeft' },
  ]) {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('dir', direction);

    const tabs = page.locator('#areas [role="tab"]');
    const tablist = page.locator('#areas [role="tablist"]');
    const first = tabs.nth(0);
    const second = tabs.nth(1);
    const last = tabs.nth(4);
    const panel = page.locator('#audit-area-panel');

    expect(await hasSameComputedToken(tablist, 'borderColor', '--border-marketing')).toBe(true);
    expect(await first.evaluate((tab) => getComputedStyle(tab).backgroundImage)).toContain(
      'linear-gradient',
    );
    expect(await hasSameComputedToken(first, 'color', '--text-marketing-inverse')).toBe(true);

    const secondGeometry = await second.evaluate((tab) => {
      const bounds = tab.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top + window.scrollY,
        width: bounds.width,
      };
    });
    await second.hover();
    await expect
      .poll(() => hasSameComputedToken(second, 'borderColor', '--brand-electric'))
      .toBe(true);
    expect(
      await second.evaluate((tab) => {
        const bounds = tab.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top + window.scrollY,
          width: bounds.width,
        };
      }),
    ).toEqual(secondGeometry);

    await focusWithKeyboard(page, first);
    const focus = await first.evaluate((tab) => {
      const style = getComputedStyle(tab);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
      };
    });
    expect(focus).toEqual({ outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '2px' });

    await page.keyboard.press(forwardKey);
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toHaveAttribute('aria-labelledby', 'audit-area-tab-security');
    expect(await second.evaluate((tab) => tab.tabIndex)).toBe(0);
    expect(await first.evaluate((tab) => tab.tabIndex)).toBe(-1);

    const beforeEnd = await page.evaluate(() => {
      const tablistElement = document.querySelector('#areas [role="tablist"]') as HTMLElement;
      const lastTab = document.querySelector('#areas [role="tab"]:last-child')!;
      const list = tablistElement.getBoundingClientRect();
      const tab = lastTab.getBoundingClientRect();
      return {
        listLeft: list.left,
        listRight: list.right,
        tabLeft: tab.left,
        tabRight: tab.right,
        scrollLeft: tablistElement.scrollLeft,
        scrollWidth: tablistElement.scrollWidth,
        clientWidth: tablistElement.clientWidth,
      };
    });
    await page.keyboard.press('End');
    await expect(last).toHaveAttribute('aria-selected', 'true');
    const visibility = await page.evaluate(() => {
      const tablistElement = document.querySelector('#areas [role="tablist"]')!;
      const lastTab = document.querySelector('#areas [role="tab"]:last-child')!;
      const list = tablistElement.getBoundingClientRect();
      const tab = lastTab.getBoundingClientRect();
      return {
        listLeft: list.left,
        listRight: list.right,
        tabLeft: tab.left,
        tabRight: tab.right,
        scrollLeft: tablistElement.scrollLeft,
        scrollWidth: (tablistElement as HTMLElement).scrollWidth,
        clientWidth: (tablistElement as HTMLElement).clientWidth,
      };
    });
    expect(visibility.tabLeft).toBeGreaterThanOrEqual(visibility.listLeft - 1);
    expect(visibility.tabRight).toBeLessThanOrEqual(visibility.listRight + 1);
    expect(visibility.scrollWidth).toBeGreaterThanOrEqual(visibility.clientWidth);
    if (beforeEnd.scrollWidth > beforeEnd.clientWidth) {
      expect(visibility.scrollLeft).not.toBe(beforeEnd.scrollLeft);
    }

    await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
    expect(await hasSameComputedToken(tablist, 'borderColor', '--border-marketing')).toBe(true);
    await expect
      .poll(() => hasSameComputedToken(last, 'color', '--text-marketing-inverse'))
      .toBe(true);
    await focusWithKeyboard(page, last);
    expect(await hasSameComputedToken(last, 'outlineColor', '--brand-electric')).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await last.evaluate((tab) => getComputedStyle(tab).transitionProperty)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
});
