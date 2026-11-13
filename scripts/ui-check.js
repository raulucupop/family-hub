#!/usr/bin/env node
/* Opens every page of the app, as a desktop and as a phone, on a throwaway database with a
   realistic family in it, and fails if any page throws a script error or is wider than the screen
   (the classic sign of a layout broken on a phone). Screenshots go to ./ui-shots so a pull request
   can be looked at, not just read.

     npm run ui-check            # needs a Chromium for Playwright: npx playwright install chromium

   Not part of `npm test`: that suite needs nothing but Node, and this one needs a browser. CI runs
   both (.github/workflows/test.yml). */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'ui-shots');
const PAGES = ['dashboard', 'review', 'search', 'alerts', 'money', 'bills', 'import', 'properties', 'tenants',
  'chores', 'watch', 'vehicles', 'acte', 'garantii', 'family', 'lists', 'settings'];
const SIZES = { desktop: { width: 1366, height: 768 }, phone: { width: 390, height: 844 } };
const EMAIL = 'ui-check@example.ro', PASSWORD = 'ui-check-1234';

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function seed(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${await r.text()}`);
  };
  const day = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };
  await call('POST', '/api/auth/register', { familyName: 'Pop', name: 'Raul', email: EMAIL, password: PASSWORD, lang: 'ro' });
  await call('POST', '/api/incomes', { source: 'Salariu', amount: 9500, date: day(-10) });
  const spend = [['Groceries', 412.5, 'Lidl'], ['Groceries', 238.9, 'Kaufland'], ['Utilities', 310, 'E.ON gaz'],
    ['Transportation', 280, 'OMV'], ['Restaurants', 165, 'Pizza'], ['Subscriptions', 59.99, 'Netflix'],
    ['Healthcare', 120, 'Farmacia Tei — o notă mai lungă, ca să se vadă cum se rupe pe un telefon']];
  for (const [i, [category, amount, note]] of spend.entries()) await call('POST', '/api/expenses', { category, amount, note, date: day(-i) });
  await call('POST', '/api/bills', { name: 'Curent', provider: 'Hidroelectrica', category: 'Electricity', amount: 245, due_date: day(3), recur_months: 1 });
  await call('POST', '/api/bills', { name: 'Gaz', provider: 'E.ON', category: 'Gas', amount: 380, due_date: day(-2), recur_months: 1 });
  await call('POST', '/api/bills', { name: 'Internet', provider: 'Digi', category: 'Internet', amount: 55, due_date: day(12), recur_months: 1 });
  await call('POST', '/api/vehicles', { name: 'Skoda Octavia', plate: 'CJ 12 POP', rca_expiry: day(9), itp_expiry: day(140), vignette_expiry: day(-1) });
  await call('POST', '/api/properties', { name: 'Apartament', address: 'Str. Eroilor 10', insurance_expiry: day(45), rent_amount: 2200, rent_currency: 'RON', rent_due_day: 5 });
  await call('POST', '/api/documents', { name: 'Carte de identitate', number: 'CJ123456', expiry_date: day(30) });
  await call('POST', '/api/chores', { title: 'Udat florile', cadence: 'daily' });
  await call('POST', '/api/lists', { list: 'grocery', title: 'Lapte' });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-ui-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATA_DIR: dir, PORT: String(port), SESSION_SECRET: 'ui-check', NODE_ENV: 'test' },
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 15000;
  while (!log.includes('running on')) {
    if (server.exitCode != null || Date.now() > deadline) { console.error(log); process.exit(1); }
    await new Promise((r) => setTimeout(r, 60));
  }
  const base = `http://127.0.0.1:${port}`;
  const problems = [];
  let browser;
  try {
    await seed(base);
    fs.mkdirSync(OUT, { recursive: true });
    browser = await chromium.launch();
    for (const [size, viewport] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport, locale: 'ro-RO' });
      const page = await ctx.newPage();
      let current = '';
      page.on('pageerror', (e) => problems.push(`${size} #${current}: script error: ${e.message}`));
      await page.goto(base + '/');
      await page.fill('input[type=email]', EMAIL);
      await page.fill('input[type=password]', PASSWORD);
      await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/auth/login')), page.keyboard.press('Enter')]);
      for (const name of PAGES) {
        current = name;
        await page.goto(`${base}/#${name}`);
        await page.waitForSelector('#page .pagehead, #page h1', { timeout: 10000 }).catch(() => problems.push(`${size} #${name}: never rendered a heading`));
        await page.waitForTimeout(400);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (over > 1) problems.push(`${size} #${name}: page is ${over}px wider than the screen`);
        await page.screenshot({ path: path.join(OUT, `${size}-${name}.png`), fullPage: true });
      }
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(`UI check failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`UI check: ${PAGES.length} pages × ${Object.keys(SIZES).length} sizes, no script errors, nothing wider than the screen. Screenshots in ui-shots/.`);
})().catch((e) => { console.error(e); process.exit(1); });
