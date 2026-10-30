/* Talking to E.ON Myline: the same private API the E.ON mobile app uses, at api2.eon.ro.
   There is no public API and no documentation. What is here was worked out from the app's own
   traffic, so it can break the day E.ON ships a new app. Everything that may need changing is kept
   in this file and can be overridden from the environment without touching code.

   Login is email + password, with a "verify" field that is an HMAC-MD5 of the email under a key
   baked into the app. If the account has two-factor turned on, E.ON answers with code 6054 and
   sends a one-time code by email or SMS. A person has to type that code into Settings once; after
   that the refresh token keeps the session alive without asking again. */
const crypto = require('node:crypto');

const ENV = process.env;
const BASE = () => (ENV.EON_API_BASE || 'https://api2.eon.ro').replace(/\/+$/, '');
// the keys the Myline app ships with, mobile and web. Public in the sense that every copy of the
// app carries them; overridable because E.ON can rotate them.
const SUB_KEY_MOBILE = () => ENV.EON_SUBSCRIPTION_KEY || 'e43698af63d84daa9763bbef7918378f';
const SUB_KEY_WEB = () => ENV.EON_SUBSCRIPTION_KEY_WEB || '674e9032df9d456fa371e17a4097a5b8';
const VERIFY_SECRET = () => ENV.EON_VERIFY_SECRET || 'zrAnQjN0bDjlTsKYmbpexjaBNY6wrCzuIqGWNgqoaJzlLrYiqd';
const TIMEOUT_MS = 30000;

const CODE_MFA = '6054'; // second factor required: a code was just sent
const CODE_BAD_HEADER = '6075'; // the mobile flow was refused for its headers: try the web flow
const CODE_BAD_CREDENTIALS = '6101';

const headers = (flow) => (flow === 'web'
  ? {
    Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': SUB_KEY_WEB(), Origin: 'https://www.eon.ro', Referer: 'https://www.eon.ro/myline/login',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'x-client-source': 'mylineWeb',
  }
  : {
    Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': SUB_KEY_MOBILE(), 'User-Agent': 'EON Myline/Android',
    // refused without it since 09.2026 (400 / 6075 "Missing or invalid header")
    'x-client-source': 'mylineWeb',
  });

const verifyHmac = (email) => crypto.createHmac('md5', VERIFY_SECRET()).update(email).digest('hex');

