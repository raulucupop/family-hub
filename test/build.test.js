/* The build in public/dist is what phones run, so it must be the build of the app.js in the repo —
   committed together, every time — and the split must not have lost or doubled a function. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const { plan, sourceHash } = require('../scripts/build');
const { startServer } = require('./helpers');

const PUB = path.join(__dirname, '..', 'public');
const src = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'dist', 'manifest.json'), 'utf8'));
const topFns = (code) => acorn.parse(code, { ecmaVersion: 'latest' }).body.filter((s) => s.type === 'FunctionDeclaration').map((s) => s.id.name);

test('public/dist was built from this app.js (run: npm run build)', () => {
  assert.equal(manifest.source, sourceHash(src));
});

test('every function of app.js is in exactly one built file, and every lazy page knows where it lives', () => {
  const where = new Map();
  for (const f of [manifest.core, ...Object.values(manifest.chunks)]) {
    for (const name of topFns(fs.readFileSync(path.join(PUB, 'dist', f), 'utf8'))) {
      assert.ok(!where.has(name), `${name} is in both ${where.get(name)} and ${f}`);
      where.set(name, f);
    }
  }
  for (const name of topFns(src)) assert.ok(where.has(name), `${name} went missing from the build`);

  const p = plan(src);
  for (const [page, chunks] of Object.entries(manifest.pages)) {
    const entry = p.entries[page];
    assert.ok(chunks.map((c) => manifest.chunks[c]).includes(where.get(entry)), `${page} loads ${chunks} but ${entry} is in ${where.get(entry)}`);
  }
});

test('page files only declare functions, so loading one runs nothing', () => {
  for (const f of Object.values(manifest.chunks)) {
    const body = acorn.parse(fs.readFileSync(path.join(PUB, 'dist', f), 'utf8'), { ecmaVersion: 'latest' }).body;
    assert.ok(body.every((s) => s.type === 'FunctionDeclaration'), `${f} has top-level code`);
  }
});

test('the core never names a function that lives in a page file', () => {
  const p = plan(src);
  const moved = new Set(p.chunkOf.keys());
  for (const name of p.core) {
    for (const st of p.ast.body) {
      if (st.type === 'FunctionDeclaration' && st.id.name === name) {
        const body = src.slice(st.start, st.end);
        for (const m of moved) assert.ok(!new RegExp(`\\b${m}\\s*\\(`).test(body), `${name} (core) calls ${m} (page file)`);
      }
    }
  }
});

test('the server hands out the build, and the service worker caches it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const base = `http://127.0.0.1:${api.port}`;
  const html = await (await fetch(base + '/')).text();
  assert.ok(html.includes(`<script src="/dist/${manifest.core}"></script>`));
  assert.ok(!html.includes('/app.js'));
  assert.ok(!html.includes('fonts.googleapis.com'), 'fonts come from this site');
  const core = await fetch(`${base}/dist/${manifest.core}`);
  assert.equal(core.status, 200);
  assert.match(core.headers.get('cache-control') || '', /immutable/);
  const sw = await (await fetch(base + '/sw.js')).text();
  assert.ok(sw.includes(`'/dist/${manifest.core}'`) && !sw.includes("'/app.js'"));
  assert.match(sw, new RegExp(`const CACHE = 'fh-${manifest.source.slice(0, 10)}'`));
  const font = await fetch(base + '/fonts/public-sans-latin.woff2');
  assert.equal(font.status, 200);
});
