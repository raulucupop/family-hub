/* What the browser downloads, built from public/app.js.

   app.js stays the one file the app is written in. This splits it by page and minifies it, so a
   phone opening the dashboard fetches the dashboard, not the bank-import parser and the seating
   plan. Run it after changing app.js:  npm run build   — the output in public/dist is committed,
   because the server only pulls and restarts; it never builds.

   How the split is decided, so that it cannot break the app:
   - Every top-level statement that is not a function declaration runs when the script loads, so it
     and every function it can reach stay in the core file.
   - The route table is the one exception: its views are entry points, not calls. A view nothing
     else in the core reaches is replaced there by a stub that loads its file first.
   - A function reached from one page only goes into that page's file; from several, into a
     shared file. Anything nobody reaches stays in the core, in case it is called in a way the
     analysis cannot see.
   The page files hold nothing but function declarations, so loading them runs no code — they only
   make names available — and the order they arrive in does not matter.

   The server serves the build only while public/dist/manifest.json says it was made from the
   app.js on disk; edit app.js without rebuilding and it falls back to app.js as it is. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const acorn = require('acorn');
const walk = require('acorn-walk');
const { minify } = require('terser');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'app.js');
const OUT = path.join(ROOT, 'public', 'dist');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// app.js's fingerprint, the same whichever line endings git checked it out with (CRLF on Windows)
const sourceHash = (s) => sha(s.replace(/\r\n/g, '\n'));

function plan(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const fns = new Map();
  for (const st of ast.body) if (st.type === 'FunctionDeclaration') fns.set(st.id.name, st);

  // the route table: { page: viewFunction, … }
  let routesNode = null;
  for (const st of ast.body) {
    if (st.type !== 'VariableDeclaration') continue;
    for (const d of st.declarations) if (d.id.name === 'routes' && d.init?.type === 'ObjectExpression') routesNode = d.init;
  }
  if (!routesNode) throw new Error('no `const routes = { … }` table in app.js');
  const routeValues = new Set();
  const entries = {};
  for (const p of routesNode.properties) {
    if (p.value.type !== 'Identifier' || !fns.has(p.value.name)) throw new Error(`route ${p.key.name || p.key.value} is not a function name`);
    routeValues.add(p.value);
    entries[p.key.name || p.key.value] = p.value.name;
  }

  // the top-level functions a piece of code names, as calls or as values (over-counting is safe)
  const refs = (node) => {
    const out = new Set();
    walk.fullAncestor(node, (n, _s, anc) => {
      if (n.type !== 'Identifier' || !fns.has(n.name) || routeValues.has(n)) return;
      const p = anc[anc.length - 2];
      if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
      if (p && (p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed && !p.shorthand) return;
      if (p && p.type === 'FunctionDeclaration' && p.id === n) return;
      out.add(n.name);
    });
    return out;
  };
  const refsOf = new Map([...fns].map(([name, node]) => [name, refs(node)]));
  const closure = (seed, within) => {
    const seen = new Set();
    const todo = [...seed];
    while (todo.length) {
      const f = todo.pop();
      if (seen.has(f) || (within && !within(f))) continue;
      seen.add(f);
      for (const g of refsOf.get(f) || []) todo.push(g);
    }
    return seen;
  };

  const seeds = new Set();
  for (const st of ast.body) if (st.type !== 'FunctionDeclaration') for (const f of refs(st)) seeds.add(f);
  const core = closure(seeds);

  const reach = {};
  for (const [page, fn] of Object.entries(entries)) if (!core.has(fn)) reach[page] = closure([fn], (f) => !core.has(f));
  const chunkOf = new Map();
  for (const name of fns.keys()) {
    if (core.has(name)) continue;
    const owners = Object.keys(reach).filter((p) => reach[p].has(name));
    if (owners.length === 0) core.add(name); // reached by nothing the analysis can see: keep it loaded
    else chunkOf.set(name, owners.length === 1 ? owners[0] : 'shared');
  }
  const pageChunks = {};
  for (const page of Object.keys(reach)) {
    const used = new Set([...reach[page]].map((f) => chunkOf.get(f)).filter(Boolean));
    pageChunks[page] = [...used].sort((a, b) => (a === 'shared' ? -1 : b === 'shared' ? 1 : a.localeCompare(b)));
  }
  return { ast, fns, entries, routesNode, core, chunkOf, pageChunks };
}

async function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const p = plan(src);

  // the page files: the moved functions, in the order app.js has them
  const chunkSrc = {};
  for (const [name, node] of p.fns) {
    const c = p.chunkOf.get(name);
    if (c) chunkSrc[c] = (chunkSrc[c] || '') + src.slice(node.start, node.end) + '\n';
  }
  const terserOpts = { ecma: 2020, compress: { toplevel: false, passes: 2 }, mangle: { toplevel: false }, format: { comments: false } };
  const files = {};
  const write = (base, code) => {
    const file = `${base}.${sha(code).slice(0, 10)}.js`;
    fs.writeFileSync(path.join(OUT, file), code);
    return file;
  };
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [c, code] of Object.entries(chunkSrc)) files[c] = write(c, (await minify(code, terserOpts)).code);

  // the core: app.js without the moved functions, its route table pointing lazy views at their files
  const edits = [];
  for (const [name, node] of p.fns) if (p.chunkOf.has(name)) edits.push([node.start, node.end, '']);
  for (const prop of p.routesNode.properties) {
    const page = prop.key.name || prop.key.value;
    if (p.pageChunks[page]) edits.push([prop.value.start, prop.value.end, `__lazyView(${JSON.stringify(prop.value.name)}, ${JSON.stringify(p.pageChunks[page])})`]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  let core = src;
  for (const [a, b, text] of edits) core = core.slice(0, a) + text + core.slice(b);
  const loader = `
const __CHUNK = ${JSON.stringify(Object.fromEntries(Object.entries(files).map(([c, f]) => [c, '/dist/' + f])))};
const __chunkLoad = {};
function __loadChunk(c) {
  return __chunkLoad[c] || (__chunkLoad[c] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = __CHUNK[c];
    s.onload = resolve;
    s.onerror = () => { delete __chunkLoad[c]; reject(new Error(document.documentElement.lang === 'ro' ? 'Pagina nu s-a putut încărca. Verifică internetul și apasă Reîncearcă.' : 'This page could not be loaded. Check the connection and press Retry.')); };
    document.head.appendChild(s);
  }));
}
function __lazyView(name, chunks) {
  return (...args) => Promise.all(chunks.map(__loadChunk)).then(() => window[name](...args));
}
// once the first page is up and the browser is idle, fetch the rest quietly, so the next tap is instant
(window.requestIdleCallback || ((f) => setTimeout(f, 2000)))(() => Object.keys(__CHUNK).forEach((c) => __loadChunk(c).catch(() => {})));
`;
  files.core = write('core', (await minify(loader + core, terserOpts)).code);

  const manifest = {
    source: sourceHash(src),
    core: files.core,
    chunks: Object.fromEntries(Object.entries(files).filter(([c]) => c !== 'core')),
    pages: p.pageChunks,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
  const gz = (f) => (require('node:zlib').gzipSync(fs.readFileSync(path.join(OUT, f))).length / 1024).toFixed(1);
  console.log(`app.js ${(src.length / 1024).toFixed(1)} KB → core ${kb(files.core)} KB (${gz(files.core)} KB gzip)`);
  for (const [c, f] of Object.entries(manifest.chunks)) console.log(`  ${c.padEnd(10)} ${kb(f)} KB (${gz(f)} KB gzip)`);
  return manifest;
}

module.exports = { plan, sha, sourceHash };
if (require.main === module) build().catch((err) => { console.error(err); process.exit(1); });
