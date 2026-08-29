/* Boots a real server against a throwaway database and hands back a logged-in client.
   Going through HTTP rather than reaching into the module is deliberate: the bugs this suite exists
   to catch were in validation and in what actually gets written, not in arithmetic in isolation. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Ask the OS for a free port and hand it straight to the child. A random number in a range looks
// equivalent but is not: test files run in parallel, and two of them drawing the same number meant
// the second one talked to the first one's server — which surfaced as a mystifying "email already
// exists" from register, in whichever unlucky test happened to lose the race.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-test-'));
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: dir, PORT: String(port), SESSION_SECRET: 'test-secret', NODE_ENV: 'test', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (proc.exitCode != null) throw new Error(`server exited (${proc.exitCode}):\n${log}`);
    try {
      const r = await fetch(base + '/', { signal: AbortSignal.timeout(800) });
      if (r.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server never came up on ${port}:\n${log}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() || [];
    // keep every cookie the server hands back, not just the first — the session is one of several
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* HTML error page */ }
    return { status: res.status, body: json, text };
  };

  const client = {
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b ?? {}),
    put: (u, b) => call('PUT', u, b),
    patch: (u, b) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
    stop: () => new Promise((res) => { proc.once('exit', res); proc.kill(); }),
    dir, port, log: () => log,
    // for the few tests that must send a multipart body, which call() does not build
    cookie: () => cookie,
  };

  const reg = await client.post('/api/auth/register', {
    familyName: 'Test', name: 'Raul', email: `t${port}@test.ro`, password: 'Parola12345',
  });
  // a 409 here would mean we reached someone else's server: this database was created empty seconds
  // ago, so nothing in it can already hold that address
  if (reg.status === 409) throw new Error(`port ${port} is serving another instance — got: ${reg.text}`);
  if (reg.status !== 200) throw new Error(`register failed: ${reg.status} ${reg.text}`);
  return client;
}

// the local date the server would call "today", so tests line up with its own clock
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n, from = today()) => {
  const d = new Date(from + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

module.exports = { startServer, today, plusDays };
