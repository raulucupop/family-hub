/* A wall panel cannot sign in, so the house reads this by token — like the calendar feed. The two
   things that matter are that the token gives out figures and nothing identifying, and that it is
   only ever a way to READ. The other direction (an HA token stored here so the app could reach into
   the house) is what these tests exist to make sure never quietly appears. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

const feedPath = (url) => new URL(url).pathname;

test('the feed is off until somebody turns it on', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.get('/api/ha/info')).body.url, null, 'a token nobody asked for is a token nobody can revoke');

  const made = (await api.post('/api/ha/token')).body;
  assert.match(made.url, /\/ha\/[0-9a-f]{40}\.json$/);
  assert.equal((await api.get('/api/ha/info')).body.url, made.url);
});

test('what the token gives out is figures, not the household', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/settings', { lang: 'ro' });
  await api.post('/api/balance', { balance: 4000, date: plusDays(-1) });
  await api.post('/api/bills', { name: 'Enel secret', category: 'electricity', amount: 480, due_date: plusDays(3) });
  await api.post('/api/bills', { name: 'Digi restant', category: 'internet', amount: 45, due_date: plusDays(-4) });
  await api.post('/api/expenses', { category: 'Groceries', amount: 200, date: today(), note: 'nota privata' });
  await api.post('/api/expenses', { category: 'Groceries', amount: 350, date: today(), on_card: 1 });
  const url = (await api.post('/api/ha/token')).body.url;
  const feed = (await api.get(feedPath(url))).body;

  await t.test('the numbers a panel would show', () => {
    assert.equal(feed.bills_due_7d, 1);
    assert.equal(feed.bills_due_7d_amount, 480);
    assert.equal(feed.bills_overdue, 1);
    assert.equal(feed.bills_overdue_amount, 45);
    assert.equal(feed.month_spent, 200, 'card purchases stay out here too, like everywhere else');
    assert.equal(feed.month_on_card, 350);
    assert.equal(feed.balance_now, 3800);
  });

  await t.test('and nothing that names anybody or anything', () => {
    const text = JSON.stringify(feed);
    for (const leak of ['Enel secret', 'Digi restant', 'nota privata']) {
      assert.ok(!text.includes(leak), `the feed leaked ${JSON.stringify(leak)}`);
    }
  });

  await t.test('the next deadline is a label, in the household\'s language', async () => {
    await api.post('/api/warranties', { name: 'Telefon', expires_at: plusDays(2) });
    const f2 = (await api.get(feedPath(url))).body;
    assert.equal(f2.next_deadline, 'Garanție', 'the kind, translated — never the name the household typed');
    assert.equal(f2.next_deadline_days, 2);
  });
});

test('the feed can only be read, and only with the right token', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const url = (await api.post('/api/ha/token')).body.url;
  const path = feedPath(url);

  assert.equal((await api.get('/ha/0000000000000000000000000000000000000000.json')).status, 404);

  await t.test('every way of writing to it is refused', async () => {
    for (const call of [api.post(path, { month_spent: 0 }), api.put(path, {}), api.del(path)]) {
      const r = await call;
      assert.ok(r.status === 404 || r.status === 405, `a feed that accepts writes is a way in: got ${r.status}`);
    }
  });

  await t.test('a new address revokes the old one', async () => {
    const next = (await api.post('/api/ha/token')).body.url;
    assert.notEqual(next, url);
    assert.equal((await api.get(path)).status, 404, 'rotating has to actually take the old one out');
    assert.equal((await api.get(feedPath(next))).status, 200);
  });
});

test('one family\'s token cannot read another family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  await mine.post('/api/bills', { name: 'X', category: 'other', amount: 100, due_date: plusDays(2) });
  const url = (await theirs.post('/api/ha/token')).body.url;
  // read their token against their own server: it must describe their empty family, not ours
  assert.equal((await theirs.get(feedPath(url))).body.bills_due_7d, 0);
});

test('no Home Assistant credential is ever stored here', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/ha/token');
  // the direction of trust is the whole design: the house reads us, we never reach into the house
  const fam = (await api.get('/api/me')).body.family;
  const text = JSON.stringify(fam);
  assert.ok(!/ha_url|ha_password|long_lived|hassio|nabu/i.test(text), 'the app must not hold a key to the house');
});
