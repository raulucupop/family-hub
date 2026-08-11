/* Two ways the app could hold a number that is no longer true: money that left the account without
   appearing in the spending, and a goal still calling itself finished after the money went. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today } = require('./helpers');

test('an advance credit payment lands in the expenses', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const credit = (await api.post('/api/credits', {
    name: 'Casa', lender: 'BT', principal: 100000, interest_rate: 6, term_months: 120, start_date: '2025-01-15',
  })).body;

  const spentBefore = (await api.get('/api/stats?months=1')).body.spent;
  const pay = await api.post(`/api/credits/${credit.id}/payments`, { amount: 1655.4, date: today(), months: 2 });
  assert.equal(pay.status, 200, pay.text);

  await t.test('the money shows up as spent, for what the bank actually charged', async () => {
    const stats = (await api.get('/api/stats?months=1')).body;
    assert.equal(Math.round((stats.spent - spentBefore) * 100) / 100, 1655.4);
  });

  await t.test('and as a Credit expense that says how many months it bought', async () => {
    const hit = (await api.get('/api/expenses')).body.find((e) => e.amount === 1655.4);
    assert.ok(hit, 'no expense written for the advance payment');
    assert.equal(hit.category, 'Credit');
    assert.equal(hit.date, today());
    assert.match(hit.note, /2 months in advance/);
  });

  await t.test('deleting the payment takes the expense back out', async () => {
    const pid = (await api.get(`/api/credits/${credit.id}/payments`)).body[0].id;
    await api.del(`/api/credits/${credit.id}/payments/${pid}`);
    assert.equal((await api.get('/api/expenses')).body.filter((e) => e.amount === 1655.4).length, 0);
    assert.equal((await api.get('/api/stats?months=1')).body.spent, spentBefore);
  });

  await t.test('a payment with no month count still logs the money', async () => {
    const r = await api.post(`/api/credits/${credit.id}/payments`, { amount: 500, date: today() });
    assert.equal(r.status, 200, r.text);
    const hit = (await api.get('/api/expenses')).body.find((e) => e.amount === 500);
    assert.ok(hit);
    assert.match(hit.note, /advance payment/);
  });

  await t.test('one payment writes one expense, never two', async () => {
    const all = (await api.get('/api/expenses')).body.filter((e) => e.amount === 500);
    assert.equal(all.length, 1);
  });
});

test('a savings goal stops calling itself finished once the money goes', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const goal = (await api.post('/api/savings-goals', { title: 'Vacanța', target: 5000 })).body;
  const goalId = goal.id ?? (await api.get('/api/savings')).body.goals[0].id;

  await api.post('/api/savings', { kind: 'deposit', amount: 5000, date: today(), goal_id: goalId });
  await api.post(`/api/savings-goals/${goalId}/toggle`); // the user closes it, having reached it
  const closed = (await api.get('/api/savings')).body.goals.find((g) => g.id === goalId);
  assert.equal(closed.done, 1, 'marking done is still the user’s call');
  assert.equal(closed.saved, 5000);

  await t.test('withdrawing below the target reopens it', async () => {
    await api.post('/api/savings', { kind: 'withdrawal', amount: 2000, date: today(), goal_id: goalId });
    const g = (await api.get('/api/savings')).body.goals.find((x) => x.id === goalId);
    assert.equal(g.saved, 3000);
    assert.equal(g.done, 0, 'a goal 2.000 short of its target is not finished');
  });

  await t.test('but nothing ever marks a goal done on its own', async () => {
    await api.post('/api/savings', { kind: 'deposit', amount: 4000, date: today(), goal_id: goalId });
    const g = (await api.get('/api/savings')).body.goals.find((x) => x.id === goalId);
    assert.ok(g.saved >= 5000, 'back over the target');
    assert.equal(g.done, 0, 'reaching the target is shown, not decided for you');
  });

  await t.test('deleting a deposit reopens it too', async () => {
    await api.post(`/api/savings-goals/${goalId}/toggle`); // close it again
    assert.equal((await api.get('/api/savings')).body.goals.find((x) => x.id === goalId).done, 1);
    const entries = (await api.get('/api/savings')).body.entries.filter((e) => e.kind === 'deposit');
    await api.del(`/api/savings/${entries[0].id}`);
    const g = (await api.get('/api/savings')).body.goals.find((x) => x.id === goalId);
    assert.equal(g.done, 0, 'the balance fell, so the claim had to go with it');
  });
});
