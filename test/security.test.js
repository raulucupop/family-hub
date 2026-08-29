/* Findings from a pass over the whole app, each pinned by a test so it cannot come back quietly.
   Every one of these was reachable by an ordinary signed-in member — the interesting attacker here
   is not a stranger on the internet but somebody who already has an account. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, today } = require('./helpers');

const uploadCount = (api) => {
  const dir = path.join(api.dir, 'uploads');
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};
// a tiny but real PNG, so multer's own filter is not what rejects it
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
async function postFile(api, url, filename = 'x.png') {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), filename);
  const res = await fetch(`http://127.0.0.1:${api.port}${url}`, {
    method: 'POST', headers: { Cookie: api.cookie() }, body: form,
  });
  return { status: res.status, text: await res.text() };
}

test('a file the server then refuses does not stay on the disk', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  await t.test('a rejected upload leaves nothing behind', async () => {
    const before = uploadCount(api);
    const r = await postFile(api, '/api/bills/999999/attachment');
    assert.equal(r.status, 404, r.text);
    assert.equal(uploadCount(api), before,
      'multer writes before the handler runs, so a refused request used to leave the bytes orphaned');
  });

  await t.test('and repeating it does not accumulate', async () => {
    const before = uploadCount(api);
    for (let i = 0; i < 5; i++) await postFile(api, '/api/documents/999999/attachment');
    assert.equal(uploadCount(api), before, 'this is how a signed-in member fills a shared disk');
  });

  await t.test('an accepted upload is of course kept', async () => {
    const bill = (await api.post('/api/bills', {
      name: 'Enel', category: 'electricity', amount: 100, due_date: today(),
    })).body;
    const before = uploadCount(api);
    const r = await postFile(api, `/api/bills/${bill.id}/attachment`);
    assert.equal(r.status, 200, r.text);
    assert.equal(uploadCount(api), before + 1);
  });
});

test('a member of another household cannot be named on your money', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  // Registering a second family over HTTP is refused: this app is one household per installation,
  // which is why the gap was latent rather than reachable. The schema is family-scoped throughout
  // though, and the check belongs with the fifteen others that already do it — so the second
  // household is made directly, and the rule is proved rather than assumed.
  const d = new DatabaseSync(path.join(api.dir, 'familyhub.db'));
  d.prepare("INSERT INTO families (name, invite_code) VALUES (?,?)").run("Altii", "invite-two");
  const otherFam = d.prepare("SELECT id FROM families WHERE name = ?").get("Altii").id;
  d.prepare("INSERT INTO users (family_id, name, email, role) VALUES (?,?,?,?)")
    .run(otherFam, "Strain", "strain@test.ro", "adult");
  const stranger = d.prepare("SELECT id FROM users WHERE email = ?").get("strain@test.ro");
  d.close();

  const bad = await api.post('/api/incomes', {
    source: 'Salariu', amount: 5000, date: today(), user_id: stranger.id,
  });
  assert.equal(bad.status, 400, bad.text);
  assert.match(bad.body.error, /member of the family/i);

  await t.test('editing one afterwards is refused the same way', async () => {
    const ok = (await api.post('/api/incomes', { source: 'Salariu', amount: 5000, date: today() })).body;
    const bad2 = await api.put(`/api/incomes/${ok.id}`, { user_id: stranger.id });
    assert.equal(bad2.status, 400, bad2.text);
  });

  await t.test('a member of your own family is still fine', async () => {
    const me = (await api.get('/api/family/members')).body[0];
    const ok = await api.post('/api/incomes', { source: 'Bonus', amount: 100, date: today(), user_id: me.id });
    assert.equal(ok.status, 200, ok.text);
  });
});

test('a payment link put in front of the tenant has to be a web address', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', { name: 'Apartament' })).body;

  for (const link of ['javascript:fetch("/api/family")', 'data:text/html,<script>1</script>', 'ftp://x/y']) {
    const bad = await api.put(`/api/properties/${prop.id}`, { name: 'Apartament', payment_link: link });
    assert.equal(bad.status, 400, `${link} was accepted: ${bad.text}`);
  }

  await t.test('a real one goes through', async () => {
    const ok = await api.put(`/api/properties/${prop.id}`, {
      name: 'Apartament', payment_link: 'https://revolut.me/raul',
    });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.payment_link, 'https://revolut.me/raul');
  });
});

test('both cron routes check the token the same way', async (t) => {
  const api = await startServer({ CRON_TOKEN: 'sekrit-token-value' });
  t.after(() => api.stop());
  for (const url of ['/api/cron/watch', '/api/cron/email-reminders']) {
    assert.equal((await api.get(`${url}?token=wrong`)).status, 403, url);
    assert.equal((await api.get(`${url}?token=`)).status, 403, url);
    // a prefix of the real token must not be treated as the real token
    assert.equal((await api.get(`${url}?token=sekrit`)).status, 403, url);
  }
  assert.equal((await api.get('/api/cron/watch?token=sekrit-token-value')).status, 200);
});

test('the page never asks the browser to run someone else\'s script', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const res = await fetch(`http://127.0.0.1:${api.port}/`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'the app must send a content security policy');
  assert.match(csp, /script-src 'self'(;|$)/, 'no third-party origin may supply executable code');

  await t.test('and the chart library is served from here', async () => {
    const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(!/cdn\.jsdelivr|unpkg\.com|cdnjs/.test(app), 'a CDN script is a third party who can change what runs');
    const lib = await fetch(`http://127.0.0.1:${api.port}/vendor/chart.umd.min.js`);
    assert.equal(lib.status, 200, 'and the local copy has to actually be served');
  });
});

test('the feed only offers links that are somewhere to go', async () => {
  // the client-side guard, checked against the same source the browser runs
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /const safeHref = /, 'links from outside feeds need a scheme check, not just escaping');
  assert.ok(!/href="\$\{esc\(i\.link\)\}"/.test(app), 'the raw feed link must not reach an anchor');
  assert.match(app, /safeHref\(data\.property\.payment_link\)/, 'nor an owner-typed payment link');
});
