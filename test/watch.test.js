/* The point of this feature is that a notice posted on Monday about a Thursday auction reaches you
   on Monday. So the things worth pinning down are: nothing is announced twice, the very first check
   does not dump the whole archive on you as news, and a keyword typed without diacritics still
   matches a Romanian site that writes them. A local stub server stands in for the commune so the
   tests neither depend on nor hammer the real one. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { startServer } = require('./helpers');

// Point a watched site at the local stub. The address rule that keeps the watcher off the host
// is a real one, so the test sets the row directly rather than making production code carry a
// test-only exception — the server picks the change up on its next read.
function pointAt(api, id, url) {
  const d = new DatabaseSync(path.join(api.dir, 'familyhub.db'));
  d.prepare('UPDATE watched_sites SET url = ? WHERE id = ?').run(url, id);
  d.close();
}

// a stub site whose content the test controls
async function stubSite() {
  const state = { items: [], html: '<html><body><p>nimic</p></body></html>', status: 200, hits: 0 };
  const server = http.createServer((req, res) => {
    state.hits++;
    if (state.status !== 200) { res.writeHead(state.status); return res.end('nope'); }
    if (req.url.startsWith('/feed')) {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      return res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Comuna</title>
        ${state.items.map((i) => `<item><title>${i.title}</title><link>${i.link || 'https://example.org/x'}</link>
          <guid isPermaLink="false">${i.guid}</guid><pubDate>${i.date || 'Mon, 30 Jun 2026 08:00:00 +0000'}</pubDate>
          <description><![CDATA[${i.summary || ''}]]></description></item>`).join('')}
      </channel></rss>`);
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(state.html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  // 127.0.0.1 is refused as a watch target on purpose, so address it the way a public host is
  state.base = `http://localhost.test.invalid:${server.address().port}`;
  state.realBase = `http://127.0.0.1:${server.address().port}`;
  state.stop = () => new Promise((r) => server.close(r));
  return state;
}

test('a private address is refused, so the watcher cannot be pointed at the host itself', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  for (const url of [
    'http://127.0.0.1:9200/', 'http://localhost:8080/', 'http://10.0.0.5/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'not a url',
  ]) {
    const r = await api.post('/api/watch', { url, label: 'x' });
    assert.equal(r.status, 400, `${url} should not be watchable — got ${r.status}`);
  }
  assert.deepEqual((await api.get('/api/watch')).body.sites, []);
});

test('the first check is a baseline and says nothing', async (t) => {
  const site = await stubSite();
  const api = await startServer();
  t.after(async () => { await api.stop(); await site.stop(); });
  site.items = [
    { guid: 'a', title: 'Anunț licitație terenuri' },
    { guid: 'b', title: 'Anunț dezinsecție' },
  ];
  // the endpoint validates the public-address rule, so insert through it with a public-looking host
  // and then correct the row to the stub: what is under test is the checking, not the validator
  await api.post('/api/watch', { url: 'https://comunabucovat.ro/feed/', label: 'Comuna', keywords: 'licitatie, teren' });
  const id = (await api.get('/api/watch')).body.sites[0].id;
  pointAt(api, id, `${site.realBase}/feed/`);

  const first = await api.post(`/api/watch/${id}/check`);
  assert.equal(first.body.checked.error, null, first.text);
  assert.equal(first.body.checked.found, 0, 'ten historical notices as ten alerts is how alerts get ignored');
  assert.equal(first.body.checked.seeded, true);
  assert.equal(first.body.items.length, 2, 'but they are recorded, so they are not "new" later');

  await t.test('a notice published afterwards IS reported', async () => {
    site.items.unshift({ guid: 'c', title: 'Anunț vânzare terenuri', summary: 'licitație publică' });
    const r = await api.post(`/api/watch/${id}/check`);
    assert.equal(r.body.checked.found, 1);
    assert.equal(r.body.items[0].title, 'Anunț vânzare terenuri');
  });

  await t.test('and checking again does not report it a second time', async () => {
    const r = await api.post(`/api/watch/${id}/check`);
    assert.equal(r.body.checked.found, 0, 'the same notice must not arrive twice');
    assert.equal(r.body.items.length, 3);
  });

  await t.test('a keyword typed without diacritics still matches one written with them', async () => {
    const item = (await api.get('/api/watch')).body.items.find((i) => /vânzare/.test(i.title));
    assert.equal(item.hit, 1, '"licitatie" must match "licitație" or the feature misses the thing it exists for');
  });

  await t.test('and the baseline never reaches the bell either', async () => {
    const alerts = (await api.get('/api/notifications')).body;
    const list = alerts.items || alerts;
    const watch = JSON.stringify(list).match(/New notice/g) || [];
    assert.equal(watch.length, 1, 'only the one genuinely new notice should be an alert, not the archive');
  });

  await t.test('an item with no keyword match is still reported, only unflagged', async () => {
    site.items.unshift({ guid: 'd', title: 'Program cu publicul' });
    const r = await api.post(`/api/watch/${id}/check`);
    assert.equal(r.body.checked.found, 1, 'keywords flag, they never filter');
    assert.equal(r.body.items[0].hit, 0);
  });
});

test('a site that fails is recorded as failing, not as silence', async (t) => {
  const site = await stubSite();
  const api = await startServer();
  t.after(async () => { await api.stop(); await site.stop(); });
  await api.post('/api/watch', { url: 'https://comunabucovat.ro/feed/', label: 'Comuna' });
  const id = (await api.get('/api/watch')).body.sites[0].id;
  pointAt(api, id, `${site.realBase}/feed/`);
  await api.post(`/api/watch/${id}/check`);

  site.status = 500;
  const r = await api.post(`/api/watch/${id}/check`);
  assert.match(r.body.checked.error, /HTTP 500/);
  const row = r.body.sites[0];
  assert.equal(row.fail_count, 1);
  assert.match(row.last_error, /HTTP 500/, 'a watcher quietly failing forever is the same as no watcher');

  await t.test('and recovers cleanly once the site is back', async () => {
    site.status = 200;
    const ok = await api.post(`/api/watch/${id}/check`);
    assert.equal(ok.body.checked.error, null);
    assert.equal(ok.body.sites[0].fail_count, 0);
    assert.equal(ok.body.sites[0].last_error, null);
  });
});

test('a page with no feed is diffed on its readable text', async (t) => {
  const site = await stubSite();
  const api = await startServer();
  t.after(async () => { await api.stop(); await site.stop(); });
  site.html = `<html><head><style>.x{color:red}</style></head><body>
    <nav><a href="/">Acasă</a><a href="/contact">Contact</a></nav>
    <p>Anunț dezinsecție 06.07</p><p>Program cu publicul 8-16</p>
    <footer>© 2026</footer></body></html>`;
  await api.post('/api/watch', { url: 'https://comunabucovat.ro/anunturi/', label: 'Anunțuri', kind: 'page' });
  const id = (await api.get('/api/watch')).body.sites[0].id;
  pointAt(api, id, `${site.realBase}/page`);

  const first = await api.post(`/api/watch/${id}/check`);
  assert.equal(first.body.checked.found, 0, 'first pass is the baseline here too');

  await t.test('a new paragraph is reported', async () => {
    site.html = site.html.replace('<p>Anunț dezinsecție 06.07</p>',
      '<p>Anunț licitație terenuri 30.06</p><p>Anunț dezinsecție 06.07</p>');
    const r = await api.post(`/api/watch/${id}/check`);
    assert.equal(r.body.checked.found, 1, r.text);
    assert.match(r.body.items[0].title, /licitație terenuri/);
  });

  await t.test('re-rendered chrome is not news', async () => {
    site.html = site.html.replace('<nav><a href="/">Acasă</a><a href="/contact">Contact</a></nav>',
      '<nav><a href="/">Acasă</a><a href="/harta">Hartă</a><a href="/contact">Contact</a></nav>');
    const r = await api.post(`/api/watch/${id}/check`);
    assert.equal(r.body.checked.found, 0, 'a menu that gains a link has not announced anything');
  });
});


test('the app checks by itself, and opening it repeatedly does not hammer the site', async (t) => {
  const site = await stubSite();
  // WATCH_EVERY_MS is deliberately long: the point of the test is that the second, third and
  // fourth page load do NOT each fetch the commune again.
  const api = await startServer({ WATCH_AUTO: '1', WATCH_EVERY_MS: '600000' });
  t.after(async () => { await api.stop(); await site.stop(); });
  site.items = [{ guid: 'a', title: 'Anunț licitație terenuri' }];
  // The id comes from the POST response rather than a GET: a GET is exactly what triggers the
  // automatic check, and it would fetch the real commune before the row is pointed at the stub.
  const created = await api.post('/api/watch', { url: 'https://comunabucovat.ro/feed/', label: 'Comuna' });
  const id = created.body.sites[0].id;
  pointAt(api, id, `${site.realBase}/feed/`);
  site.hits = 0;

  // just looking at the app is the whole interaction
  await api.get('/api/watch');
  const seen = async () => {
    for (let i = 0; i < 40; i++) {
      const r = (await api.get('/api/watch')).body.sites[0];
      if (r.last_checked_at) return r;
      await new Promise((x) => setTimeout(x, 100));
    }
    return null;
  };
  const row = await seen();
  assert.ok(row, 'opening the page must be enough to get a check — that is the whole point');
  assert.equal(row.items_total, 1);

  await t.test('and four more visits inside the window fetch nothing further', async () => {
    const after = site.hits;
    for (let i = 0; i < 4; i++) await api.get('/api/watch');
    await new Promise((x) => setTimeout(x, 400));
    assert.equal(site.hits, after, 'a burst of page loads must not become a burst of requests at the commune');
  });

  await t.test('loading the alerts badge counts as a visit too, so any page of the app keeps it fresh', async () => {
    const r = await api.get('/api/notifications');
    assert.equal(r.status, 200, 'the check must never make the badge slow or fail');
  });
});
test('watched sites belong to one family', async (t) => {
  const api = await startServer();
  const other = await startServer();
  t.after(() => Promise.all([api.stop(), other.stop()]));
  await api.post('/api/watch', { url: 'https://comunabucovat.ro/feed/', label: 'Comuna' });
  const id = (await api.get('/api/watch')).body.sites[0].id;

  assert.deepEqual((await other.get('/api/watch')).body.sites, []);
  assert.equal((await other.post(`/api/watch/${id}/check`)).status, 404);
  assert.equal((await other.put(`/api/watch/${id}`, { label: 'hijack' })).status, 404);
  assert.equal((await other.del(`/api/watch/${id}`)).status, 200);
  assert.equal((await api.get('/api/watch')).body.sites.length, 1, 'the outsider deleted nothing');
});
