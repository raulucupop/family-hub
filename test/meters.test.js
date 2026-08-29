/* The app already asks the tenant for a meter reading on the scheduled day. Nothing told the owner
   when the answer never came — and an unanswered reading does not announce itself, it turns up
   later as an estimated invoice. These tests cover the owner's half of that exchange. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, today } = require('./helpers');

// The request is stamped by the database at the moment it is raised, so ageing it is the only way
// to reach the "still nothing after a week" behaviour without waiting a week.
function backdateRequest(api, id, days) {
  const d = new DatabaseSync(path.join(api.dir, 'familyhub.db'));
  d.prepare("UPDATE meter_requests SET requested_at = datetime('now', '-' || ? || ' days') WHERE id = ?").run(String(days), id);
  d.close();
}
const meterReminders = async (api) => (await api.get('/api/reminders')).body.filter((r) => r.kind === 'meter_pending');

// A second session against the same server, so the owner client keeps its own login.
async function asTenant(api, inviteCode, url, body) {
  const base = `http://127.0.0.1:${api.port}`;
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Chirias', email: `chirias${api.port}@test.ro`, password: 'Parola12345', inviteCode }),
  });
  assert.equal(reg.status, 200, await reg.text());
  const cookie = (reg.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const res = await fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

test('a reading the tenant has not sent becomes the owner\'s problem, visibly', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Apartament Zorilor' })).body;
  const req = (await api.post(`/api/properties/${prop.id}/meter-request`, { utility: 'water' })).body;

  await t.test('it shows up as a reminder, on the day it was asked for', async () => {
    const [r] = await meterReminders(api);
    assert.ok(r, 'without this the owner finds out when the invoice arrives with an estimate on it');
    assert.equal(r.label, 'Water meter reading');
    assert.equal(r.entity, 'Apartament Zorilor');
    assert.equal(r.date, today());
    assert.equal(r.days_left, 0);
    assert.equal(r.property_id, prop.id, 'so tapping it lands where the reading is recorded');
  });

  await t.test('and it goes on ageing rather than being noted once and forgotten', async () => {
    backdateRequest(api, req.id, 9);
    const [r] = await meterReminders(api);
    assert.equal(r.days_left, -9);
  });

  await t.test('the moment the reading arrives, it stops being a reminder', async () => {
    const invite = (await api.post(`/api/properties/${prop.id}/tenant/invite`)).body.invite_code;
    // the tenant gets their own session: registering through the shared client would replace the
    // owner's, and then there would be nobody left who can ask whether the reminder is gone
    const sent = await asTenant(api, invite, `/api/tenant/meter/${req.id}`, { reading: '01234' });
    assert.equal(sent.status, 200, sent.text);
    assert.deepEqual(await meterReminders(api), [], 'the owner has nothing left to chase');
  });
});

test('each utility is chased on its own, because they are read on their own', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Casa' })).body;
  for (const u of ['water', 'gas', 'electricity']) {
    await api.post(`/api/properties/${prop.id}/meter-request`, { utility: u });
  }
  const labels = (await meterReminders(api)).map((r) => r.label).sort();
  assert.deepEqual(labels, ['Electricity meter reading', 'Gas meter reading', 'Water meter reading']);

  await t.test('deleting a request drops its reminder and leaves the others', async () => {
    const reqs = (await api.get(`/api/properties/${prop.id}/meter-requests`)).body;
    const gas = reqs.find((r) => r.utility === 'gas');
    await api.del(`/api/properties/${prop.id}/meter-requests/${gas.id}`);
    const left = (await meterReminders(api)).map((r) => r.label).sort();
    assert.deepEqual(left, ['Electricity meter reading', 'Water meter reading']);
  });
});

test('the owner is alerted about it, and the alert keeps counting while it is unanswered', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Apartament' })).body;
  const req = (await api.post(`/api/properties/${prop.id}/meter-request`, { utility: 'gas' })).body;

  const alerts = async () => (await api.get('/api/notifications')).body.items || (await api.get('/api/notifications')).body;
  const gasAlert = async () => {
    const list = await alerts();
    return (Array.isArray(list) ? list : []).find((a) => /gas meter reading/i.test(`${a.title} ${a.body}`));
  };

  await t.test('due today reads as due today', async () => {
    const a = await gasAlert();
    assert.ok(a, 'a meter reading nobody sent is worth a notification, like an unpaid charge is');
    assert.match(a.title, /today/i);
  });

  await t.test('a week later it reads as late, with the count in it', async () => {
    backdateRequest(api, req.id, 7);
    const a = await gasAlert();
    assert.match(a.title, /overdue/i);
    assert.match(a.body, /7 days ago/);
  });

  await t.test('and it is gone once the request is no longer pending', async () => {
    await api.del(`/api/properties/${prop.id}/meter-requests/${req.id}`);
    assert.equal(await gasAlert(), undefined, 'a solved item must not linger in the bell');
  });
});

test('one chase email a week after the ask — not a daily drip', async (t) => {
  const api = await startServer({ MAIL_FROM: 'hub@test.ro', MAIL_DEBUG: '1', CRON_TOKEN: 'tok' });
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Apartament' })).body;
  const req = (await api.post(`/api/properties/${prop.id}/meter-request`, { utility: 'water' })).body;

  const mailsMentioningTheReading = () =>
    api.log().split('MAIL_DEBUG:').slice(1).filter((m) => /meter reading|contor/i.test(m)).length;

  await t.test('three days in, nothing is emailed — the bell is enough', async () => {
    backdateRequest(api, req.id, 3);
    const before = mailsMentioningTheReading();
    await api.get('/api/cron/email-reminders?token=tok');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(mailsMentioningTheReading(), before);
  });

  await t.test('at a week it is emailed once', async () => {
    backdateRequest(api, req.id, 8);
    const before = mailsMentioningTheReading();
    await api.get('/api/cron/email-reminders?token=tok');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(mailsMentioningTheReading(), before + 1);
  });

  await t.test('and running the cron again does not send it a second time', async () => {
    const before = mailsMentioningTheReading();
    backdateRequest(api, req.id, 12);
    await api.get('/api/cron/email-reminders?token=tok');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(mailsMentioningTheReading(), before, 'the claim key holds, so nobody gets nagged daily');
  });
});

test('a date already past is described as past, in both languages', async (t) => {
  const api = await startServer({ MAIL_FROM: 'hub@test.ro', MAIL_DEBUG: '1', CRON_TOKEN: 'tok' });
  t.after(() => api.stop());
  await api.post('/api/settings', { lang: 'ro' });
  const prop = (await api.post('/api/properties', { name: 'Apartament' })).body;
  const req = (await api.post(`/api/properties/${prop.id}/meter-request`, { utility: 'water' })).body;
  backdateRequest(api, req.id, 9);
  await api.get('/api/cron/email-reminders?token=tok');
  await new Promise((r) => setTimeout(r, 600));

  const mail = api.log().split('MAIL_DEBUG:').slice(1).find((m) => /contor/i.test(m));
  assert.ok(mail, 'the Romanian reader gets the Romanian label');
  assert.match(mail, /Citire contor apă/, 'the deadline name is translated like every other one');
  assert.ok(!/în -\d/.test(mail), '"în -9 zile" is not a sentence');
  assert.match(mail, /acum 9 zile/, 'a past date has to read as the past');
});

test('meter reminders belong to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  const prop = (await mine.post('/api/properties', { name: 'Apartament' })).body;
  await mine.post(`/api/properties/${prop.id}/meter-request`, { utility: 'water' });
  assert.equal((await meterReminders(theirs)).length, 0);
});
