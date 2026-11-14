#!/usr/bin/env node
/* Opens every page of the app, as a desktop and as a phone, on a throwaway database with a
   realistic family in it, and fails if any page throws a script error or is wider than the screen
   (the classic sign of a layout broken on a phone) — or if, on the phone, something inside the
   page has to be dragged sideways to be read (a table that kept its desktop columns: the page
   itself stays the right width, so the first check never saw those). Screenshots go to ./ui-shots
   so a pull request can be looked at, not just read.

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
const PAGES = ['dashboard', 'review', 'search', 'alerts', 'money', 'money/income', 'money/budgets', 'money/credits',
  'money/savings', 'money/debt', 'money/year', 'bills', 'import', 'properties', 'tenants',
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
  // the tabs under Buget și cheltuieli and the lists with amounts: each has a table of its own,
  // and an empty table cannot show that it does not fit on a phone
  await call('POST', '/api/family/members', { name: 'Alexandra-Ioana' });
  await call('POST', '/api/incomes', { source: 'Chirie apartament', amount: 2200, date: day(-6) });
  await call('POST', '/api/budgets', { category: 'Groceries', month: day(0).slice(0, 7), amount: 1800 });
  await call('POST', '/api/lists', { list: 'buy', title: 'Canapea nouă', amount: 4200, note: 'pentru sufragerie' });
  await call('POST', '/api/credits', { name: 'Credit ipotecar', lender: 'Banca Transilvania', principal: 320000, interest_rate: 6.4, term_months: 300, start_date: day(-700) });
  await call('POST', '/api/savings', { kind: 'deposit', amount: 1500, date: day(-5), note: 'bonus de la firmă' });
  await call('POST', '/api/loans', { person: 'Andrei', amount: 2000, date: day(-60), due_date: day(20), direction: 'owed' });
  await call('POST', '/api/recurring-expenses', { category: 'Subscriptions', note: 'Spotify', amount: 26.99, day: 20 });
  await call('POST', '/api/recurring-incomes', { source: 'Salariu', amount: 9500, day: 10 });
  await call('POST', '/api/warranties', { name: 'Frigider Samsung', seller: 'eMAG', purchased_at: day(-200), months: 24, price: 3299 });
}

// Blocks fade in as they are scrolled to, so a full-page screenshot taken from the top showed
// everything below the first screen as blank paper. Walk down the page first, then come back.
const scrollThrough = (page) => page.evaluate(async () => {
  const step = innerHeight * 0.7;
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
});

// What, inside the page, scrolls sideways. The strips of tabs are meant to; nothing else is.
const sideways = (page) => page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('#page *')) {
    if (!e.offsetParent || e.closest('.tabs, .subnav')) continue;
    if (e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)) {
      out.push(`${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : ''} (${e.scrollWidth - e.clientWidth}px hidden)`);
    }
  }
  return out;
});

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
        await scrollThrough(page);
        if (size === 'phone') for (const what of await sideways(page)) problems.push(`${size} #${name}: scrolls sideways: ${what}`);
        await page.screenshot({ path: path.join(OUT, `${size}-${name.replace('/', '-')}.png`), fullPage: true });
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
  console.log(`UI check: ${PAGES.length} pages × ${Object.keys(SIZES).length} sizes, no script errors, nothing wider than the screen, nothing scrolling sideways on the phone. Screenshots in ui-shots/.`);
})().catch((e) => { console.error(e); process.exit(1); });
