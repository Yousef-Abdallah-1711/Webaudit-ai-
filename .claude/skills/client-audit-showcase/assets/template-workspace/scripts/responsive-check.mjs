import { chromium } from '@playwright/test';

const viewports = [
  ['mobile-360', 360, 740],
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['tablet-landscape', 1024, 768],
];

const tabNames = ['Overview', 'Priorities', 'Fixes', 'Evidence', 'Pentest plan'];

const browser = await chromium.launch();
const results = [];

for (const [name, width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height } });
  const messages = [];

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      messages.push(`${message.type()}: ${message.text().slice(0, 220)}`);
    }
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const base = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const innerWidth = window.innerWidth;
    const elements = [...document.body.querySelectorAll('*')].filter(visible);
    const offenders = elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.right > innerWidth + 2 || item.left < -2)
      .slice(0, 25);

    const smallTargets = [
      ...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])'),
    ]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 60),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.width < 44 || item.height < 44)
      .slice(0, 20);

    const buttons = [...document.querySelectorAll('button')]
      .filter(visible)
      .map((button) => button.innerText.trim().replace(/\s+/g, ' ') || button.getAttribute('aria-label') || button.title)
      .filter(Boolean)
      .slice(0, 40);

    return {
      innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootText: (document.getElementById('root')?.innerText || '').slice(0, 160),
      offenders,
      smallTargets,
      buttons,
    };
  });

  const tabClicks = [];
  for (const tab of tabNames) {
    const button = page.getByRole('button', { name: tab }).first();
    const count = await button.count().catch(() => 0);
    if (!count) {
      tabClicks.push(`${tab}:missing`);
      continue;
    }

    await button.click();
    await page.waitForTimeout(400);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    tabClicks.push(`${tab}:ok scrollWidth=${scrollWidth}`);
  }

  await page.screenshot({
    path: `data/responsive-${name}.png`,
    fullPage: true,
  });

  results.push({
    name,
    width,
    height,
    base,
    tabClicks,
    messages: [...new Set(messages)].slice(0, 10),
  });

  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
