/* Search kept falling behind the app: every feature added after it was written stayed unfindable,
   quietly, because nothing fails when a search returns nothing. This file is the tripwire — add an
   entity type and you have to add it here, or the suite tells you what you forgot. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today, plusDays } = require('./helpers');

test('search reaches every kind of thing the app stores', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  const prop = (await api.post('/api/properties', { name: 'Apartament Zorilor', address: 'Str. Memorandumului' })).body;
  await api.post('/api/expenses', { amount: 120, category: 'Groceries', date: today(), note: 'Piața Zorilor' });
  await api.post('/api/incomes', { amount: 9800, date: today(), source: 'Salariu Zorilor' });
  await api.post('/api/bills', { name: 'Electrica Zorilor', category: 'Utilities', amount: 210, due_date: plusDays(5) });
  await api.post('/api/credits', { name: 'Credit Zorilor', lender: 'BT', principal: 1000, interest_rate: 5, term_months: 12, start_date: today() });
  await api.post('/api/vehicles', { name: 'Skoda Zorilor', plate: 'CJ01ZOR' });
  await api.post('/api/lists', { list: 'buy', title: 'Aspirator Zorilor' });
  await api.post('/api/chores', { title: 'Aspirat Zorilor', cadence: 'weekly' });
  await api.post('/api/savings-goals', { title: 'Vacanța Zorilor', target: 12000 });
  await api.post(`/api/properties/${prop.id}/charges`, { type: 'invoice', title: 'Apă Zorilor', amount: 85, due_date: plusDays(10) });

  const hits = (await api.get('/api/search?q=zorilor')).body.results;
  const kinds = new Set(hits.map((h) => h.kind));

  // the ones search has always covered
  for (const k of ['expense', 'income', 'bill', 'credit', 'vehicle', 'property', 'list']) {
    assert.ok(kinds.has(k), `search missed ${k}`);
  }
  // ...and the ones it had grown out of step with
  for (const k of ['chore', 'goal', 'charge']) {
    assert.ok(kinds.has(k), `search missed ${k} — a feature was added without wiring it into search`);
  }

  await t.test('every hit can be rendered: it knows its title and where it lives', () => {
    for (const h of hits) {
      assert.ok(h.title, `${h.kind} hit has no title`);
      assert.ok(h.tab, `${h.kind} hit has nowhere to go`);
    }
  });

  await t.test('a one-letter query is not a search', async () => {
    assert.deepEqual((await api.get('/api/search?q=z')).body.results, []);
  });

  await t.test('another family cannot be searched into', async () => {
    const other = await startServer();
    t.after(() => other.stop());
    await other.post('/api/expenses', { amount: 1, category: 'Other', date: today(), note: 'Zorilor secret' });
    const mine = (await api.get('/api/search?q=zorilor')).body.results;
    assert.equal(mine.filter((h) => /secret/i.test(h.title || '')).length, 0);
  });
});
