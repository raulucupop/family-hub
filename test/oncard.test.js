/* Money put on a credit card is not money gone from the account. The card bill is, and that bill
   gets logged as its own expense when it arrives — so counting the purchase too is the same money
   twice. These tests exist because the flag is only worth anything if EVERY total honours it: one
   query left unguarded and the household is back to a number nobody can act on. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

const thisMonth = () => today().slice(0, 7);

test('a purchase put on the credit card stays out of what the household spent', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  const fromAccount = (await api.post('/api/expenses', {
    category: 'Groceries', amount: 120, date: today(), note: 'piata',
  })).body;
  const onCard = (await api.post('/api/expenses', {
    category: 'Groceries', amount: 300, date: today(), note: 'Kaufland', on_card: 1,
  })).body;

  await t.test('the flag is stored as asked, and off by default', () => {
    assert.equal(onCard.on_card, 1);
    assert.equal(fromAccount.on_card, 0, 'an expense nobody said anything about is paid from the account');
  });

  await t.test('the month total counts only what left the account', async () => {
    const s = (await api.get('/api/stats')).body;
    assert.equal(s.spent, 120, 'the 300 on the card has not left the account yet');
  });

  await t.test('so does the category breakdown, or it would not add up to the total', async () => {
    const s = (await api.get('/api/stats')).body;
    const groceries = s.byCategory.find((c) => c.category === 'Groceries');
    assert.equal(groceries.total, 120);
    assert.equal(s.byCategory.reduce((a, c) => a + c.total, 0), s.spent, 'categories must sum to the total');
  });

  await t.test('and the trend line, which is the same total drawn per month', async () => {
    const s = (await api.get('/api/stats?months=3')).body;
    assert.equal(s.trend.find((r) => r.m === thisMonth()).total, 120);
  });

  await t.test('the budget sees only account money too', async () => {
    await api.post('/api/budgets', { category: 'Groceries', month: thisMonth(), amount: 200 });
    const b = (await api.get('/api/budgets?month=' + thisMonth())).body;
    const spent = b.spent.find((r) => r.category === 'Groceries');
    assert.equal(spent.spent, 120, 'a budget blown by card purchases would be blown by money still in the bank');
  });

  await t.test('but the row itself is still there — nothing you typed in disappears', async () => {
    const rows = (await api.get('/api/expenses')).body;
    assert.equal(rows.length, 2);
    assert.equal(rows.find((e) => e.id === onCard.id).on_card, 1, 'the list has to show it, marked');
  });

  await t.test('the card total is reported on its own, per person', async () => {
    const s = (await api.get('/api/stats')).body;
    assert.equal(s.card.total, 300);
    assert.equal(s.card.byMember.length, 1);
    assert.equal(s.card.byMember[0].total, 300);
    assert.equal(s.card.byMember[0].n, 1);
  });
});

test('who put what on the card is answered per person', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const me = (await api.get('/api/family/members')).body[0];
  const other = (await api.post('/api/family/members', { name: 'Partener' })).body;

  await api.post('/api/expenses', { category: 'Groceries', amount: 500, date: today(), on_card: 1, user_id: me.id });
  await api.post('/api/expenses', { category: 'Entertainment', amount: 200, date: today(), on_card: 1, user_id: other.id });
  await api.post('/api/expenses', { category: 'Groceries', amount: 90, date: today(), user_id: other.id });

  const s = (await api.get('/api/stats')).body;
  const byName = Object.fromEntries(s.card.byMember.map((r) => [r.name, r.total]));
  assert.deepEqual(byName, { [me.name]: 500, Partener: 200 });
  assert.equal(s.spent, 90, 'only the one paid from the account');

  await t.test('and narrowing to one person narrows the card figure with it', async () => {
    const mine = (await api.get('/api/stats?user=' + other.id)).body;
    assert.equal(mine.card.total, 200, 'the other person\'s card spending is not this person\'s');
    assert.equal(mine.spent, 90);
  });
});

test('unticking the box on an edit actually clears it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const e = (await api.post('/api/expenses', {
    category: 'Other', amount: 50, date: today(), on_card: 1,
  })).body;
  assert.equal((await api.get('/api/stats')).body.spent, 0);

  // the browser sends 0 rather than omitting the field, because the edit route falls back to the
  // stored row for anything the body leaves out — an omitted flag would keep the old answer
  const fixed = (await api.put('/api/expenses/' + e.id, {
    category: 'Other', amount: 50, date: today(), on_card: 0,
  })).body;
  assert.equal(fixed.on_card, 0);
  assert.equal((await api.get('/api/stats')).body.spent, 50, 'correcting the mistake has to move the money back');

  await t.test('an edit that never mentions the flag leaves it alone', async () => {
    await api.put('/api/expenses/' + e.id, { category: 'Other', amount: 50, date: today(), on_card: 1 });
    const untouched = (await api.put('/api/expenses/' + e.id, { amount: 75 })).body;
    assert.equal(untouched.on_card, 1, 'changing the amount is not a statement about how it was paid');
  });

  await t.test('nonsense in the field is refused rather than quietly read as false', async () => {
    const bad = await api.post('/api/expenses', {
      category: 'Other', amount: 10, date: today(), on_card: 'maybe',
    });
    assert.equal(bad.status, 400, bad.text);
  });
});

test('a recurring cost paid by card carries the flag onto every month it logs', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  // day 1 has already passed in every month, so this logs immediately on create
  const r = (await api.post('/api/recurring-expenses', {
    category: 'Subscriptions', note: 'Netflix', amount: 60, day: 1, on_card: 1,
  })).body;
  assert.equal(r.on_card, 1);

  const logged = (await api.get('/api/expenses')).body.find((e) => e.note === 'Netflix');
  assert.ok(logged, 'the recurring cost logs itself for the current month');
  assert.equal(logged.on_card, 1, 'otherwise the flag is lost the moment the app logs it for you');
  assert.equal((await api.get('/api/stats')).body.spent, 0);
  assert.equal((await api.get('/api/stats')).body.card.total, 60);

  await t.test('and it is not in what is still to come out of the account this month', async () => {
    const up = (await api.get('/api/upcoming-month')).body;
    assert.ok(!up.items.some((i) => i.label === 'Netflix'), 'it is going on the card, not out of the account');
  });
});

test('the CSV export says how each expense was paid', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 10, date: today(), note: 'cash one' });
  await api.post('/api/expenses', { category: 'Groceries', amount: 20, date: plusDays(1), note: 'card one', on_card: 1 });
  const csv = (await api.get('/api/export/expenses.csv')).text;
  const [head, ...rows] = csv.trim().split('\n');
  assert.match(head, /paid_by_card$/);
  assert.match(rows.find((r) => r.includes('cash one')), /"no"$/);
  assert.match(rows.find((r) => r.includes('card one')), /"yes"$/);
});

test('card spending belongs to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  await mine.post('/api/expenses', { category: 'Other', amount: 400, date: today(), on_card: 1 });
  assert.equal((await theirs.get('/api/stats')).body.card.total, 0);
});
