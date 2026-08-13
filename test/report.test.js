/* The monthly report now says something in words, and words are where a summary starts lying: a
   compliment for a month that went badly, or a number that came from a sentence instead of the
   ledger. These tests hold the narrative to the ledger, and hold it quiet when there is nothing
   true to say. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

// a fixed month pair well in the past, so the tests never race the real calendar
const M = '2025-05';
const PREV = '2025-04';
const day = (month, d = 12) => `${month}-${String(d).padStart(2, '0')}`;

const report = async (api, month = M) => (await api.get(`/api/report?month=${month}`)).body;
const said = (lines, re) => lines.some((l) => re.test(l));

test('a family with nothing recorded is told nothing', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const r = await report(api);
  assert.deepEqual(r.lines, [], 'an empty month must not be dressed up as a good one');
  assert.equal(r.facts.spent, 0);
});

test('the month is summed up against the one before it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 2000, date: day(PREV) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 1200, date: day(M) });
  await api.post('/api/incomes', { source: 'Salariu', amount: 5000, date: day(M) });

  const { lines, facts } = await report(api);
  assert.equal(facts.spent, 1200);
  assert.equal(facts.prevSpent, 2000);

  await t.test('it names the drop, with the amount from the ledger', () => {
    assert.ok(said(lines, /800\.00 .* less than in April/), lines.join(' | '));
  });

  await t.test('and says which category the drop came from', () => {
    assert.ok(said(lines, /Groceries came down by 800\.00/), lines.join(' | '));
  });

  await t.test('nothing claims a rise that did not happen', () => {
    assert.ok(!said(lines, /more than in/), lines.join(' | '));
  });
});

test('with no month to compare against, the report says what is left instead', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 1200, date: day(M) });
  await api.post('/api/incomes', { source: 'Salariu', amount: 5000, date: day(M) });

  const { lines } = await report(api);
  assert.ok(said(lines, /^May closed at 1200\.00 RON\.$/), lines.join(' | '));
  assert.ok(said(lines, /leaves 3800\.00/), lines.join(' | '));
  assert.ok(!said(lines, /than in April/), 'there is no April to compare with');
});

test('a month that went badly is not congratulated', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 1000, date: day(PREV) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 4000, date: day(M) });
  await api.post('/api/incomes', { source: 'Salariu', amount: 3000, date: day(M) });

  const { lines } = await report(api);
  await t.test('the overspend is stated plainly', () => {
    assert.ok(said(lines, /1000\.00 .* past what came in/), lines.join(' | '));
  });
  await t.test('and the rise is not sold as a saving', () => {
    assert.ok(said(lines, /3000\.00 .* more than in April/), lines.join(' | '));
    assert.ok(!said(lines, /less than in|came down by|aside/), lines.join(' | '));
  });
});

test('a budget kept two months running is called out; one broken is not', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  for (const month of [PREV, M]) {
    await api.post('/api/budgets', { category: 'Groceries', month, amount: 1500 });
    await api.post('/api/expenses', { category: 'Groceries', amount: 1400, date: day(month) });
  }

  const kept = await report(api);
  assert.equal(kept.facts.streak.months, 2);
  assert.ok(said(kept.lines, /2 months in a row inside the Groceries budget/), kept.lines.join(' | '));

  await t.test('going over turns the praise into a finding and a next step', async () => {
    await api.post('/api/expenses', { category: 'Groceries', amount: 400, date: day(M, 20) });
    const { lines, facts } = await report(api);
    assert.equal(facts.budgets[0].kept, false);
    assert.equal(facts.streak, null, 'the run ended, so there is no run to mention');
    assert.ok(said(lines, /Groceries went 300\.00 .* past its budget/), lines.join(' | '));
    assert.ok(said(lines, /Hold Groceries under 1500\.00/), lines.join(' | '));
    assert.ok(!said(lines, /in a row/), lines.join(' | '));
  });
});

test('a month with no budget at all still gets a usable next step', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Healthcare', amount: 100, date: day(PREV) });
  await api.post('/api/expenses', { category: 'Healthcare', amount: 900, date: day(M) });

  const { lines } = await report(api);
  assert.ok(said(lines, /Healthcare rose by 800\.00/), lines.join(' | '));
  assert.ok(said(lines, /A budget on Healthcare/), lines.join(' | '));
});

test('savings and goals are reported from what actually moved', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const goal = (await api.post('/api/savings-goals', { title: 'Vacanța', target: 4000 })).body;
  const goalId = goal.id ?? (await api.get('/api/savings')).body.goals[0].id;
  await api.post('/api/savings', { kind: 'deposit', amount: 1000, date: day(PREV), goal_id: goalId });
  await api.post('/api/savings', { kind: 'deposit', amount: 1500, date: day(M), goal_id: goalId });
  await api.post('/api/expenses', { category: 'Groceries', amount: 500, date: day(M) });

  const { lines, facts } = await report(api);
  assert.equal(facts.savedMonth, 1500);
  assert.equal(facts.savedTotal, 2500, 'the balance is as of that month, not as of today');
  assert.equal(facts.goals[0].gained, 1500);
  assert.ok(said(lines, /put 1500\.00 .* aside, taking the fund to 2500\.00/), lines.join(' | '));

  await t.test('a deposit made after the reported month is not counted into it', async () => {
    await api.post('/api/savings', { kind: 'deposit', amount: 9999, date: day('2025-06'), goal_id: goalId });
    const again = await report(api);
    assert.equal(again.facts.savedTotal, 2500);
    assert.ok(!said(again.lines, /9999/), again.lines.join(' | '));
  });
});

test('the same month reads in the language of whoever asks', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/expenses', { category: 'Groceries', amount: 2000, date: day(PREV) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 1200, date: day(M) });

  const en = await report(api);
  assert.ok(said(en.lines, /^May closed at 1200\.00/), en.lines.join(' | '));

  await api.post('/api/settings', { lang: 'ro' });
  const ro = await report(api);
  assert.ok(said(ro.lines, /^Mai s-a închis pe 1200\.00/), ro.lines.join(' | '));
  assert.ok(said(ro.lines, /cu 800\.00 .* mai puțin decât în aprilie/), ro.lines.join(' | '));

  await t.test('and category names are translated, not left as database keys', () => {
    assert.ok(said(ro.lines, /Alimente a scăzut cu 800\.00/), ro.lines.join(' | '));
    assert.ok(!said(ro.lines, /Groceries/), ro.lines.join(' | '));
  });
});
