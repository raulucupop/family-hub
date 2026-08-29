/* A warranty is not a document that expires: it is a claim you can still make, against a named
   seller, on a thing with a serial number — and it is worth nothing without the receipt. The date
   arithmetic is the part that quietly goes wrong, so most of these tests are about the date. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

test('cover ends where the purchase date plus the months lands', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  await t.test('the ordinary case', async () => {
    const w = (await api.post('/api/warranties', {
      name: 'Mașină de spălat', purchased_at: '2026-03-14', months: 24,
    })).body;
    assert.equal(w.expires_at, '2028-03-14');
  });

  await t.test('a month that has no 31st clamps instead of rolling into the next one', async () => {
    const w = (await api.post('/api/warranties', {
      name: 'Frigider', purchased_at: '2026-05-31', months: 6,
    })).body;
    assert.equal(w.expires_at, '2026-11-30', 'rolling over would hand out a free extra day of cover');
  });

  await t.test('and 29 February is reached from a leap year', async () => {
    const w = (await api.post('/api/warranties', {
      name: 'Laptop', purchased_at: '2024-02-29', months: 12,
    })).body;
    assert.equal(w.expires_at, '2025-02-28');
  });

  await t.test('an explicit end date wins, because plenty of receipts only say one', async () => {
    const w = (await api.post('/api/warranties', {
      name: 'Bormașină', purchased_at: '2026-01-10', months: 24, expires_at: '2027-06-30',
    })).body;
    assert.equal(w.expires_at, '2027-06-30');
  });

  await t.test('neither an end date nor a length is refused, not stored as null', async () => {
    const bad = await api.post('/api/warranties', { name: 'Ceva', purchased_at: today() });
    assert.equal(bad.status, 400, bad.text);
    assert.match(bad.body.error, /expiry date|months/i);
  });

  await t.test('cover cannot end before the thing was bought', async () => {
    const bad = await api.post('/api/warranties', {
      name: 'Ceva', purchased_at: '2026-05-01', expires_at: '2026-04-01',
    });
    assert.equal(bad.status, 400, bad.text);
  });
});

test('editing the purchase date moves the end date with it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const w = (await api.post('/api/warranties', {
    name: 'Aspirator', purchased_at: '2026-01-15', months: 24,
  })).body;
  assert.equal(w.expires_at, '2028-01-15');

  await t.test('a corrected receipt date recomputes the cover', async () => {
    const fixed = (await api.put(`/api/warranties/${w.id}`, { purchased_at: '2026-02-15' })).body;
    assert.equal(fixed.expires_at, '2028-02-15', 'otherwise the reminder keeps firing on the old date');
  });

  await t.test('a corrected length does too', async () => {
    const fixed = (await api.put(`/api/warranties/${w.id}`, { months: 36 })).body;
    assert.equal(fixed.expires_at, '2029-02-15');
  });

  await t.test('but naming an end date outright still wins', async () => {
    const fixed = (await api.put(`/api/warranties/${w.id}`, { expires_at: '2030-01-01' })).body;
    assert.equal(fixed.expires_at, '2030-01-01');
  });
});

test('a live warranty is a reminder; an expired one is history', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const live = (await api.post('/api/warranties', {
    name: 'Telefon', seller: 'eMAG', expires_at: plusDays(20),
  })).body;
  await api.post('/api/warranties', { name: 'Prăjitor', seller: 'Altex', expires_at: plusDays(-5) });

  const rem = (await api.get('/api/reminders')).body.filter((r) => r.kind === 'warranty');
  assert.equal(rem.length, 1, 'an expired warranty has nothing left to act on');
  assert.equal(rem[0].label, 'Warranty: Telefon');
  assert.equal(rem[0].entity, 'eMAG', 'who you claim from is the useful second line');
  assert.equal(rem[0].ref_id, live.id);

  await t.test('both are still listed, because the expired one is the purchase record', async () => {
    const all = (await api.get('/api/warranties')).body;
    assert.equal(all.length, 2);
  });

  await t.test('it raises an alert while it is running out', async () => {
    const { items } = (await api.get('/api/notifications')).body;
    assert.ok(items.some((a) => /Telefon/.test(`${a.title} ${a.body}`)), 'a warranty about to lapse is worth a nudge');
    assert.ok(!items.some((a) => /Prăjitor/.test(`${a.title} ${a.body}`)), 'and one already gone is not');
  });
});

test('the Romanian reader gets Romanian, name and all', async (t) => {
  const api = await startServer({ MAIL_FROM: 'hub@test.ro', MAIL_DEBUG: '1', CRON_TOKEN: 'tok' });
  t.after(() => api.stop());
  await api.post('/api/settings', { lang: 'ro' });
  await api.post('/api/warranties', { name: 'Mașină de spălat', seller: 'eMAG', expires_at: plusDays(6) });
  await api.get('/api/cron/email-reminders?token=tok');
  await new Promise((r) => setTimeout(r, 700));

  const mail = api.log().split('MAIL_DEBUG:').slice(1).find((m) => /Garan/i.test(m));
  assert.ok(mail, 'the deadline name has to be translated like every other one');
  assert.match(mail, /Garanție: Mașină de spălat/, 'the prefix is translated, the name is left as typed');
});

test('warranties belong to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  const w = (await mine.post('/api/warranties', { name: 'Telefon', expires_at: plusDays(30) })).body;
  assert.deepEqual((await theirs.get('/api/warranties')).body, []);
  assert.equal((await theirs.put(`/api/warranties/${w.id}`, { name: 'Furat' })).status, 404);
  assert.equal((await theirs.del(`/api/warranties/${w.id}`)).status, 404);
  assert.equal((await theirs.get('/api/reminders')).body.filter((r) => r.kind === 'warranty').length, 0);
});
