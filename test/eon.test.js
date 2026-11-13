/* E.ON Myline against a stand-in for api2.eon.ro. The stand-in answers the way the real API does —
   the HMAC "verify" on login, 6054 when a second factor is needed, invoices in dd.mm.yyyy — so what
   is tested is the whole round trip: sign in, list, turn invoices into bills, and see a payment
   made at E.ON close the bill here. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { startServer, plusDays } = require('./helpers');
const { verifyHmac, isoDate, toPay } = require('../lib/eon-myline');

const EMAIL = 'raul@example.ro';
const ro = (iso) => iso.split('-').reverse().join('.');

function fakeEon({ mfa = false } = {}) {
  const state = {
    mfa, logins: 0, mfaCodes: [],
    invoices: [{ invoiceNumber: '10834704992', issuedValue: 57.22, balanceValue: 57.22, maturityDate: ro(plusDays(10)), emissionDate: ro(plusDays(-5)) }],
  };
  const token = 'tok-ok';
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/users/v1/userauth/mobile-login') {
        state.logins++;
        if (req.headers['x-client-source'] !== 'mylineWeb') return send(400, { code: '6075' });
        if (body.username !== EMAIL || body.password !== 'secret' || body.verify !== verifyHmac(EMAIL)) return send(400, { code: '6101' });
        if (state.mfa) return send(400, { code: '6054', description: 'mfa-uuid', secondFactorType: 'EMAIL', secondFactorRecipient: 'r***@example.ro' });
        return send(200, { access_token: token, refresh_token: 'ref', expires_in: 3600 });
      }
      if (url.pathname === '/users/v1/second-factor-auth/mobile-login') {
        state.mfaCodes.push(body.code);
        if (body.uuid !== 'mfa-uuid' || body.code !== '123456') return send(400, { code: '6055' });
        state.mfa = false;
        return send(200, { access_token: token, refresh_token: 'ref', expires_in: 3600 });
      }
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, {});
      if (url.pathname === '/partners/v2/account-contracts/list') return send(200, [{ accountContract: '002100000001', utilityType: '02' }]);
      if (url.pathname === '/invoices/v1/invoices/list') {
        assert.equal(url.searchParams.get('status'), 'unpaid');
        return send(200, state.invoices);
      }
      send(404, {});
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ state, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

const env = (base) => ({ EON_API_BASE: base, EON_EMAIL: EMAIL, EON_PASSWORD: 'secret' });

test('the pieces E.ON gets wrong in its own way', () => {
  assert.equal(isoDate('5.11.2026'), '2026-11-05');
  assert.equal(isoDate('2026-11-05T00:00:00'), '2026-11-05');
  assert.equal(isoDate('soon'), null);
  assert.equal(toPay({ issuedValue: 100, balanceValue: 100 }), 100, 'nothing paid yet: the whole invoice');
  assert.equal(toPay({ issuedValue: 100, balanceValue: 40.5 }), 40.5, 'partly paid: what is left');
});

test('without an account on the server the feature is invisible', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.deepEqual((await api.get('/api/eon')).body, { configured: false });
  assert.equal((await api.post('/api/eon/sync')).status, 404);
});

test('unpaid E.ON invoices become bills, and leave when paid at E.ON', async (t) => {
  const fake = await fakeEon();
  const api = await startServer(env(fake.base));
  t.after(() => { api.stop(); fake.close(); });

  const st = (await api.get('/api/eon')).body;
  assert.equal(st.configured, true);
  assert.equal(st.account, 'r***@example.ro', 'the card names the account without spelling it out');
  assert.ok(!JSON.stringify(st).includes('secret'));

  await t.test('the first sync adds the invoice as a bill with an alert', async () => {
    const r = (await api.post('/api/eon/sync')).body;
    assert.equal(r.result.ok, true, JSON.stringify(r));
    assert.equal(r.result.created, 1);
    const bills = (await api.get('/api/bills')).body;
    assert.equal(bills.length, 1);
    assert.equal(bills[0].name, 'E.ON gaz');
    assert.equal(bills[0].category, 'gas');
    assert.equal(bills[0].amount, 57.22);
    assert.equal(bills[0].due_date, plusDays(10));
    assert.equal(bills[0].status, 'unpaid');
    assert.equal(bills[0].ext_ref, 'eon:10834704992');
    assert.ok(bills[0].remind_days > 0, 'an unpaid invoice is worth a buzz before it is due');
    assert.equal(r.state.unpaid, 1);
  });

  await t.test('syncing again changes nothing', async () => {
    const r = (await api.post('/api/eon/sync')).body.result;
    assert.deepEqual([r.created, r.updated, r.paid], [0, 0, 0]);
    assert.equal((await api.get('/api/bills')).body.length, 1);
    assert.equal(fake.state.logins, 1, 'the saved session is reused, not a new sign-in every time');
  });

  await t.test('a part payment brings the amount down', async () => {
    fake.state.invoices[0].balanceValue = 20;
    const r = (await api.post('/api/eon/sync')).body.result;
    assert.equal(r.updated, 1);
    assert.equal((await api.get('/api/bills')).body[0].amount, 20);
  });

  await t.test('gone from the unpaid list: marked paid, with the payment logged', async () => {
    fake.state.invoices = [];
    const r = (await api.post('/api/eon/sync')).body.result;
    assert.equal(r.paid, 1);
    const bill = (await api.get('/api/bills')).body[0];
    assert.equal(bill.status, 'paid');
    const pays = (await api.get(`/api/bills/${bill.id}/payments`)).body;
    assert.equal(pays.length, 1);
    assert.equal(pays[0].amount, 20);
  });

  await t.test('a bill somebody marked paid is not reopened while E.ON catches up', async () => {
    fake.state.invoices = [{ invoiceNumber: '555', issuedValue: 80, balanceValue: 80, maturityDate: ro(plusDays(3)) }];
    await api.post('/api/eon/sync');
    const bill = (await api.get('/api/bills')).body.find((b) => b.ext_ref === 'eon:555');
    assert.equal((await api.post(`/api/bills/${bill.id}/pay`, {})).status, 200);
    await api.post('/api/eon/sync'); // E.ON still lists it for a day or two
    const again = (await api.get('/api/bills')).body.find((b) => b.ext_ref === 'eon:555');
    assert.equal(again.status, 'paid');
    fake.state.invoices = [];
    await api.post('/api/eon/sync');
    const pays = (await api.get(`/api/bills/${bill.id}/payments`)).body;
    assert.equal(pays.length, 1, 'paid once here, not a second time when E.ON sees it');
  });

  await t.test('bills nobody synced are never touched', async () => {
    const mine = (await api.post('/api/bills', { name: 'Digi', category: 'internet', amount: 50, due_date: plusDays(5) })).body;
    await api.post('/api/eon/sync');
    assert.equal((await api.get('/api/bills')).body.find((b) => b.id === mine.id).status, 'unpaid');
  });

  await t.test('an invoice already accepted from a forwarded email is adopted, not added twice', async () => {
    // what accepting an E.ON email draft writes
    const fromMail = (await api.post('/api/bills', { name: 'E.ON', provider: 'eon', category: 'gas', amount: 99, due_date: plusDays(8), notes: 'Factura 777' })).body;
    fake.state.invoices = [{ invoiceNumber: '777', issuedValue: 99, balanceValue: 99, maturityDate: ro(plusDays(8)) }];
    const r = (await api.post('/api/eon/sync')).body.result;
    assert.equal(r.created, 0);
    const bills = (await api.get('/api/bills')).body.filter((b) => /777/.test(b.notes || ''));
    assert.equal(bills.length, 1);
    assert.equal(bills[0].id, fromMail.id);
    assert.equal(bills[0].ext_ref, 'eon:777');
  });
});

test('two-factor: the code is asked for once, then the session carries on', async (t) => {
  const fake = await fakeEon({ mfa: true });
  const api = await startServer(env(fake.base));
  t.after(() => { api.stop(); fake.close(); });

  const first = (await api.post('/api/eon/sync')).body;
  assert.equal(first.result.mfa, true);
  assert.deepEqual(first.state.mfa, { type: 'EMAIL', recipient: 'r***@example.ro' });
  assert.equal((await api.get('/api/bills')).body.length, 0);

  assert.equal((await api.post('/api/eon/mfa', { code: 'abc' })).status, 400);
  const wrong = await api.post('/api/eon/mfa', { code: '000000' });
  assert.equal(wrong.status, 400);

  const ok = (await api.post('/api/eon/mfa', { code: '123 456' })).body;
  assert.equal(ok.result.ok, true, JSON.stringify(ok));
  assert.equal(ok.state.mfa, null);
  assert.equal((await api.get('/api/bills')).body.length, 1);

  const logins = fake.state.logins;
  await api.post('/api/eon/sync');
  assert.equal(fake.state.logins, logins, 'no new sign-in, so no new code in the inbox');
});

test('a wrong password is reported, not retried into a lockout', async (t) => {
  const fake = await fakeEon();
  const api = await startServer({ ...env(fake.base), EON_PASSWORD: 'nope' });
  t.after(() => { api.stop(); fake.close(); });
  const r = (await api.post('/api/eon/sync')).body;
  assert.match(r.result.error, /parola/);
  assert.match(r.state.last_error, /parola/);
  assert.equal(fake.state.logins, 1);
});
