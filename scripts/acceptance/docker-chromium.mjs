// Real Chromium acceptance against the Docker-served frontend (infrastructure/docker-compose.acceptance.yml).
//
//   node scripts/acceptance/docker-chromium.mjs [screenshot-dir]
//
// Creates a throwaway user through the real API, runs a real scan of the fixture target, then drives Chromium through the
// real /login form and the report page at desktop / tablet / mobile in English and Arabic (RTL), capturing screenshots,
// console errors and failed requests. One extra SKIPPED unit row is inserted by the administrator, clearly labelled, ONLY to
// render the Coverage card's "not completed" branch (a passive-only scan has no gaps); that row is not a product result.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('apps/web/package.json'));
const { chromium } = require('@playwright/test');

const API = `http://127.0.0.1:${process.env.ACCEPT_API_PORT ?? '4530'}`;
const WEB = `http://127.0.0.1:${process.env.ACCEPT_WEB_PORT ?? '4531'}`;
const PROJECT = process.env.ACCEPT_PROJECT ?? 'fahes-accept';
const OUT = path.resolve(process.argv[2] ?? 'chromium-evidence');
mkdirSync(OUT, { recursive: true });
const email = `chrome-${randomBytes(3).toString('hex')}@example.com`;
const password = 'correct-horse-battery-staple';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};
const psql = (sql) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      '-f',
      'infrastructure/docker-compose.acceptance.yml',
      '--env-file',
      '.env.acceptance',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'webaudit',
      '-d',
      'webaudit',
      '-tAc',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
const call = async (method, route, token, body) => {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

// ---- data: user, target, real scan -------------------------------------------------------------------------------------
await call('POST', '/auth/register', null, { email, password });
psql(`update "User" set "emailVerifiedAt"=now() where email='${email}'`);
const token = (await call('POST', '/auth/login', null, { email, password })).json.accessToken;
const targetId = (
  await call('POST', '/targets', token, { inputType: 'URL', value: 'http://127.0.0.1:8080/' })
).json.target.id;
const modules = ['SECURITY', 'SEO'];
const quote = (await call('POST', '/scans/quote', token, { targetId, modules })).json.quote.credits;
const scanId = (await call('POST', '/scans', token, { targetId, modules, acceptedQuote: quote }))
  .json.scan.id;
let state = 'QUEUED';
for (
  let i = 0;
  i < 120 && !['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(state);
  i += 1
) {
  await new Promise((r) => setTimeout(r, 1000));
  state = (await call('GET', `/scans/${scanId}`, token)).json.scan.state;
}
check('real scan completed before the browser run', state === 'COMPLETED', state);
const planId = psql(`select id from "ScanPlan" where "scanId"='${scanId}'`);
const hasPlan = planId !== '';
if (hasPlan) {
  const userId = psql(`select id from "User" where email='${email}'`);
  psql(
    `insert into "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status,"skippedReason") values ('render-check-${scanId.slice(-6)}','${planId}','${userId}','${targetId}','SOURCE_STATIC','render.check','{}'::jsonb,9,1000,'{}'::jsonb,false,'render-check-${scanId.slice(-6)}:1','SKIPPED','render check: no repository supplied')`,
  );
}

// ---- browser ---------------------------------------------------------------------------------------------------------
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 390, height: 844 }],
];
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  for (const [vpName, viewport] of viewports) {
    const context = await browser.newContext({ viewport, locale: lang === 'ar' ? 'ar' : 'en-US' });
    await context.addCookies([{ name: 'wa-lang', value: lang, url: WEB }]);
    const page = await context.newPage();
    const consoleErrors = [];
    const failed = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && loggedIn && !/status of 401/.test(m.text()))
        consoleErrors.push(m.text().slice(0, 160));
    });
    page.on('pageerror', (e) =>
      consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`),
    );
    let loggedIn = false;
    // Before sign-in the app probes the session and legitimately receives 401; after sign-in any 4xx/5xx is a failure.
    page.on('response', (r) => {
      if (r.status() >= 500 || (loggedIn && r.status() >= 400))
        failed.push(`${r.status()} ${r.url()}`);
    });
    // A cancelled RSC prefetch during client navigation is benign (net::ERR_ABORTED); anything else is a failure.
    page.on('requestfailed', (r) => {
      if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? ''))
        failed.push(`failed ${r.url()} ${r.failure()?.errorText}`);
    });

    const label = `${lang}/${vpName}`;
    await page.goto(`${WEB}/login`);
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/scan/, { timeout: 15_000 }).catch(() => undefined);
    check(
      `${label}: login through the real form reaches the dashboard`,
      /\/scan/.test(page.url()),
      page.url(),
    );
    loggedIn = true;
    await page.screenshot({ path: path.join(OUT, `${lang}-${vpName}-dashboard.png`) });

    await page.goto(`${WEB}/reports/${scanId}`);
    await page.waitForSelector('text=/\\d/', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${lang}-${vpName}-report.png`), fullPage: true });
    const body = await page.locator('body').innerText();
    check(
      `${label}: report renders without undefined/NaN/raw message keys`,
      !/undefined|NaN|report_coverage|\[object/.test(body),
    );
    const dir = await page.evaluate(() => document.documentElement.dir);
    check(
      `${label}: document direction is ${lang === 'ar' ? 'rtl' : 'ltr'}`,
      dir === (lang === 'ar' ? 'rtl' : 'ltr') || (lang === 'en' && dir === ''),
      dir,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${label}: no horizontal page overflow`, overflow <= 1, `${overflow}px`);
    if (hasPlan) {
      const card = page.getByTestId('coverage-gaps');
      check(
        `${label}: Coverage card lists the not-completed unit with its reason`,
        (await card.count()) === 1 && /render check/.test(await card.innerText()),
      );
      if ((await card.count()) === 1) {
        const text = await page.locator('body').innerText();
        check(
          `${label}: Coverage heading and summary are translated`,
          lang === 'ar' ? /التغطية/.test(text) : /Coverage/.test(text),
        );
      }
    }
    check(
      `${label}: no console errors or server/network failures`,
      consoleErrors.length === 0 && failed.length === 0,
      [...consoleErrors, ...failed].slice(0, 3).join(' | '),
    );
    await context.close();
  }
}
await browser.close();
const failures = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failures.length}/${results.length} passed; screenshots in ${OUT}`,
);
process.exit(failures.length === 0 ? 0 : 1);
