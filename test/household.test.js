/* Chores, the tenancy, and the rule that a managed property's money never touches the family's own
   books. The last one is the least visible and the most expensive to get wrong. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today, plusDays } = require('./helpers');

test('chores reset by period, not by a nightly job', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  const daily = (await api.post('/api/chores', { title: 'Câinii', cadence: 'daily' })).body;
  const weekly = (await api.post('/api/chores', { title: 'Aspirat', cadence: 'weekly', weekday: 5 })).body;

  await t.test('a weekday on a daily chore is dropped rather than stored as a lie', async () => {
    const d = (await api.post('/api/chores', { title: 'Gunoi', cadence: 'daily', weekday: 3 })).body;
    assert.equal(d.weekday, null);
  });

  await t.test('rejects a cadence it does not have, an empty title, a weekday off the week', async () => {
    assert.equal((await api.post('/api/chores', { title: 'X', cadence: 'monthly' })).status, 400);
    assert.equal((await api.post('/api/chores', { title: '', cadence: 'daily' })).status, 400);
    assert.equal((await api.post('/api/chores', { title: 'Y', cadence: 'weekly', weekday: 9 })).status, 400);
  });

  await t.test('ticking today marks it done today', async () => {
    await api.post(`/api/chores/${daily.id}/toggle`);
    await api.post(`/api/chores/${weekly.id}/toggle`);
    const rows = (await api.get('/api/chores')).body;
    assert.equal(rows.find((c) => c.id === daily.id).done, true);
    assert.equal(rows.find((c) => c.id === weekly.id).done, true);
  });

  await t.test('tomorrow the daily one is open again and the weekly one is not', async () => {
    const rows = (await api.get(`/api/chores?date=${plusDays(1)}`)).body;
    assert.equal(rows.find((c) => c.id === daily.id).done, false, 'daily resets overnight');
    // ...as long as tomorrow is still the same week; if today is Sunday it rolls too, which is correct
    const sameWeek = new Date(today() + 'T00:00:00Z').getUTCDay() !== 0;
    if (sameWeek) assert.equal(rows.find((c) => c.id === weekly.id).done, true, 'weekly holds within its week');
  });

  await t.test('next week both are open again', async () => {
    const rows = (await api.get(`/api/chores?date=${plusDays(8)}`)).body;
    assert.equal(rows.find((c) => c.id === daily.id).done, false);
    assert.equal(rows.find((c) => c.id === weekly.id).done, false);
  });

  await t.test('toggling is a switch, and ticking twice cannot double-count', async () => {
    const off = await api.post(`/api/chores/${daily.id}/toggle`);
    assert.equal(off.body.done, false);
    const on = await api.post(`/api/chores/${daily.id}/toggle`);
    assert.equal(on.body.done, true);
    await api.post(`/api/chores/${daily.id}/toggle`);   // off
    await api.post(`/api/chores/${daily.id}/toggle`);   // on
    const rows = (await api.get('/api/chores')).body;
    assert.equal(rows.filter((c) => c.id === daily.id).length, 1, 'still one row, not one per tick');
  });
});

test('the tenancy contract', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Cluj', rent_amount: 2400, rent_due_day: 5 })).body;

  await t.test('refuses dates that cannot be true', async () => {
    assert.equal((await api.put(`/api/properties/${prop.id}`, { lease_start: '2026-09-01', lease_end: '2026-08-01' })).status, 400);
    assert.equal((await api.put(`/api/properties/${prop.id}`, { lease_end: 'candva' })).status, 400);
    assert.equal((await api.put(`/api/properties/${prop.id}`, { notice_days: 400 })).status, 400);
    assert.equal((await api.put(`/api/properties/${prop.id}`, { deposit_amount: -5 })).status, 400);
  });

  await t.test('a lease 70 days out raises the notice 30 days before it', async () => {
    const r = await api.put(`/api/properties/${prop.id}`, {
      lease_start: '2025-09-01', lease_end: plusDays(70), notice_days: 30, deposit_amount: 2400,
    });
    assert.equal(r.status, 200, r.text);
    const rem = (await api.get('/api/reminders?days=90')).body;
    const end = rem.find((x) => x.kind === 'lease_end');
    const notice = rem.find((x) => x.kind === 'lease_notice');
    assert.ok(end, 'the end date is a deadline');
    assert.ok(notice, 'and so is the notice');
    assert.equal(end.days_left, 70);
    assert.equal(notice.days_left, 40, 'notice sits notice_days before the end');
  });

  await t.test('a notice window already missed is not raised at all', async () => {
    await api.put(`/api/properties/${prop.id}`, { lease_end: plusDays(10), notice_days: 30 });
    const rem = (await api.get('/api/reminders?days=90')).body;
    assert.ok(rem.some((x) => x.kind === 'lease_end'), 'the end still counts');
    assert.equal(rem.filter((x) => x.kind === 'lease_notice').length, 0,
      'but a deadline you cannot meet is noise, not information');
  });

  await t.test('saving the lease does not wipe the rent', async () => {
    // crud() PUT merges; this is the guard for the day someone changes that
    await api.put(`/api/properties/${prop.id}`, { lease_end: plusDays(200), notice_days: 60 });
    const p = (await api.get('/api/properties')).body.find((x) => x.id === prop.id);
    assert.equal(p.rent_amount, 2400, 'rent survived a lease-only update');
    assert.equal(p.rent_due_day, 5);
    assert.equal(p.name, 'Cluj');
  });
});

test("a managed property's money stays out of the family's books", async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const ours = (await api.post('/api/properties', { name: 'A noastră', managed: 0 })).body;
  const theirs = (await api.post('/api/properties', { name: 'Administrată', managed: 1 })).body;

  await t.test('managed defaults to 0 rather than NULL when the field is omitted', async () => {
    const plain = (await api.post('/api/properties', { name: 'Fără flag' })).body;
    assert.equal(plain.managed, 0, 'a NOT NULL column must not take a NULL from an omitted field');
  });

  await t.test('an expense cannot be pinned to a managed property', async () => {
    const bad = await api.post('/api/expenses', {
      amount: 700, category: 'Utilities', date: today(), property_id: theirs.id,
    });
    assert.equal(bad.status, 400, 'that cost belongs to the property, not to us');
    const good = await api.post('/api/expenses', {
      amount: 500, category: 'Utilities', date: today(), property_id: ours.id,
    });
    assert.equal(good.status, 200, good.text);
  });

  await t.test('and the household totals only ever saw our own', async () => {
    const stats = (await api.get('/api/stats?months=1')).body;
    assert.equal(stats.spent, 500);
  });
});