async function call(method, path, { flow = 'mobile', body, token } = {}) {
  const h = headers(flow);
  if (token) h.Authorization = `${token.token_type || 'Bearer'} ${token.access_token}`;
  let res;
  try {
    res = await fetch(BASE() + path, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { status: 0, data: null, error: `E.ON nu răspunde (${err.name === 'TimeoutError' ? 'timeout' : err.message})` };
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { status: res.status, data };
}

// the token answer comes in snake_case from the mobile flow and camelCase from the web one, and
// the web refresh does not repeat the refresh token — keep the old one when it is missing
function sessionFrom(data, flow, prev = {}) {
  const access = data?.access_token || data?.accessToken || data?.token;
  if (!access) return null;
  const ttl = Number(data.expires_in || data.expiresIn) || 3600;
  return {
    flow,
    access_token: access,
    token_type: data.token_type || data.tokenType || 'Bearer',
    refresh_token: data.refresh_token || data.refreshToken || prev.refresh_token || null,
    expires_at: Date.now() + ttl * 1000,
  };
}

/* Sign in with the password. Resolves to one of:
     { session }                      signed in
     { mfa: { uuid, type, recipient, flow } }   a code was sent; finish with completeMfa
     { error, badCredentials? }       refused */
async function login(email, password) {
  for (const flow of ['mobile', 'web']) {
    const body = flow === 'mobile'
      ? { username: email, password, verify: verifyHmac(email) }
      : { username: email, password, rememberMe: true };
    const r = await call('POST', flow === 'mobile' ? '/users/v1/userauth/mobile-login' : '/users/v1/userauth/login', { flow, body });
    if (r.error) return { error: r.error };
    if (r.status === 200) {
      const session = sessionFrom(r.data, flow);
      if (session) return { session };
    }
    const code = String(r.data?.code || '');
    if (r.status === 400 && code === CODE_MFA) {
      return {
        mfa: {
          uuid: r.data.description, // yes, the session id for the second factor travels in "description"
          type: r.data.secondFactorType || 'EMAIL',
          recipient: r.data.secondFactorRecipient || '',
          flow,
        },
      };
    }
    if (r.status === 400 && code === CODE_BAD_HEADER && flow === 'mobile') continue;
    if (r.status === 400 && code === CODE_BAD_CREDENTIALS) return { error: 'E.ON a refuzat emailul sau parola', badCredentials: true };
    return { error: `Autentificare E.ON eșuată (HTTP ${r.status}${code ? `, cod ${code}` : ''})` };
  }
  return { error: 'Autentificare E.ON eșuată' };
}

async function completeMfa(mfa, code) {
  const web = mfa.flow === 'web';
  const r = await call('POST', web ? '/users/v1/second-factor-auth/login' : '/users/v1/second-factor-auth/mobile-login', {
    flow: mfa.flow,
    body: web ? { uuid: mfa.uuid, code } : { uuid: mfa.uuid, code, interval: null, type: null },
  });
  if (r.error) return { error: r.error };
  const session = r.status === 200 ? sessionFrom(r.data, mfa.flow) : null;
  return session ? { session } : { error: 'Codul nu a fost acceptat de E.ON — poate a expirat; cere unul nou' };
}

async function refresh(session) {
  const web = session.flow === 'web';
  if (!web && !session.refresh_token) return null;
  const r = await call('POST', web ? '/users/v1/userauth/refresh-token' : '/users/v1/userauth/mobile-refresh-token', {
    flow: session.flow,
    body: web ? { token: session.access_token } : { refreshToken: session.refresh_token },
  });
  return r.status === 200 ? sessionFrom(r.data, session.flow, session) : null;
}

/* A signed-in client. `session` is whatever was saved last time (or null); `save` is called with
   every new session so it outlives a restart, and `onMfa` when E.ON asks for a code. */
function client({ email, password, session, save = () => {}, onMfa = () => {} }) {
  let s = session || null;
  const use = (next) => { s = next; save(next); return next; };

  async function ensure(force = false) {
    if (s && !force && s.expires_at - Date.now() > 5 * 60 * 1000) return { ok: true };
    if (s) {
      const r = await refresh(s);
      if (r) { use(r); return { ok: true }; }
    }
    const l = await login(email, password);
    if (l.session) { use(l.session); return { ok: true }; }
    if (l.mfa) { onMfa(l.mfa); return { mfa: l.mfa }; }
    return l;
  }

  async function get(path) {
    let a = await ensure();
    if (!a.ok) return { ...a, data: null };
    let r = await call('GET', path, { flow: s.flow, token: s });
    if (r.status === 401) {
      a = await ensure(true);
      if (!a.ok) return { ...a, data: null };
      r = await call('GET', path, { flow: s.flow, token: s });
    }
    if (r.error) return { error: r.error, data: null };
    if (r.status !== 200) return { error: `E.ON a răspuns HTTP ${r.status} la ${path.split('?')[0]}`, data: null };
    return { data: r.data };
  }

  return { get, ensure };
}

// "15.11.2026" -> "2026-11-15"; anything else -> null
function isoDate(raw) {
  const m = String(raw || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(raw || '')) ? String(raw).slice(0, 10) : null;
}

// what is still to pay on one invoice: the issued value when nothing was paid yet, else the balance
function toPay(inv) {
  const issued = Number(inv.issuedValue) || 0;
  const balance = Number(inv.balanceValue) || 0;
  return Math.round((issued === balance ? issued : balance) * 100) / 100;
}

const UTILITY = { '01': 'electricity', '02': 'gas' }; // '00' is a DUO contract: gas and power together

/* Every unpaid invoice on every contract of the account. Resolves to
   { invoices: [...] } or { error } / { mfa } — never a partial list: a contract that failed to load
   would otherwise read as "paid", and the caller marks bills paid from what is missing here. */
async function unpaidInvoices(c) {
  const contracts = await c.get('/partners/v2/account-contracts/list');
  if (contracts.error || contracts.mfa) return contracts;
  const list = Array.isArray(contracts.data) ? contracts.data : [];
  const out = [];
  const seen = new Set();
  for (const k of list) {
    const ac = String(k?.accountContract || '').trim();
    if (!ac || seen.has(ac)) continue;
    seen.add(ac);
    const r = await c.get(`/invoices/v1/invoices/list?accountContract=${encodeURIComponent(ac)}&status=unpaid`);
    if (r.error || r.mfa) return r;
    for (const inv of Array.isArray(r.data) ? r.data : []) {
      const amount = toPay(inv);
      const no = String(inv?.invoiceNumber || '').trim();
      if (!no || !(amount > 0)) continue;
      out.push({
        invoice_no: no,
        account_contract: ac,
        category: UTILITY[String(k.utilityType || '')] || 'electricity',
        amount,
        due_date: isoDate(inv.maturityDate),
        issued_date: isoDate(inv.emissionDate),
      });
    }
  }
  return { invoices: out, contracts: seen.size };
}

module.exports = { login, completeMfa, refresh, client, unpaidInvoices, isoDate, toPay, verifyHmac };
