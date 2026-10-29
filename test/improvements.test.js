/* The October 2026 round of fixes, each checked through the API the page uses: a new expense is
   called new instead of 3041% over, credit insurance is part of what a credit costs, a bill buzzes
   only when asked to, a monthly income is offered as a schedule without being counted twice, the
   week's money leads the weekly look, the menu can lose pages, and each child has a cost. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today, plusDays } = require('./helpers');

const monthDay = (offset, day = 10) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, day)).toISOString().slice(0, 10);
};
// the 1st of this month at the latest, so a test that writes "this month" never lands in the future
const thisMonth = (day) => monthDay(0, Math.min(day, new Date().getUTCDate()));

test('a session is renewed while it is used, so it lasts 30 days from the last visit, not from the sign-in', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const jwt = require('jsonwebtoken');
  const secret = require('node:fs').readFileSync(require('node:path').join(api.dir, '.jwt_secret'), 'utf8').trim();
  const me = (await api.get('/api/me')).body.user;
  const now = Math.floor(Date.now() / 1000);
  const tokenAt = (iat) => jwt.sign({ uid: me.id, fid: me.family_id, role: me.role, tv: 0, iat }, secret, { expiresIn: '30d' });
  const visit = (token) => fetch(`http://127.0.0.1:${api.port}/api/me`, { headers: { Cookie: `fh_token=${token}` } });

  const fresh = await visit(tokenAt(now - 60));
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.getSetCookie().length, 0, 'a token from today is left alone');

  // signed in 29 days ago: one day short of being thrown out
  const old = await visit(tokenAt(now - 29 * 86400));
  assert.equal(old.status, 200);
  const set = old.headers.getSetCookie().find((c) => c.startsWith('fh_token='));
  assert.ok(set, 'an old token is handed back renewed');
  assert.match(set, /HttpOnly/i);
  const renewed = jwt.verify(set.split(';')[0].slice('fh_token='.length), secret);
  assert.ok(renewed.iat >= now, 'issued now');
  assert.ok(renewed.exp - renewed.iat >= 30 * 86400 - 5, 'good for another 30 days');
  assert.equal(renewed.uid, me.id);
});

test('the 3-month average says how many of those months had the category at all', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 300, date: monthDay(-1) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 300, date: monthDay(-2) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 300, date: monthDay(-3) });
  await api.post('/api/expenses', { category: 'Education', amount: 230, date: monthDay(-2) });
  const s = (await api.get('/api/budgets/suggest')).body;
  const by = Object.fromEntries(s.categories.map((c) => [c.category, c]));
  assert.equal(by.Groceries.months, 3);
  assert.equal(by.Education.months, 1, 'one month out of three is not a usual cost to compare with');
});

test('credit insurance is part of the monthly cost and is booked as its own line', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.post('/api/credits', { name: 'Bad', principal: 1000, interest_rate: 5, term_months: 12, start_date: monthDay(-1, 1), insurance: -1 })).status, 400);
  // started last month on the 1st: this month's instalment is due, so it posts now
  const c = (await api.post('/api/credits', { name: 'Credit Mada', principal: 12000, interest_rate: 6, term_months: 24, commission: 5, insurance: 140.55, start_date: monthDay(-1, 1) })).body;
  assert.equal(c.insurance, 140.55);
  assert.equal(c.monthly_total, Math.round((c.monthly_payment + 5 + 140.55) * 100) / 100);

  // the expenses of this month: the instalment with its commission, and the insurance beside it
  await api.get('/api/stats'); // the dashboard's visit is what posts the month's instalments
  const month = today().slice(0, 7);
  const exps = (await api.get('/api/expenses')).body.filter((e) => e.date.slice(0, 7) === month);
  const inst = exps.find((e) => e.note === `Credit: Credit Mada ${month}`);
  const ins = exps.find((e) => e.note === `Asigurare credit: Credit Mada ${month}`);
  assert.ok(inst, 'the instalment posted');
  assert.equal(inst.amount, Math.round((c.monthly_payment + 5) * 100) / 100);
  assert.ok(ins, 'the insurance posted');
  assert.equal(ins.amount, 140.55);
  assert.equal(ins.category, 'Credit');

  // editing keeps it, and zero takes it away again
  const put = (await api.put(`/api/credits/${c.id}`, { insurance: 0 })).body;
  assert.equal(put.insurance, 0);
  assert.equal(put.monthly_total, Math.round((c.monthly_payment + 5) * 100) / 100);
});

test('a bill alerts only when asked to, a set number of days ahead, and never when it pays itself', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const quiet = (await api.post('/api/bills', { name: 'Lumina', category: 'electricity', amount: 100, due_date: plusDays(2) })).body;
  const asked = (await api.post('/api/bills', { name: 'Celule Maria', category: 'other', amount: 460, due_date: plusDays(3), remind_days: 3 })).body;
  const far = (await api.post('/api/bills', { name: 'Departe', category: 'other', amount: 50, due_date: plusDays(10), remind_days: 3 })).body;
  const auto = (await api.post('/api/bills', { name: 'Spotify', category: 'subscription', amount: 35, due_date: plusDays(1), remind_days: 3, auto_pay: 1 })).body;
  assert.equal(quiet.remind_days, null);
  assert.equal(asked.remind_days, 3);
  assert.equal((await api.post('/api/bills', { name: 'X', category: 'other', amount: 1, due_date: plusDays(5), remind_days: 99 })).body.remind_days, null, 'out of range means none');

  const { items } = (await api.get('/api/notifications')).body;
  const about = (b) => items.filter((n) => String(n.item || n.key || '').startsWith(`bill:${b.id}:`));
  assert.equal(about(quiet).length, 0, 'a bill nobody asked about stays quiet');
  assert.equal(about(asked).length, 1, 'three days ahead, as asked');
  assert.equal(about(far).length, 0, 'ten days out is not yet three days ahead');
  assert.equal(about(auto).length, 0, 'a bill that pays itself needs nobody');
  assert.match(about(asked)[0].url || '', /#bills/);

  // turning it off takes the alert away
  await api.put(`/api/bills/${asked.id}`, { remind_days: '' });
  const after = (await api.get('/api/notifications')).body.items;
  assert.equal(after.filter((n) => String(n.item || n.key || '').startsWith(`bill:${asked.id}:`)).length, 0);
});

test('an income typed in two months running is offered as recurring, and making it so does not count this month twice', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const me = (await api.get('/api/me')).body.user;
  await api.post('/api/incomes', { source: 'Salariu', amount: 6232, date: monthDay(-2, 10) });
  await api.post('/api/incomes', { source: 'Salariu Magna (septembrie)', amount: 5961, date: thisMonth(9) });
  await api.post('/api/incomes', { source: 'Indemnizație creștere copil', amount: 7650, date: monthDay(-1, 8) });
  await api.post('/api/incomes', { source: 'Indemnizatie crestere copil', amount: 7650, date: thisMonth(8) });
  await api.post('/api/incomes', { source: 'Rata Thermomix', amount: 416, date: thisMonth(6) });

  const offers = (await api.get('/api/recurring-incomes/suggest')).body;
  const names = offers.map((o) => o.source);
  assert.ok(names.includes('Salariu Magna'), 'the month in brackets is left out of the name');
  assert.ok(names.some((n) => n.startsWith('Indemniza')), 'accents do not make two incomes');
  assert.ok(!names.includes('Rata Thermomix'), 'once is not monthly');
  const sal = offers.find((o) => o.source === 'Salariu Magna');
  assert.equal(sal.amount, 5961, 'the latest amount');
  assert.equal(sal.varies, true);
  assert.equal(sal.user_id, me.id);

  // made recurring on a day already past this month: this month's salary is already there
  const before = (await api.get('/api/incomes')).body.length;
  const ind = offers.find((o) => o.source.startsWith('Indemniza'));
  assert.equal((await api.post('/api/recurring-incomes', { source: ind.source, amount: ind.amount, day: 1, user_id: ind.user_id })).status, 200);
  assert.equal((await api.get('/api/incomes')).body.length, before, 'not logged a second time this month');
  assert.ok(!(await api.get('/api/recurring-incomes/suggest')).body.some((o) => o.source.startsWith('Indemniza')), 'and no longer offered');

  // a brand-new recurring income with nothing typed this month still logs right away
  await api.post('/api/recurring-incomes', { source: 'Chirie garaj', amount: 300, day: 1 });
  assert.equal((await api.get('/api/incomes')).body.length, before + 1);
});

test('the weekly look leads with what went out and came in', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 120, date: today() });
  await api.post('/api/expenses', { category: 'Healthcare', amount: 80, date: today() });
  await api.post('/api/expenses', { category: 'Groceries', amount: 999, date: plusDays(-30) });
  await api.post('/api/incomes', { source: 'Salariu', amount: 5000, date: today() });
  const r = (await api.get('/api/review')).body;
  assert.equal(r.week.spent, 200, 'only since the last look (a week, the first time)');
  assert.equal(r.week.income, 5000);
  assert.deepEqual(r.week.top.map((x) => x.category), ['Groceries', 'Healthcare']);
});

test('a family can take pages out of its menu, but not the ones the app needs', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.get('/api/me')).body.family.nav_hidden, '');
  await api.patch('/api/family', { nav_hidden: ['chores', 'lists', 'money', 'settings', 'nope', 'lists'] });
  assert.equal((await api.get('/api/me')).body.family.nav_hidden, 'chores,lists', 'money and settings stay; unknown and repeated names are dropped');
  await api.patch('/api/family', { name: 'Familia Pop' });
  assert.equal((await api.get('/api/me')).body.family.nav_hidden, 'chores,lists', 'saving the family name leaves the menu alone');
  await api.patch('/api/family', { nav_hidden: [] });
  assert.equal((await api.get('/api/me')).body.family.nav_hidden, '');
});

test('each child has a cost: what is set on them, or carries their name, and their bills a month', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.deepEqual((await api.get('/api/kids-costs')).body, [], 'no children, nothing to show');
  const maria = (await api.post('/api/family/members', { name: 'Maria' })).body;
  const mara = (await api.post('/api/family/members', { name: 'Mara' })).body;
  assert.ok(maria.id && mara.id, 'children added');

  await api.post('/api/expenses', { category: 'Education', amount: 2400, date: thisMonth(8), user_id: mara.id, note: 'Montessori' });
  await api.post('/api/expenses', { category: 'Healthcare', amount: 460, date: thisMonth(5), note: 'Bill: Celule Maria' });
  await api.post('/api/expenses', { category: 'Healthcare', amount: 190, date: monthDay(-1), note: 'Terapie Mara' });
  await api.post('/api/expenses', { category: 'Groceries', amount: 300, date: thisMonth(5), note: 'Lidl' });
  await api.post('/api/bills', { name: 'Celule Maria', category: 'other', amount: 460, due_date: plusDays(15), recur: 'd30', recur_days: 30 });
  await api.post('/api/bills', { name: 'Asigurare', category: 'other', amount: 336, due_date: plusDays(20), recur_months: 1, owner_id: mara.id });

  const kids = Object.fromEntries((await api.get('/api/kids-costs')).body.map((k) => [k.name, k]));
  assert.equal(kids.Mara.month, 2400, 'set on her');
  assert.equal(kids.Maria.month, 460, 'her name in the note — and Mara’s name is not hers');
  assert.equal(kids.Mara.prev, 190);
  assert.equal(kids.Mara.avg, 190, 'averaged over the months that had anything');
  assert.equal(kids.Maria.avg, null);
  assert.deepEqual(kids.Mara.categories, [{ category: 'Education', total: 2400 }]);
  assert.equal(kids.Maria.fixed_total, Math.round((460 * 30.4375 / 30) * 100) / 100, 'every 30 days, brought to a month');
  assert.equal(kids.Mara.fixed_total, 336);
});

test('a child’s own words put the fee a parent logs on them — Montessori lands on Mara', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const maria = (await api.post('/api/family/members', { name: 'Maria' })).body;
  const mara = (await api.post('/api/family/members', { name: 'Mara' })).body;
  assert.equal(mara.cost_words, '', 'no words to begin with');

  const saved = await api.patch(`/api/family/members/${mara.id}`, { cost_words: ' Montessori , grădiniță,, montessori , after school ' });
  assert.equal(saved.body.cost_words, 'Montessori, grădiniță, after school', 'trimmed, no blanks, no repeats');
  const listed = (await api.get('/api/family/members')).body.find((m) => m.id === mara.id);
  assert.equal(listed.cost_words, 'Montessori, grădiniță, after school');
  const me = (await api.get('/api/me')).body.user;
  assert.equal((await api.patch(`/api/family/members/${me.id}`, { cost_words: 'x' })).status, 400, 'only children have words');

  // typed in by the parent who paid, never set on her
  await api.post('/api/expenses', { category: 'Education', amount: 2400, date: thisMonth(3), note: 'Taxa MONTESSORI noiembrie' });
  await api.post('/api/expenses', { category: 'Education', amount: 150, date: thisMonth(4), note: 'Gradinita - serbare' });
  await api.post('/api/expenses', { category: 'Education', amount: 80, date: thisMonth(4), note: 'After-school luni' });
  await api.post('/api/expenses', { category: 'Education', amount: 999, date: thisMonth(4), note: 'school books' });
  await api.post('/api/expenses', { category: 'Education', amount: 70, date: thisMonth(4), note: 'Montessoriana' });
  await api.post('/api/bills', { name: 'Montessori', category: 'other', amount: 2400, due_date: plusDays(10), recur_months: 1 });

  const kids = Object.fromEntries((await api.get('/api/kids-costs')).body.map((k) => [k.name, k]));
  assert.equal(kids.Mara.month, 2400 + 150 + 80, 'her words, any case or diacritics; a phrase needs all its words; whole words only');
  assert.equal(kids.Maria.month, 0, 'Mara’s words are not Maria’s');
  assert.equal(kids.Mara.fixed_total, 2400, 'a bill named after one of her words is hers too');

  await api.patch(`/api/family/members/${mara.id}`, { cost_words: '' });
  assert.equal((await api.get('/api/kids-costs')).body.find((k) => k.id === mara.id).month, 0, 'words cleared, the fee is the payer’s again');
  assert.ok(maria.id);
});
