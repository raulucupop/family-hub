/* The whole path: a forwarded email arrives, becomes a draft nobody has agreed to yet, raises a
   notification saying how much, and only turns into a bill when a person accepts it. The draft step
   is the feature, not a formality — a From header can be forged by anyone, and an amount read wrong
   and posted silently would be worse than having no feature at all. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer, today, plusDays } = require('./helpers');

const CRLF = '\r\n';
const mime = ({ from, subject, text, html, pdf }) => {
  if (!html && !pdf) {
    return [
      `From: ${from}`, `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8', '', text,
    ].join(CRLF);
  }
  const b = 'bnd42';
  const parts = [
    [`From: ${from}`, `Subject: ${subject}`, `Content-Type: multipart/mixed; boundary="${b}"`, '', ''].join(CRLF),
  ];
  if (text) parts.push([`--${b}`, 'Content-Type: text/plain; charset=utf-8', '', text, ''].join(CRLF));
  if (html) parts.push([`--${b}`, 'Content-Type: text/html; charset=utf-8', '', html, ''].join(CRLF));
  if (pdf) {
    parts.push([`--${b}`, 'Content-Type: application/pdf; name="factura.pdf"',
      'Content-Disposition: attachment; filename="factura.pdf"',
      'Content-Transfer-Encoding: base64', '', Buffer.from(pdf).toString('base64'), ''].join(CRLF));
  }
  parts.push(`--${b}--`);
  return parts.join('');
};

async function postMail(api, url, raw) {
  const res = await fetch(`http://127.0.0.1:${api.port}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'message/rfc822' }, body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('a forwarded E.ON invoice becomes a draft, not a bill', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/settings', { lang: 'ro' });
  const inbound = new URL((await api.post('/api/mail/token')).body.url).pathname;

  const r = await postMail(api, inbound, mime({
    from: 'E.ON Myline <noreply.myline@eon-romania.ro>',
    subject: 'Factura ta E.ON a fost emisă',
    text: 'Număr factură: 10834704992\r\nRest de plată: 57,22 lei\r\nData scadentă: 15.09.2026',
  }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.provider, 'eon');
  assert.equal(r.body.amount, 57.22);

  await t.test('it is waiting, and no bill exists yet', async () => {
    const drafts = (await api.get('/api/mail-drafts')).body;
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].amount, 57.22);
    assert.equal(drafts[0].due_date, '2026-09-15');
    assert.deepEqual((await api.get('/api/bills')).body, [], 'nothing is owed until somebody says so');
  });

  await t.test('the notification leads with how much', async () => {
    const { items } = (await api.get('/api/notifications')).body;
    const n = items.find((x) => /Factură nouă/.test(x.title));
    assert.ok(n, 'a new invoice is worth telling somebody about');
    assert.match(n.title, /57\.22 RON/, 'the amount is the question it answers');
    assert.match(n.body, /15\/09\/2026|confirmă/);
  });

  await t.test('accepting it creates the bill and clears the draft', async () => {
    const id = (await api.get('/api/mail-drafts')).body[0].id;
    const bill = (await api.post(`/api/mail-drafts/${id}/accept`, {})).body;
    assert.equal(bill.amount, 57.22);
    assert.equal(bill.due_date, '2026-09-15');
    assert.equal(bill.category, 'gas');
    assert.match(bill.notes, /10834704992/, 'the invoice number is kept with the bill');
    assert.deepEqual((await api.get('/api/mail-drafts')).body, []);
    assert.equal((await api.get('/api/bills')).body.length, 1);
  });

  await t.test('and the alert goes with it', async () => {
    const { items } = (await api.get('/api/notifications')).body;
    assert.ok(!items.some((x) => /Factură nouă/.test(x.title)), 'a settled draft must not linger in the bell');
  });
});

test('what the parser read can be corrected on the way in', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const inbound = new URL((await api.post('/api/mail/token')).body.url).pathname;
  await postMail(api, inbound, mime({
    from: 'noreply@notifications.orange.ro', subject: 'Factura ta Orange a fost emisa',
    text: 'Valoarea totala de plata este: 230.82 lei, o poti plati pana pe 21 August',
  }));
  const d = (await api.get('/api/mail-drafts')).body[0];
  assert.equal(d.amount, 230.82);

  const bill = (await api.post(`/api/mail-drafts/${d.id}/accept`, {
    amount: 245.9, due_date: plusDays(10), category: 'internet',
  })).body;
  assert.equal(bill.amount, 245.9, 'the person had the invoice in front of them; the parser did not');
  assert.equal(bill.due_date, plusDays(10));
  assert.equal(bill.category, 'internet');
});

test('an unreadable mail still reaches a person, with its PDF', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const inbound = new URL((await api.post('/api/mail/token')).body.url).pathname;
  const r = await postMail(api, inbound, mime({
    from: 'facturi@furnizor-nou.ro', subject: 'Factura august',
    html: '<html><body><p>Detaliile sunt în documentul atașat.</p></body></html>',
    pdf: '%PDF-1.4 pretend invoice',
  }));
  assert.equal(r.status, 200);

  const d = (await api.get('/api/mail-drafts')).body[0];
  assert.equal(d.amount, null, 'no number invented out of a mail that has none');
  assert.ok(d.attachment, 'the PDF is what the person will read the amount off');
  assert.match(d.snippet, /documentul atașat/, 'the html was turned into readable text');

  await t.test('the attachment is downloadable', async () => {
    const res = await api.get(`/api/mail-drafts/${d.id}/attachment`);
    assert.equal(res.status, 200);
  });

  await t.test('accepting without an amount is refused, not guessed', async () => {
    const bad = await api.post(`/api/mail-drafts/${d.id}/accept`, {});
    assert.equal(bad.status, 400, bad.text);
  });

  await t.test('rejecting it deletes the PDF too', async () => {
    await api.post(`/api/mail-drafts/${d.id}/reject`, {});
    assert.deepEqual((await api.get('/api/mail-drafts')).body, []);
    assert.equal((await api.get(`/api/mail-drafts/${d.id}/attachment`)).status, 404);
  });
});

test('the inbound address is off until asked for, and revocable', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.get('/api/mail/info')).body.url, null);

  const first = new URL((await api.post('/api/mail/token')).body.url).pathname;
  assert.equal((await postMail(api, first, mime({ from: 'a@b.ro', subject: 'x', text: 'Total de plată: 10 lei' }))).status, 200);

  const second = new URL((await api.post('/api/mail/token')).body.url).pathname;
  assert.notEqual(second, first);
  assert.equal((await postMail(api, first, mime({ from: 'a@b.ro', subject: 'x', text: 'y' }))).status, 404,
    'the old address has to stop working the moment a new one is made');
  assert.equal((await postMail(api, second, mime({ from: 'a@b.ro', subject: 'x', text: 'Total de plată: 10 lei' }))).status, 200);
});

test('a forged sender can do no more than put a draft in front of somebody', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const inbound = new URL((await api.post('/api/mail/token')).body.url).pathname;
  // anyone can write this From header; the point is what it can achieve
  await postMail(api, inbound, mime({
    from: 'E.ON Myline <noreply.myline@eon-romania.ro>',
    subject: 'Factura ta E.ON a fost emisă',
    text: 'Rest de plată: 9999,00 lei',
  }));
  assert.deepEqual((await api.get('/api/bills')).body, [], 'a forged mail cannot create money owed');
  assert.equal((await api.get('/api/mail-drafts')).body.length, 1, 'only a suggestion a person can decline');
});

test('drafts belong to one family', async (t) => {
  const mine = await startServer();
  const theirs = await startServer();
  t.after(() => Promise.all([mine.stop(), theirs.stop()]));
  const inbound = new URL((await mine.post('/api/mail/token')).body.url).pathname;
  await postMail(mine, inbound, mime({ from: 'a@b.ro', subject: 'x', text: 'Total de plată: 10 lei' }));
  assert.deepEqual((await theirs.get('/api/mail-drafts')).body, []);
});
