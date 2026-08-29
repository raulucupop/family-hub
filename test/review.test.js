/* The weekly two minutes. Its whole value rests on "since you last looked" meaning something: if
   the window were a rolling seven days, the same things would keep reappearing after you dealt with
   them, and anyone who was away for three weeks would silently lose two of them. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

test('the first visit looks back a week and says so', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const r = (await api.get('/api/review')).body;
  assert.equal(r.first_time, true);
  assert.deepEqual(r.changed, []);
  assert.deepEqual(r.decide, []);
  assert.equal(r.money.needs_balance, true, 'with no balance entered it asks for one rather than inventing zero');
});

test('what needs a person is listed with the thing that settles it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const bill = (await api.post('/api/bills', {
    name: 'Enel', category: 'electricity', amount: 480, due_date: plusDays(-2),
  })).body;
  const todo = (await api.post('/api/todos', { title: 'Sunat la contabil', due_date: today() })).body;
  await api.post('/api/bills', { name: 'Digi', category: 'internet', amount: 45, due_date: plusDays(10) });

  const r = (await api.get('/api/review')).body;
  const kinds = r.decide.map((d) => `${d.kind}:${d.label}`).sort();
  assert.deepEqual(kinds, ['pay_bill:Enel', 'todo:Sunat la contabil'],
    'a bill that is not due yet is not a decision — it is just a bill');

  await t.test('paying it takes it off the list', async () => {
    await api.post(`/api/bills/${bill.id}/pay`, {});
    const after = (await api.get('/api/review')).body;
    assert.ok(!after.decide.some((d) => d.kind === 'pay_bill'));
  });

  await t.test('and ticking the task takes that off too', async () => {
    await api.post(`/api/todos/${todo.id}/toggle`, {});
    const after = (await api.get('/api/review')).body;
    assert.deepEqual(after.decide, []);
  });
});

test('a charge the tenant says they paid waits for a person, with the amount in its own currency', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', {
    name: 'Apartament', rent_amount: 400, rent_currency: 'EUR', rent_due_day: 5,
  })).body;
  const charge = (await api.post(`/api/properties/${prop.id}/charges`, {
    type: 'rent', title: 'Chirie august', amount: 400, due_date: today(),
  })).body;
  const invite = (await api.post(`/api/properties/${prop.id}/tenant/invite`)).body.invite_code;

  // a second session, so the owner client stays signed in as the owner
  const base = `http://127.0.0.1:${api.port}`;
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Chirias', email: `c${api.port}@test.ro`, password: 'Parola12345', inviteCode: invite }),
  });
  const cookie = (reg.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  await fetch(`${base}/api/tenant/charges/${charge.id}/pay`, { method: 'POST', headers: { Cookie: cookie } });

  const r = (await api.get('/api/review')).body;
  const item = r.decide.find((d) => d.kind === 'confirm_charge');
  assert.ok(item, 'somebody has to say the money actually arrived');
  assert.equal(item.amount, 400);
  assert.equal(item.currency, '€', 'the lease is in euro, so the row cannot be shown in lei');

  await t.test('confirming it clears it', async () => {
    await api.post(`/api/properties/${prop.id}/charges/${charge.id}/confirm`, {});
    assert.equal((await api.get('/api/review')).body.decide.length, 0);
  });
});

test('"since you last looked" is the button, not a rolling week', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/watch', { label: 'Primaria', url: 'https://example.invalid/feed', kind: 'feed' });
  // an announcement the family has been told about
  const { DatabaseSync } = require('node:sqlite');
  const path = require('node:path');
  const d = new DatabaseSync(path.join(api.dir, 'familyhub.db'));
  const site = d.prepare('SELECT id, family_id FROM watched_sites LIMIT 1').get();
  d.prepare("INSERT INTO watched_items (site_id, family_id, guid, title, announced, seen_at) VALUES (?,?,?,?,1,datetime('now'))")
    .run(site.id, site.family_id, 'g1', 'Licitatie teren');
  d.close();

  assert.ok((await api.get('/api/review')).body.changed.some((c) => c.label === 'Licitatie teren'));

  await t.test('after saying done, it is no longer new', async () => {
    const done = (await api.post('/api/review/done')).body;
    assert.match(done.last_review_at, /^\d{4}-\d{2}-\d{2} /);
    const after = (await api.get('/api/review')).body;
    assert.equal(after.first_time, false);
    assert.deepEqual(after.changed, [], 'the point of the button is that it moves the line');
  });

  await t.test('anything that happens afterwards is new again', async () => {
    const { DatabaseSync: DB } = require('node:sqlite');
    const p2 = require('node:path');
    const d2 = new DB(p2.join(api.dir, 'familyhub.db'));
    const s2 = d2.prepare('SELECT id, family_id FROM watched_sites LIMIT 1').get();
    d2.prepare("INSERT INTO watched_items (site_id, family_id, guid, title, announced, seen_at) VALUES (?,?,?,?,1,datetime('now','+2 seconds'))")
      .run(s2.id, s2.family_id, 'g2', 'Alta licitatie');
    d2.close();
    const after = (await api.get('/api/review')).body;
    assert.deepEqual(after.changed.map((c) => c.label), ['Alta licitatie']);
  });
});

test('the line moves per person, not per family', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/review/done');
  const other = (await api.post('/api/family/members', { name: 'Diana' })).body;
  assert.ok(other.id);
  // the owner has ticked; a member who has not still gets the first-visit window
  const mine = (await api.get('/api/review')).body;
  assert.equal(mine.first_time, false, 'the person who ticked has a line now');
});

test('a review belongs to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  await mine.post('/api/bills', { name: 'Enel', category: 'electricity', amount: 480, due_date: plusDays(-2) });
  assert.deepEqual((await theirs.get('/api/review')).body.decide, []);
});
