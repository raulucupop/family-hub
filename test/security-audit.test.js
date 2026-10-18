/* Findings from the October 2026 security audit, each pinned so it cannot quietly come back. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers');

// node's fetch will not let a caller choose the Host header; a raw request does, which is exactly
// what a forger would send
function rawPost(port, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: url, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('a reset link points at the site, whatever Host the request claimed', async (t) => {
  const api = await startServer({ MAIL_FROM: 'hub@test.ro', MAIL_DEBUG: '1', APP_URL: 'https://hub.example' });
  t.after(() => api.stop());
  const r = await rawPost(api.port, '/api/auth/forgot', { email: `t${api.port}@test.ro` }, { Host: 'evil.example' });
  assert.equal(r.status, 200, r.text);
  let mail = '';
  for (let i = 0; i < 40 && !mail; i++) {
    mail = api.log().split('MAIL_DEBUG:').slice(1).find((m) => m.includes('#reset=')) || '';
    if (!mail) await new Promise((res) => setTimeout(res, 50));
  }
  assert.ok(mail, 'the reset mail was sent');
  assert.ok(!mail.includes('evil.example'), 'a forged Host must never become the link in a genuine email');
  assert.match(mail, /https:\/\/hub\.example\/#reset=[0-9a-f]{64}/);
});

test('the session cookie is Secure on an HTTPS request even when NODE_ENV is not production', async (t) => {
  const api = await startServer(); // the helper runs NODE_ENV=test
  t.after(() => api.stop());
  const login = (headers) => rawPost(api.port, '/api/auth/login', { email: `t${api.port}@test.ro`, password: 'Parola12345' }, headers);
  const viaHttps = await login({ 'X-Forwarded-Proto': 'https' });
  assert.equal(viaHttps.status, 200, viaHttps.text);
  assert.match(String(viaHttps.headers['set-cookie']), /;\s*Secure/i, 'behind the HTTPS proxy the cookie must not travel over plain http');
  const plain = await login({});
  assert.doesNotMatch(String(plain.headers['set-cookie']), /;\s*Secure/i, 'local plain-http development still signs in');
});

test('drafts are per account and leave with the person who signs out', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /fh_draft:\$\{ME\?\.id \?\? 0\}/, 'the draft key carries the account');
  const logouts = app.match(/api\('\/auth\/logout', \{ method: 'POST' \}\);[^\n]*/g) || [];
  assert.ok(logouts.length >= 2, 'both the family and the tenant sign-out are covered');
  for (const l of logouts) assert.match(l, /clearDrafts\(\)/, 'a shared device must not show the next person what the last one half-typed');
});

test('no native confirm() is left: every destructive question names its subject', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /[^.\w]confirm\(/, 'window.confirm cannot name the thing or style the destructive verb');
});
