/* The money maths. Every case here corresponds to something that was either wrong once or is
   fiddly enough that it will be: amortisation, the day-of-month clamp, and the rule that an
   advance payment stores what the bank charged rather than what we calculated. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today } = require('./helpers');

test('credits', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  const made = await api.post('/api/credits', {
    name: 'Casa', lender: 'BT', principal: 100000, interest_rate: 6, term_months: 120,
    start_date: '2025-01-15', monthly_day: 15,
  });
  assert.equal(made.status, 200, made.text);
  const id = made.body.id;

  await t.test('an advance quote covers the months asked for and adds the 1% fee', async () => {
    const one = (await api.get(`/api/credits/${id}/advance?months=1`)).body;
    const three = (await api.get(`/api/credits/${id}/advance?months=3`)).body;
    assert.equal(one.months, 1);
    assert.equal(three.months, 3);
    assert.ok(one.principal > 0, 'a month of principal is more than nothing');
    assert.equal(three.fee, Math.round(three.principal * 0.01 * 100) / 100, 'fee is 1% of principal');
    assert.equal(three.total, Math.round(three.principal * 1.01 * 100) / 100);
    // interest shrinks as the balance falls, so three months of principal is MORE than 3x the first
    assert.ok(three.principal > one.principal * 3,
      `3 months (${three.principal}) should beat 3x one month (${one.principal * 3})`);
  });

  await t.test('a quote cannot buy more months than are left', async () => {
    const huge = (await api.get(`/api/credits/${id}/advance?months=999`)).body;
    assert.ok(huge.months <= 120, `capped at the term, got ${huge.months}`);
  });

  await t.test('the payment stores the bank figure, not our estimate', async () => {
    const quote = (await api.get(`/api/credits/${id}/advance?months=2`)).body;
    const bankCharged = quote.total + 137.42; // banks round and add their own fees
    const r = await api.post(`/api/credits/${id}/payments`, { amount: bankCharged, date: today(), months: 2 });
    assert.equal(r.status, 200, r.text);
    const rows = (await api.get(`/api/credits/${id}/payments`)).body;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, bankCharged, 'stored what was actually paid');
    assert.equal(rows[0].months, 2, 'and how many months it bought');
  });

  await t.test('rejects a payment with no amount, and months out of range', async () => {
    assert.equal((await api.post(`/api/credits/${id}/payments`, { amount: 0, date: today() })).status, 400);
    assert.equal((await api.post(`/api/credits/${id}/payments`, { amount: 10, date: 'ieri' })).status, 400);
    assert.equal((await api.post(`/api/credits/${id}/payments`, { amount: 10, date: today(), months: 0 })).status, 400);
    assert.equal((await api.post(`/api/credits/${id}/payments`, { amount: 10, date: today(), months: 601 })).status, 400);
  });

  await t.test('months is optional — a plain overpayment is still allowed', async () => {
    const r = await api.post(`/api/credits/${id}/payments`, { amount: 500, date: today() });
    assert.equal(r.status, 200, r.text);
    const rows = (await api.get(`/api/credits/${id}/payments`)).body;
    assert.equal(rows.find((x) => x.amount === 500).months, null);
  });
});

test('day-of-month goes up to 31', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  // These were capped at 28 once, on the reasoning that February exists. The right answer is to
  // accept 1-31 and clamp when the date is generated, so a 31st bill lands on the 28th/29th in
  // February and back on the 31st in March.
  const rec = await api.post('/api/recurring-expenses', {
    category: 'Utilities', amount: 120, day: 31, note: 'Abonament',
  });
  assert.equal(rec.status, 200, rec.text);
  assert.equal(rec.body.day, 31);

  const prop = await api.post('/api/properties', { name: 'Cluj', rent_amount: 2400, rent_due_day: 31 });
  assert.equal(prop.status, 200, prop.text);
  assert.equal(prop.body.rent_due_day, 31);

  assert.equal((await api.post('/api/recurring-expenses', { category: 'Utilities', amount: 1, day: 32 })).status, 400,
    'but 32 is still not a day');
});

test('currency is one of three, and validated', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.patch('/api/family', { currency: 'USD' })).status, 400);
  assert.equal((await api.patch('/api/family', { currency: 'nonsense' })).status, 400);
  assert.equal((await api.patch('/api/family', { currency: 'eur' })).status, 200, 'lowercase is accepted');
  assert.equal((await api.get('/api/me')).body.family.currency, 'EUR', 'and stored upper-case');
});
