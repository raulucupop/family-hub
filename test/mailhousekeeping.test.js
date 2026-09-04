/* An inbox forwarded into this app is a firehose pointed at a shared disk, and the person who set
   the forwarding rule is not the person who notices it filled up. These are the limits that make a
   too-wide rule survivable: a cap on how many drafts may wait, a sweep of the ones nobody read, and
   the promise that until then a draft keeps the PDF its amount is written on. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer } = require('./helpers');

const CRLF = '\r\n';
const plain = (subject, text) => [
  'From: facturi@furnizor.ro', `Subject: ${subject}`,
  'Content-Type: text/plain; charset=utf-8', '', text,
].join(CRLF);
const withPdf = (subject) => {
  const b = 'bnd42';
  return [
    ['From: facturi@furnizor.ro', `Subject: ${subject}`,
      `Content-Type: multipart/mixed; boundary="${b}"`, '', ''].join(CRLF),
    [`--${b}`, 'Content-Type: text/plain; charset=utf-8', '', 'Suma e in documentul atasat.', ''].join(CRLF),
    [`--${b}`, 'Content-Type: application/pdf; name="factura.pdf"',
      'Content-Disposition: attachment; filename="factura.pdf"',
      'Content-Transfer-Encoding: base64', '',
      Buffer.from('%PDF-1.4 pretend invoice').toString('base64'), ''].join(CRLF),
    `--${b}--`,
  ].join('');
};

async function postMail(api, url, raw) {
  const res = await fetch(`http://127.0.0.1:${api.port}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'message/rfc822' }, body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const inboundOf = async (api) => new URL((await api.post('/api/mail/token')).body.url).pathname;

test('a flood of mail cannot fill the disk one draft at a time', async (t) => {
  const api = await startServer({ MAX_PENDING_DRAFTS: '3' });
  t.after(() => api.stop());
  const inbound = await inboundOf(api);

  for (let i = 0; i < 3; i++) {
    assert.equal((await postMail(api, inbound, plain(`Factura ${i}`, 'Total de plată: 10 lei'))).status, 200);
  }
  const over = await postMail(api, inbound, plain('Una in plus', 'Total de plată: 10 lei'));

  assert.equal(over.status, 200, 'anything but 200 makes Exim bounce the mail back to the supplier');
  assert.equal(over.body.ok, false);
  assert.match(String(over.body.skipped), /too many/i);
  assert.equal((await api.get('/api/mail-drafts')).body.length, 3, 'the cap holds');

  await t.test('and clearing the queue lets mail through again', async () => {
    const id = (await api.get('/api/mail-drafts')).body[0].id;
    await api.post(`/api/mail-drafts/${id}/reject`, {});
    const again = await postMail(api, inbound, plain('Dupa golire', 'Total de plată: 10 lei'));
    assert.equal(again.body.ok, true, 'the cap counts what is waiting, not what has ever arrived');
  });
});

test('drafts nobody got to are swept, and their PDFs go with them', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const inbound = await inboundOf(api);
  await postMail(api, inbound, withPdf('Factura veche'));
  await postMail(api, inbound, withPdf('Factura de azi'));

  const drafts = (await api.get('/api/mail-drafts')).body;
  assert.equal(drafts.length, 2);
  const old = drafts.find((d) => d.subject === 'Factura veche');
  const oldFile = path.join(api.dir, 'uploads', old.attachment);
  assert.ok(fs.existsSync(oldFile));

  // age one of them past the retention window, and age both PDFs past the orphan sweep's grace
  const d = new DatabaseSync(path.join(api.dir, 'familyhub.db'));
  d.prepare("UPDATE mail_drafts SET received_at = datetime('now', '-200 days') WHERE id = ?").run(old.id);
  d.close();
  const longAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  for (const f of fs.readdirSync(path.join(api.dir, 'uploads'))) {
    fs.utimesSync(path.join(api.dir, 'uploads', f), longAgo, longAgo);
  }

  assert.equal((await api.get('/api/cron/email-reminders')).status, 200);

  const left = (await api.get('/api/mail-drafts')).body;
  assert.deepEqual(left.map((x) => x.subject), ['Factura de azi'], 'only the stale one goes');
  assert.ok(!fs.existsSync(oldFile), 'its PDF must not outlive the row that pointed at it');

  await t.test('a draft still waiting keeps the PDF its amount is written on', async () => {
    // the orphan sweep did not know about mail_drafts, so a draft older than a day lost the one
    // attachment a person would have opened it to read
    const kept = left[0];
    assert.ok(fs.existsSync(path.join(api.dir, 'uploads', kept.attachment)));
    assert.equal((await api.get(`/api/mail-drafts/${kept.id}/attachment`)).status, 200);
  });
});

test('the excerpt keeps enough of the mail to be worth reading', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const inbound = await inboundOf(api);
  // a real forwarding-confirmation link runs well past 400 characters from the top of the body
  const link = `https://mail-settings.google.com/mail/vf-%5B${'A1b2C3d4'.repeat(12)}%5D-${'x'.repeat(40)}`;
  await postMail(api, inbound, plain('Confirmare', `${'Detalii despre factura ta. '.repeat(14)}\r\n${link}\r\nCod de confirmare: 123456789`));

  const d = (await api.get('/api/mail-drafts')).body[0];
  assert.ok(d.snippet.includes(link), 'a link cut in half is a link nobody can use');
  assert.match(d.snippet, /Cod de confirmare: 123456789/);
});
