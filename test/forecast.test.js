/* "Will I still be above zero on the 14th" — the question a budget app is usually too polite to
   answer. It only works if the arithmetic is honest about three things: the starting balance ages,
   a bill you pay by hand leaves the account exactly like an auto-paid one, and money in another
   currency cannot be added to the total at all. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

// A recurring cost is set by day-of-month, but the assertions are about a real date. Picking the
// day out of a date N days from now keeps both true whatever day the suite runs on — including
// the end of the month, where "today + 2" is next month and any day-of-month capped at 28 is
// already in the past.
const dayOf = (iso) => Number(iso.slice(8, 10));

test('with no balance entered, the forecast says so instead of guessing', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const f = (await api.get('/api/forecast')).body;
  assert.equal(f.needs_balance, true);
  assert.equal(f.balance, null);
  assert.deepEqual(f.items, [], 'a projection with no starting point is not worth drawing');
});

test('the forecast starts from the balance, aged forward to today', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/balance', { balance: 5000, date: plusDays(-10) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 300, date: plusDays(-4) });
  await api.post('/api/incomes', { source: 'Bonus', amount: 800, date: plusDays(-2) });

  const f = (await api.get('/api/forecast')).body;
  assert.equal(f.today, 5500, '5000 minus 300 spent plus 800 in, since the reading');
  assert.equal(f.stale_days, 10, 'how old the number is has to travel with it');

  await t.test('a card purchase does not move the balance — the card bill will', async () => {
    await api.post('/api/expenses', { category: 'Groceries', amount: 400, date: plusDays(-1), on_card: 1 });
    assert.equal((await api.get('/api/forecast')).body.today, 5500);
  });

  await t.test('spending recorded before the reading is already inside it', async () => {
    await api.post('/api/expenses', { category: 'Other', amount: 999, date: plusDays(-30) });
    assert.equal((await api.get('/api/forecast')).body.today, 5500, 'counting it again would double-charge it');
  });

  await t.test('a balance from the future is refused', async () => {
    const bad = await api.post('/api/balance', { balance: 100, date: plusDays(3) });
    assert.equal(bad.status, 400, bad.text);
  });
});

test('everything the app knows is coming is applied, day by day', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const when = plusDays(3);
  await api.post('/api/balance', { balance: 1000, date: today() });
  await api.post('/api/bills', { name: 'Enel', category: 'electricity', amount: 250, due_date: when });
  await api.post('/api/recurring-expenses', { category: 'Subscriptions', note: 'Netflix', amount: 60, day: dayOf(when) });
  await api.post('/api/recurring-incomes', { source: 'Salariu', amount: 4000, day: dayOf(when) });

  const f = (await api.get('/api/forecast?days=20')).body;
  const labels = f.items.map((i) => i.label).sort();
  assert.deepEqual(labels, ['Enel', 'Netflix', 'Salariu']);

  await t.test('a hand-paid bill counts, not only the auto-paid ones', () => {
    const enel = f.items.find((i) => i.label === 'Enel');
    assert.equal(enel.amount, -250, 'leaving it out is how a forecast ends up cheerful and wrong');
  });

  await t.test('the balance on the day is the balance plus that day\'s movements', () => {
    const onTheDay = f.series.find((p) => p.date === when);
    assert.equal(onTheDay.amount, 1000 - 250 - 60 + 4000);
  });

  await t.test('and the day before is untouched', () => {
    const before = f.series.find((p) => p.date === plusDays(2));
    assert.equal(before.amount, 1000);
  });
});

test('the low point is the number worth knowing', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const billDay = plusDays(3);
  const payday = plusDays(6);
  await api.post('/api/balance', { balance: 2000, date: today() });
  await api.post('/api/bills', { name: 'Impozit', category: 'property_tax', amount: 1800, due_date: billDay });
  await api.post('/api/recurring-incomes', { source: 'Salariu', amount: 5000, day: dayOf(payday) });

  const f = (await api.get('/api/forecast?days=25')).body;
  assert.equal(f.low.amount, 200, 'the dip between the bill and the salary is the thing to see');
  assert.equal(f.low.date, billDay);
  assert.equal(f.end.amount, 5200, 'and it recovers after payday');
});

test('an overdue bill is money still to leave, dated today rather than dropped', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/balance', { balance: 1000, date: today() });
  await api.post('/api/bills', { name: 'Digi', category: 'internet', amount: 45, due_date: plusDays(-6) });

  const f = (await api.get('/api/forecast?days=10')).body;
  const digi = f.items.find((i) => i.label === 'Digi');
  assert.equal(digi.date, today(), 'it is not in the future, but it has not been paid either');
  assert.equal(f.series[0].amount, 955);
});

test('rent still owed is money coming in — unless it is in another currency', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/balance', { balance: 500, date: today() });
  const lei = (await api.post('/api/properties', { name: 'Garsoniera' })).body;
  const euro = (await api.post('/api/properties', { name: 'Apartament', rent_currency: 'EUR' })).body;
  await api.post(`/api/properties/${lei.id}/charges`, { type: 'invoice', title: 'Chirie lei', amount: 900, due_date: plusDays(4) });
  await api.post(`/api/properties/${euro.id}/charges`, { type: 'invoice', title: 'Chirie euro', amount: 400, due_date: plusDays(4) });

  const f = (await api.get('/api/forecast?days=15')).body;
  assert.equal(f.end.amount, 1400, '500 plus the 900 lei; the euro one cannot be added without a rate');
  assert.deepEqual(f.skipped.map((x) => x.label), ['Chirie euro']);
  assert.equal(f.skipped[0].currency, '€', 'it is listed rather than silently missing');
});

test('a forecast belongs to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  await mine.post('/api/balance', { balance: 9999, date: today() });
  assert.equal((await theirs.get('/api/forecast')).body.needs_balance, true);
});
