const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// JWT secret: from env, or generated once and persisted so restarts don't log everyone out.
const secretFile = path.join(DATA_DIR, '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
}

// behind the host's proxy (Passenger, nginx…) redirect plain http to https —
// the login cookie is Secure in production, so http sessions would silently fail
app.set('trust proxy', 1);
if (process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// ---------- security headers (securityheaders.com findings) ----------
app.disable('x-powered-by'); // no reason to advertise Express + its version
// The CSP is strict for scripts: only our own files and the Chart.js CDN — no inline scripts,
// which is why sw registration lives in app.js and no template uses inline event handlers.
// Styles allow 'unsafe-inline' because the UI sets style attributes throughout; that is the
// low-risk half of inline (no code runs from a style).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');            // legacy twin of frame-ancestors
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Cross-origin isolation trio:
  // - COOP severs window.opener ties with cross-origin pages (e.g. the Revolut tab a tenant opens)
  // - CORP stops other origins embedding our responses (avatars, scans) as their subresources;
  //   Google/Apple Calendar fetch the .ics server-side, which browser-enforced CORP does not touch
  // - COEP 'credentialless' rather than 'require-corp': the CDN/font requests are then made
  //   cookie-less and allowed, so Chart.js and Google Fonts keep loading; require-corp would
  //   depend on every third party sending CORP headers
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  // HSTS only over TLS — a browser ignores it on plain http anyway
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const COOKIE = 'fh_token';
function signToken(user) {
  // tv pins the token to the account's current password: bump token_version and every token
  // issued before it stops verifying, which is what signs other devices out on a password change
  return jwt.sign({ uid: user.id, fid: user.family_id, role: user.role, tv: user.token_version ?? 0 }, JWT_SECRET, { expiresIn: '30d' });
}
function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

// ---------- brute-force throttle on sign-in ----------
// Counted per account *and* per IP: the account key stops a botnet spread across IPs, the IP key
// stops one attacker spraying many accounts. `trust proxy` is on, so req.ip is the real client.
// The IP allowance is deliberately much looser: a whole household shares one home IP, and one
// person fumbling their password must never lock everyone else out.
// In-memory on purpose — a single small instance, and a restart clearing it is not worth a table.
// fe/fi are the forgot-password limits: unlike login these count every request, not just
// failures — the endpoint's only work is sending an email, and 3 reset mails per address per
// window is plenty for a human while stopping anyone from flooding an inbox.
// rc/re: registration. A join code is only 32 bits and lives until someone rotates it, so an
// unthrottled register endpoint is a slow but real way to guess your way into a family — and the
// e-mail-already-exists answer tells a stranger which addresses have accounts. The IP allowance is
// loose on purpose: a household shares one address, and 20 tries per 10 minutes still leaves
// guessing a 32-bit code somewhere north of a million years.
const LOGIN_LIMITS = { em: 8, ip: 30, fe: 3, fi: 10, rc: 20, re: 6 }; // allowance inside the window, by key type
const LOGIN_WINDOW = 10 * 60 * 1000;    // ...before the lock kicks in
const LOGIN_LOCK = 10 * 60 * 1000;      // how long the lock lasts
const loginFails = new Map(); // key -> { n, first, until }
const loginKeys = (req, email) => [`ip:${req.ip}`, `em:${email}`];
const forgotKeys = (req, email) => [`fi:${req.ip}`, `fe:${email}`]; // separate keys: reset requests never lock the login
const registerKeys = (req, email) => [`rc:${req.ip}`, `re:${email}`]; // ...and neither do sign-ups
function loginLockedFor(keys) {
  const now = Date.now();
  let until = 0;
  for (const k of keys) { const r = loginFails.get(k); if (r?.until > now) until = Math.max(until, r.until); }
  return until ? Math.ceil((until - now) / 60000) : 0; // minutes left, 0 = not locked
}
function loginFailed(keys) {
  const now = Date.now();
  for (const k of keys) {
    let r = loginFails.get(k);
    if (!r || now - r.first > LOGIN_WINDOW) r = { n: 0, first: now, until: 0 };
    r.n += 1;
    if (r.n >= LOGIN_LIMITS[k.slice(0, 2)]) { r.until = now + LOGIN_LOCK; r.n = 0; r.first = now; }
    loginFails.set(k, r);
  }
}
function loginSucceeded(keys) { for (const k of keys) loginFails.delete(k); }
// keep the map from growing forever on a long-lived process
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of loginFails) if (now - r.first > LOGIN_WINDOW && !(r.until > now)) loginFails.delete(k);
}, LOGIN_WINDOW).unref();
function auth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, family_id, name, email, role, tenant_property_id, avatar, theme, lang, birthday, phone, notif_muted, quiet_start, quiet_end, token_version FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    // the password changed since this token was handed out — that session is over
    if ((payload.tv ?? 0) !== user.token_version) return res.status(401).json({ error: 'Password changed — sign in again' });
    // tenants only ever see their own charges — never the family's data.
    // they may also manage their own profile: settings (name/lang/birthday/phone) and their own avatar.
    const tenantAllowed = req.path === '/api/me' || req.path.startsWith('/api/tenant')
      || req.path === '/api/settings' || req.path === '/api/auth/change-password'
      || req.path === `/api/users/${user.id}/avatar`;
    if (user.role === 'tenant' && !tenantAllowed) {
      return res.status(403).json({ error: 'Tenant accounts can only access their own charges' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, sign in again' });
  }
}
// children are read-only; adults can write; admins can also manage the family
function canWrite(req, res, next) {
  if (req.user.role === 'child') return res.status(403).json({ error: 'View-only account' });
  next();
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const str = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// a positive money value with an upper bound: two 1e308 entries otherwise overflow a SUM to
// Infinity and blank the whole dashboard. A billion is far above any household figure.
const MONEY_MAX = 1e9;
const okAmount = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= MONEY_MAX; };
function inviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// A day-of-month setting means "that day where the month has one, otherwise the last day": the 31st
// is the 31st in January and the 28th in February. Same rule addMonths() uses for recurring bills,
// so there is no reason to cap the setting itself at 28.
function monthDate(period, day) {
  const [y, m] = String(period).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(Math.round(Number(day)) || 1, 1), last);
  return `${period}-${String(d).padStart(2, '0')}`;
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// ---------- auth ----------
app.post('/api/auth/register', async (req, res) => {
  const { familyName, name, email, password, inviteCode: code, tenantCode } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const emailNorm = String(email).trim().toLowerCase();
  // Throttled before the account lookup, so this cannot be used to walk a list of addresses and
  // learn which ones exist, nor to grind through join codes.
  const keys = registerKeys(req, emailNorm);
  const lockedFor = loginLockedFor(keys);
  if (lockedFor) return res.status(429).json({ error: `Too many attempts — try again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}` });
  loginFailed(keys); // every attempt counts; a successful one clears it at the end
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  let familyId, role, tenantPropertyId = null;
  // one register code: a family invite joins as adult, a landlord's tenant code joins as tenant
  const anyCode = str(req.body.code) || str(code) || str(tenantCode);
  if (anyCode) {
    const norm = anyCode.toUpperCase();
    const fam = db.prepare('SELECT id FROM families WHERE invite_code = ?').get(norm);
    if (fam) {
      familyId = fam.id;
      role = 'adult'; // admin can demote to child afterwards
    } else {
      const prop = db.prepare('SELECT * FROM properties WHERE tenant_invite_code = ?').get(norm);
      if (!prop) return res.status(400).json({ error: 'Code not recognized — ask your family admin or landlord for a fresh one' });
      familyId = prop.family_id;
      role = 'tenant';
      tenantPropertyId = prop.id;
    }
  } else {
    // creating a family is only possible on a fresh, empty installation
    if (db.prepare('SELECT COUNT(*) AS c FROM families').get().c > 0) {
      return res.status(400).json({ error: 'Registration needs an invite code' });
    }
    if (!familyName) return res.status(400).json({ error: 'Family name is required to create a family' });
    const info = db.prepare('INSERT INTO families (name, invite_code) VALUES (?, ?)').run(String(familyName).trim(), inviteCode());
    familyId = info.lastInsertRowid;
    role = 'admin';
  }
  // Hash only now that the request is known good, and async: bcrypt is deliberately slow, so
  // hashing before validating let a stranger spend ~200ms of this single-threaded process per
  // request on nothing — and hashSync blocks the loop, freezing the app for everyone else.
  const hash = await bcrypt.hash(String(password), 10);
  const info = db.prepare('INSERT INTO users (family_id, name, email, password_hash, role, tenant_property_id) VALUES (?,?,?,?,?,?)')
    .run(familyId, String(name).trim(), emailNorm, hash, role, tenantPropertyId);
  const user = db.prepare('SELECT id, family_id, name, email, role, token_version FROM users WHERE id = ?').get(info.lastInsertRowid);
  loginSucceeded(keys); // a real sign-up clears the allowance it just consumed
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const keys = loginKeys(req, email);
  const lockedFor = loginLockedFor(keys);
  if (lockedFor) return res.status(429).json({ error: `Too many attempts — try again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}` });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // async compare: bcrypt is deliberately slow, and the sync form would block the single
  // Node thread for every other request while it runs
  const ok = !!user && !!user.password_hash && await bcrypt.compare(String(req.body?.password || ''), user.password_hash);
  if (!ok) {
    loginFailed(keys);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  loginSucceeded(keys);
  setAuthCookie(res, signToken(user));
  res.json({ user: { id: user.id, family_id: user.family_id, name: user.name, email: user.email, role: user.role } });
});

// the sign-in screen only offers "New family" while the installation is empty
app.get('/api/auth/bootstrap', (req, res) => {
  res.json({ setup: db.prepare('SELECT COUNT(*) AS c FROM families').get().c === 0 });
});

// ---------- password reset ----------
app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  // throttled BEFORE any lookup or send: without this, anyone who knows an address can flood
  // that inbox with reset mails (and grow password_resets a row at a time)
  const keys = forgotKeys(req, email);
  const lockedFor = loginLockedFor(keys);
  if (lockedFor) return res.status(429).json({ error: `Too many reset requests — try again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}` });
  loginFailed(keys); // every request counts against the allowance, success or not
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.password_hash) {
    if (!process.env.MAIL_FROM) return res.status(500).json({ error: 'Email is not configured on this server — ask the admin to reset your password' });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,datetime('now','+1 hour'))")
      .run(user.id, crypto.createHash('sha256').update(token).digest('hex'));
    const base = `${req.protocol}://${req.get('host')}`;
    try {
      await sendMail([user.email], 'Family Hub — password reset',
        `Hello ${user.name},\n\nSomeone (hopefully you) asked to reset your Family Hub password.\nOpen this link to choose a new one — it works for 1 hour:\n\n${base}/#reset=${token}\n\nIf this wasn't you, just ignore this email and nothing changes.\n`,
        undefined,
        htmlEmail(`<p>Hello ${htmlEsc(user.name)},</p>
          <p>Someone (hopefully you) asked to reset your Family Hub password. Choose a new one — the link works for 1 hour:</p>
          <p>${htmlButton(`${base}/#reset=${token}`, 'Choose a new password')}</p>
          <p style="color:#45565f;font-size:13px;">If this wasn't you, just ignore this email and nothing changes.</p>`));
    } catch (err) {
      console.error('password reset email:', err.message);
      return res.status(500).json({ error: 'Could not send the email — try again in a few minutes' });
    }
  }
  // same answer whether the email exists or not
  res.json({ ok: true });
});
app.post('/api/auth/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')").get(hash);
  if (!row) return res.status(400).json({ error: 'This reset link is invalid or expired — request a new one' });
  // bump token_version: whoever prompted this reset (a thief with a stolen cookie, an old
  // shared laptop) is signed out everywhere. The person resetting gets a fresh token below.
  const newHash = await bcrypt.hash(String(password), 10); // async: never block the loop on bcrypt
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(newHash, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  // any other pending reset links for this account are void now too
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(row.user_id);
  const user = db.prepare('SELECT id, family_id, name, email, role, token_version FROM users WHERE id = ?').get(row.user_id);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});
// change your own password while signed in. Requires the current one, so a borrowed session
// cannot lock the real owner out of their account.
app.post('/api/auth/change-password', auth, async (req, res) => {
  const { current, next, confirm } = req.body || {};
  if (String(next || '').length < 8) return res.status(400).json({ error: 'The new password must be at least 8 characters' });
  // the client always sends confirm now, so this is a real check, not just belt-and-braces
  if (confirm !== undefined && String(confirm) !== String(next)) return res.status(400).json({ error: 'The new passwords do not match' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row?.password_hash) return res.status(400).json({ error: 'This account has no password to change' });
  if (!(await bcrypt.compare(String(current || ''), row.password_hash))) {
    return res.status(403).json({ error: 'Your current password is not right' });
  }
  const nextHash = await bcrypt.hash(String(next), 10);
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(nextHash, req.user.id);
  // everything else is signed out; keep *this* device signed in with a token on the new version
  const user = db.prepare('SELECT id, family_id, name, email, role, token_version FROM users WHERE id = ?').get(req.user.id);
  setAuthCookie(res, signToken(user));
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const family = db.prepare('SELECT id, name, invite_code, currency FROM families WHERE id = ?').get(req.user.family_id);
  if (req.user.role !== 'admin') delete family.invite_code;
  res.json({ user: req.user, family });
});

// ---------- family ----------
app.get('/api/family/members', auth, (req, res) => {
  const members = db.prepare("SELECT id, name, email, role, avatar, created_at FROM users WHERE family_id = ? AND role != 'tenant' ORDER BY created_at").all(req.user.family_id);
  res.json(members);
});
// admin adds a child by name only — no email, no login; can still be linked to acte and expenses
app.post('/api/family/members', auth, adminOnly, (req, res) => {
  const name = str(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const info = db.prepare("INSERT INTO users (family_id, name, role) VALUES (?,?,'child')").run(req.user.family_id, name);
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid));
});
app.patch('/api/family/members/:id', auth, adminOnly, (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'adult', 'child'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't change your own role" });
  if (target.role === 'tenant') return res.status(400).json({ error: 'Tenants are managed from their property' });
  if (!target.email) return res.status(400).json({ error: 'Members without a login stay children' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  res.json({ ok: true });
});
app.delete('/api/family/members/:id', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't remove yourself" });
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});
app.post('/api/family/invite/rotate', auth, adminOnly, (req, res) => {
  const code = inviteCode();
  db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').run(code, req.user.family_id);
  res.json({ invite_code: code });
});
// email an invite with the family code and a register link
app.post('/api/family/invite/email', auth, adminOnly, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!process.env.MAIL_FROM) return res.status(500).json({ error: 'Email is not configured on this server' });
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.family_id);
  const base = `${req.protocol}://${req.get('host')}`;
  try {
    await sendMail([email], `${req.user.name} invited you to ${family.name} on Family Hub`,
      `Hello,\n\n${req.user.name} invited you to join "${family.name}" on Family Hub — a shared place for the household's budget, bills, cars and property deadlines.\n\nJust open this link and pick a password:\n${base}/#register=${family.invite_code}\n\nOr go to ${base}, choose "Register" and enter the code manually: ${family.invite_code}\n\nSee you there!\n`,
      undefined,
      htmlEmail(`<p>Hello,</p>
        <p><b>${htmlEsc(req.user.name)}</b> invited you to join <b>${htmlEsc(family.name)}</b> on Family Hub — a shared place for the household's budget, bills, cars and property deadlines.</p>
        <p>${htmlButton(`${base}/#register=${family.invite_code}`, 'Join the family')}</p>
        <p style="color:#45565f;font-size:13px;">Or go to ${htmlEsc(base)}, choose "Register" and enter the code manually: <b class="amount" style="font-family:monospace;letter-spacing:.08em">${htmlEsc(family.invite_code)}</b></p>`));
    res.json({ ok: true });
  } catch (err) {
    console.error('invite email:', err.message);
    res.status(500).json({ error: 'Could not send the email — try again in a few minutes' });
  }
});
app.patch('/api/family', auth, adminOnly, (req, res) => {
  const { name, currency } = req.body || {};
  if (name) db.prepare('UPDATE families SET name = ? WHERE id = ?').run(String(name).trim(), req.user.family_id);
  if (currency) db.prepare('UPDATE families SET currency = ? WHERE id = ?').run(String(currency).trim().toUpperCase().slice(0, 4), req.user.family_id);
  res.json({ ok: true });
});

// ---------- generic CRUD factory for simple tables ----------
function crud({ route, table, fields, validate, orderBy }) {
  app.get(`/api/${route}`, auth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE family_id = ? ORDER BY ${orderBy}`).all(req.user.family_id);
    res.json(rows);
  });
  app.post(`/api/${route}`, auth, canWrite, (req, res) => {
    const err = validate(req.body || {}, req);
    if (err) return res.status(400).json({ error: err });
    if (fields.includes('user_id') && req.body.user_id == null) req.body.user_id = req.user.id;
    const cols = ['family_id', ...fields];
    const vals = [req.user.family_id, ...fields.map((f) => req.body[f] ?? null)];
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
  });
  app.put(`/api/${route}/:id`, auth, canWrite, (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND family_id = ?`).get(req.params.id, req.user.family_id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const err = validate({ ...row, ...req.body }, req);
    if (err) return res.status(400).json({ error: err });
    const sets = fields.map((f) => `${f} = ?`).join(', ');
    const vals = fields.map((f) => (req.body[f] !== undefined ? req.body[f] : row[f]));
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals, row.id);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id));
  });
  app.delete(`/api/${route}/:id`, auth, canWrite, (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ? AND family_id = ?`).run(req.params.id, req.user.family_id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
}

// expenses: custom endpoints — an expense can be linked to a property or a vehicle, which
// mirrors it into that entity's cost history so the per-property/per-car totals stay true
app.get('/api/expenses', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT e.*, p.name AS property_name, v.name AS vehicle_name FROM expenses e
    LEFT JOIN properties p ON p.id = e.property_id
    LEFT JOIN vehicles v ON v.id = e.vehicle_id
    WHERE e.family_id = ? ORDER BY e.date DESC, e.id DESC
  `).all(req.user.family_id));
});
// shared by create and edit: returns an error string, or the cleaned fields
function validateExpense(b, fid, prevPropId = null) {
  if (!b.category) return 'Category is required';
  if (!EXPENSE_CATEGORIES.includes(String(b.category))) return 'Unknown category';
  if (!okAmount(b.amount)) return 'Amount must be greater than 0';
  if (!isDate(b.date)) return 'Date must be YYYY-MM-DD';
  if (num(b.user_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.user_id), fid)) {
    return 'Person must be a member of the family';
  }
  const propId = num(b.property_id), vehId = num(b.vehicle_id);
  if (propId != null && vehId != null) return 'Link the expense to a property or a vehicle, not both';
  const prop = propId != null ? db.prepare('SELECT id, managed FROM properties WHERE id = ? AND family_id = ?').get(propId, fid) : null;
  if (propId != null && !prop) return 'Linked property not found';
  // A household expense cannot be attached to a property we only administer — that is the mixing
  // the managed flag exists to prevent. Only block *making* that link though: a property flipped to
  // managed later would otherwise freeze every expense already pointing at it, so you could not
  // even correct its amount. `prevPropId` is the link as stored, and an unchanged one is left be.
  if (prop?.managed && propId !== prevPropId) return 'That property is managed, not owned — log the cost on the property';
  if (vehId != null && !db.prepare('SELECT id FROM vehicles WHERE id = ? AND family_id = ?').get(vehId, fid)) return 'Linked vehicle not found';
  return null;
}
// Keep the property/vehicle cost-history rows that mirror an expense in step.
//
// Two link shapes exist and they must not be confused:
//  - expense-first: added on the Expenses tab, `expenses.property_id` is set and the mirror row
//    belongs to the expense — it is ours to rebuild.
//  - record-first: added on a property/vehicle card, the record owns the link and the expense it
//    created carries no *_id. That row keeps its own type and note (a "maintenance" entry must not
//    become "other", nor its note be overwritten) — we only follow the amount and date.
// `oldRow` is the expense as stored before this edit; absent on create.
function mirrorExpense(fid, eid, b, uid, oldRow) {
  const label = `${str(b.category)}${b.note ? ': ' + str(b.note) : ''}`;
  const sync = (table, key, parentCol, insert) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE expense_id = ? AND family_id = ?`).get(eid, fid);
    const oldId = oldRow ? num(oldRow[key]) : null;
    const newId = num(b[key]);
    if (existing && oldId == null) { // the entity's card owns this row — never rebuild it
      db.prepare(`UPDATE ${table} SET date = ?, amount = ? WHERE id = ?`).run(b.date, Number(b.amount), existing.id);
      return;
    }
    if (existing && oldId === newId) { // same link, just changed values
      db.prepare(`UPDATE ${table} SET date = ?, amount = ?, note = ? WHERE id = ?`).run(b.date, Number(b.amount), label, existing.id);
      return;
    }
    if (existing) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id); // link moved or cleared
    if (newId != null) insert(newId);
  };
  sync('property_records', 'property_id', 'property_id', (id) =>
    db.prepare('INSERT INTO property_records (property_id, family_id, type, date, amount, note, user_id, expense_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, fid, 'other', b.date, Number(b.amount), label, uid, eid));
  sync('vehicle_records', 'vehicle_id', 'vehicle_id', (id) =>
    db.prepare('INSERT INTO vehicle_records (vehicle_id, family_id, type, date, amount, note, expense_id) VALUES (?,?,?,?,?,?,?)')
      .run(id, fid, 'other', b.date, Number(b.amount), label, eid));
}
app.post('/api/expenses', auth, canWrite, (req, res) => {
  const b = req.body || {};
  const err = validateExpense(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const uid = num(b.user_id) ?? req.user.id;
  const eid = db.transaction(() => {
    const info = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date, property_id, vehicle_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.user.family_id, uid, str(b.category), Number(b.amount), str(b.note), b.date, num(b.property_id), num(b.vehicle_id));
    mirrorExpense(req.user.family_id, info.lastInsertRowid, b, uid);
    return info.lastInsertRowid;
  })();
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(eid));
});
app.put('/api/expenses/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  const err = validateExpense(b, req.user.family_id, num(row.property_id));
  if (err) return res.status(400).json({ error: err });
  const uid = num(b.user_id) ?? req.user.id;
  db.transaction(() => {
    mirrorExpense(req.user.family_id, row.id, b, uid, row); // `row` = the link as it was, before we overwrite it
    db.prepare('UPDATE expenses SET user_id=?, category=?, amount=?, note=?, date=?, property_id=?, vehicle_id=? WHERE id=?')
      .run(uid, str(b.category), Number(b.amount), str(b.note), b.date, num(b.property_id), num(b.vehicle_id), row.id);
  })();
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(row.id));
});
app.delete('/api/expenses/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.transaction(() => {
    db.prepare('DELETE FROM property_records WHERE expense_id = ? AND family_id = ?').run(row.id, req.user.family_id);
    db.prepare('DELETE FROM vehicle_records WHERE expense_id = ? AND family_id = ?').run(row.id, req.user.family_id);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(row.id);
  })();
  res.json({ ok: true });
});
// ---------- search ----------
// One box over everything a household actually goes looking for later ("that Digi invoice from
// March"). Family-scoped; each source capped so one noisy table cannot swamp the rest.
app.get('/api/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ results: [] });
  const fid = req.user.family_id;
  const like = `%${q}%`;
  const results = [];
  const add = (kind, tab, rows, map) => { for (const r of rows) results.push({ kind, tab, ...map(r) }); };

  add('expense', 'money', db.prepare(`
    SELECT e.id, e.date, e.note, e.category, e.amount, u.name AS who FROM expenses e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.family_id = ? AND (lower(e.note) LIKE ? OR lower(e.category) LIKE ?) ORDER BY e.date DESC LIMIT 25
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.note || r.category, sub: [r.category, r.who].filter(Boolean).join(' · '), date: r.date, amount: r.amount }));

  add('income', 'money', db.prepare(`
    SELECT i.id, i.date, i.source, i.amount, u.name AS who FROM incomes i LEFT JOIN users u ON u.id = i.user_id
    WHERE i.family_id = ? AND lower(i.source) LIKE ? ORDER BY i.date DESC LIMIT 10
  `).all(fid, like), (r) => ({ id: r.id, title: r.source, sub: r.who || '', date: r.date, amount: r.amount }));

  add('bill', 'bills', db.prepare(`
    SELECT id, name, provider, due_date, amount, status FROM bills
    WHERE family_id = ? AND (lower(name) LIKE ? OR lower(provider) LIKE ?) ORDER BY due_date DESC LIMIT 15
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.name, sub: [r.provider, r.status === 'paid' ? 'paid' : null].filter(Boolean).join(' · '), date: r.due_date, amount: r.amount }));

  add('document', 'acte', db.prepare(`
    SELECT d.id, d.name, d.number, d.expiry_date, u.name AS person, v.name AS veh, p.name AS prop FROM documents d
    LEFT JOIN users u ON u.id = d.user_id LEFT JOIN vehicles v ON v.id = d.vehicle_id LEFT JOIN properties p ON p.id = d.property_id
    WHERE d.family_id = ? AND (lower(d.name) LIKE ? OR lower(COALESCE(d.number,'')) LIKE ? OR lower(COALESCE(d.notes,'')) LIKE ?) LIMIT 15
  `).all(fid, like, like, like), (r) => ({ id: r.id, title: r.name, sub: [r.number, r.person || r.veh || r.prop].filter(Boolean).join(' · '), date: r.expiry_date }));

  add('credit', 'money', db.prepare(`
    SELECT id, name, lender FROM credits WHERE family_id = ? AND (lower(name) LIKE ? OR lower(COALESCE(lender,'')) LIKE ?) LIMIT 10
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.name, sub: r.lender || '' }));

  add('vehicle', 'vehicles', db.prepare(`
    SELECT id, name, plate FROM vehicles WHERE family_id = ? AND (lower(name) LIKE ? OR lower(COALESCE(plate,'')) LIKE ?) LIMIT 10
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.name, sub: r.plate || '' }));

  add('property', 'properties', db.prepare(`
    SELECT id, name, address FROM properties WHERE family_id = ? AND (lower(name) LIKE ? OR lower(COALESCE(address,'')) LIKE ?) LIMIT 10
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.name, sub: r.address || '' }));

  add('list', 'lists', db.prepare(`
    SELECT id, title, list, note FROM list_items WHERE family_id = ? AND (lower(title) LIKE ? OR lower(COALESCE(note,'')) LIKE ?) LIMIT 10
  `).all(fid, like, like), (r) => ({ id: r.id, title: r.title, sub: r.list }));

  // Deadlines are date FIELDS, not records — "rovinieta" used to find nothing because there is
  // no row named rovinieta. Keyword-match the field instead and answer with the stored date.
  // Titles are exactly the collectReminders labels, so the client's RO dictionary translates them.
  const qq = q.normalize('NFD').replace(/[̀-ͯ]/g, ''); // 'rovinietă' matches 'rovinieta'
  const DL = [
    ['vehicles', 'rca_expiry', 'RCA insurance', ['rca', 'asigurare', 'insurance']],
    ['vehicles', 'casco_expiry', 'Casco insurance', ['casco', 'asigurare', 'insurance']],
    ['vehicles', 'vignette_expiry', 'Rovinieta (vignette)', ['rovinieta', 'vinieta', 'vignette']],
    ['vehicles', 'itp_expiry', 'ITP inspection', ['itp', 'inspectie', 'inspection']],
    ['vehicles', 'road_tax_due', 'Vehicle tax', ['taxa', 'tax', 'impozit']],
    ['properties', 'insurance_expiry', 'Property insurance (PAD)', ['pad', 'asigurare', 'insurance']],
    ['properties', 'insurance2_expiry', 'Additional home insurance', ['asigurare', 'insurance']],
    ['properties', 'property_tax_due', 'Property tax', ['impozit', 'taxa', 'tax']],
  ];
  if (qq.length >= 3) {
    for (const [table, col, label, words] of DL) {
      if (!words.some((w) => w.includes(qq) || qq.includes(w))) continue;
      for (const r of db.prepare(`SELECT id, name, ${col} AS d FROM ${table} WHERE family_id = ? AND ${col} IS NOT NULL LIMIT 10`).all(fid)) {
        results.push({ kind: 'deadline', tab: table, id: r.id, title: label, sub: r.name, date: r.d });
      }
    }
  }

  res.json({ results });
});

// ---------- recurring expenses ----------
// the fixed monthly costs that are not a bill (no due date to chase) and not a credit.
// Logged on their day each month, through the same path as a hand-entered expense so a linked
// property/car still gets its cost-history row.
function autoLogRecurringExpenses() {
  const period = new Date().toISOString().slice(0, 7);
  const todayDay = new Date().getUTCDate();
  for (const r of db.prepare('SELECT * FROM recurring_expenses WHERE active = 1').all()) {
    const date = monthDate(period, r.day); // the 31st means the 30th in a 30-day month, not the 28th
    if (r.last_period === period || todayDay < Number(date.slice(8))) continue;
    const b = { category: r.category, amount: r.amount, note: r.note, date, property_id: r.property_id, vehicle_id: r.vehicle_id };
    db.transaction(() => {
      const info = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date, property_id, vehicle_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(r.family_id, r.user_id, r.category, r.amount, r.note, date, r.property_id, r.vehicle_id);
      mirrorExpense(r.family_id, info.lastInsertRowid, b, r.user_id);
      db.prepare('UPDATE recurring_expenses SET last_period = ? WHERE id = ?').run(period, r.id);
    })();
  }
}
app.get('/api/recurring-expenses', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, u.name AS user_name, p.name AS property_name, v.name AS vehicle_name FROM recurring_expenses r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN properties p ON p.id = r.property_id
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.family_id = ? ORDER BY r.active DESC, r.id DESC
  `).all(req.user.family_id));
});
app.post('/api/recurring-expenses', auth, canWrite, (req, res) => {
  const b = req.body || {};
  const day = Math.round(Number(b.day));
  if (!(day >= 1 && day <= 31)) return res.status(400).json({ error: 'Day must be between 1 and 31' });
  // reuse the one-off expense rules: same categories, same person and link checks
  const err = validateExpense({ ...b, date: '2000-01-01' }, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const uid = num(b.user_id) ?? req.user.id;
  const info = db.prepare('INSERT INTO recurring_expenses (family_id, user_id, category, note, amount, day, property_id, vehicle_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.family_id, uid, str(b.category), str(b.note), Number(b.amount), day, num(b.property_id), num(b.vehicle_id));
  autoLogRecurringExpenses(); // if this month's day already passed, log it right away
  res.json(db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(info.lastInsertRowid));
});
app.post('/api/recurring-expenses/:id/toggle', auth, canWrite, (req, res) => {
  const info = db.prepare('UPDATE recurring_expenses SET active = 1 - active WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/recurring-expenses/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM recurring_expenses WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true }); // already-logged months stay, like recurring income
});

crud({
  route: 'incomes', table: 'incomes',
  fields: ['user_id', 'source', 'amount', 'date'],
  orderBy: 'date DESC, id DESC',
  validate: (b) => {
    if (!b.source) return 'Source is required';
    if (!okAmount(b.amount)) return 'Amount must be greater than 0';
    if (!isDate(b.date)) return 'Date must be YYYY-MM-DD';
    return null;
  },
});

// ---------- recurring incomes (salaries) ----------
// once per month, on/after each entry's day, log it into incomes
function autoLogIncomes() {
  const period = new Date().toISOString().slice(0, 7);
  const todayDay = new Date().getUTCDate();
  for (const r of db.prepare('SELECT * FROM recurring_incomes WHERE active = 1').all()) {
    const date = monthDate(period, r.day); // a salary paid "on the 31st" still lands in February
    if (r.last_period === period || todayDay < Number(date.slice(8))) continue;
    db.prepare('INSERT INTO incomes (family_id, user_id, source, amount, date) VALUES (?,?,?,?,?)')
      .run(r.family_id, r.user_id, r.source, r.amount, date);
    db.prepare('UPDATE recurring_incomes SET last_period = ? WHERE id = ?').run(period, r.id);
  }
}
app.get('/api/recurring-incomes', auth, (req, res) => {
  res.json(db.prepare('SELECT r.*, u.name AS user_name FROM recurring_incomes r LEFT JOIN users u ON u.id = r.user_id WHERE r.family_id = ? ORDER BY r.active DESC, r.id DESC').all(req.user.family_id));
});
app.post('/api/recurring-incomes', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!str(b.source)) return res.status(400).json({ error: 'Source is required' });
  if (!okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  const day = Math.round(Number(b.day));
  if (!(day >= 1 && day <= 31)) return res.status(400).json({ error: 'Day must be between 1 and 31' });
  let uid = num(b.user_id);
  if (uid != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(uid, req.user.family_id)) {
    return res.status(400).json({ error: 'Person must be a member of the family' });
  }
  if (uid == null) uid = req.user.id;
  const info = db.prepare('INSERT INTO recurring_incomes (family_id, user_id, source, amount, day) VALUES (?,?,?,?,?)')
    .run(req.user.family_id, uid, str(b.source), Number(b.amount), day);
  autoLogIncomes(); // if this month's day already passed, log it right away
  res.json(db.prepare('SELECT * FROM recurring_incomes WHERE id = ?').get(info.lastInsertRowid));
});
app.post('/api/recurring-incomes/:id/toggle', auth, canWrite, (req, res) => {
  const info = db.prepare('UPDATE recurring_incomes SET active = 1 - active WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/recurring-incomes/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM recurring_incomes WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true });
});
crud({
  route: 'vehicles', table: 'vehicles',
  fields: ['name', 'plate', 'rca_expiry', 'casco_expiry', 'vignette_expiry', 'itp_expiry', 'road_tax_due', 'owner_id', 'notes'],
  orderBy: 'name',
  validate: (b, req) => {
    if (!b.name) return 'Vehicle name is required';
    if (num(b.owner_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.owner_id), req.user.family_id)) {
      return 'Owner must be a member of the family';
    }
    return null;
  },
});
crud({
  route: 'properties', table: 'properties',
  fields: ['name', 'address', 'insurance_expiry', 'insurance2_expiry', 'property_tax_due', 'mortgage_lender', 'mortgage_payment', 'mortgage_due_day', 'owner_id', 'rent_amount', 'rent_due_day', 'reading_day', 'reading_utilities', 'payment_link', 'managed', 'notes'],
  orderBy: 'name',
  validate: (b, req) => {
    if (!b.name) return 'Property name is required';
    // crud() writes every field, so an omitted `managed` would insert NULL into a NOT NULL column.
    // Normalising here (validate receives the real body on create) keeps it a plain 0/1.
    if (b.managed != null && b.managed !== '' && ![0, 1, '0', '1', true, false].includes(b.managed)) return 'Managed must be 0 or 1';
    b.managed = b.managed == null || b.managed === '' ? 0 : (Number(b.managed) ? 1 : 0);
    if (num(b.owner_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.owner_id), req.user.family_id)) {
      return 'Owner must be a member of the family';
    }
    return null;
  },
});

// ---------- budgets ----------
app.get('/api/budgets', auth, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const budgets = db.prepare('SELECT * FROM budgets WHERE family_id = ? AND month = ?').all(req.user.family_id, month);
  const spent = db.prepare(`
    SELECT category, SUM(amount) AS spent FROM expenses
    WHERE family_id = ? AND substr(date,1,7) = ? GROUP BY category
  `).all(req.user.family_id, month);
  res.json({ month, budgets, spent });
});
app.post('/api/budgets', auth, canWrite, (req, res) => {
  const { category, month, amount } = req.body || {};
  if (!category || !/^\d{4}-\d{2}$/.test(month || '') || !(Number(amount) >= 0)) {
    return res.status(400).json({ error: 'Category, month (YYYY-MM) and amount are required' });
  }
  db.prepare(`
    INSERT INTO budgets (family_id, category, month, amount) VALUES (?,?,?,?)
    ON CONFLICT(family_id, category, month) DO UPDATE SET amount = excluded.amount
  `).run(req.user.family_id, category, month, Number(amount));
  res.json({ ok: true });
});
app.delete('/api/budgets/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true });
});
// What each category actually costs, averaged over the last N COMPLETE months — the current month
// is deliberately excluded, since a partial month would drag every average down. Dividing by the
// whole window (not by the months that happened to have spending) keeps a once-a-quarter category
// from being budgeted as if it were monthly. Feeds both the "start my budgets" button and the
// dashboard's "this category is above its usual" line.
// Money this month is already committed to but which has not posted as an expense yet: the credit
// instalment due on the 28th, the auto-paid subscription, the recurring cost logged on its day.
// The month forecast needs these — projecting only from a daily run-rate reads low early in the
// month, when most of the fixed charges are still ahead of you. Computed here rather than in the
// browser so it uses the same scheduling rules that will actually post them.
app.get('/api/upcoming-month', auth, (req, res) => {
  const fid = req.user.family_id;
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);
  const monthEnd = monthDate(period, 31);
  const items = [];

  for (const c of db.prepare('SELECT * FROM credits WHERE family_id = ?').all(fid)) {
    if (c.auto_expense_period === period) continue; // already posted this month
    const stats = creditStats(c, db.prepare('SELECT * FROM credit_payments WHERE credit_id = ?').all(c.id));
    if (!(stats.months_left > 0) && stats.balance <= 0.005) continue; // paid off
    const date = monthDate(period, Number(String(c.start_date).slice(8, 10)) || 1);
    items.push({ kind: 'credit', label: c.name, amount: Math.round((stats.monthly_payment + (Number(c.commission) || 0)) * 100) / 100, date });
  }
  for (const b of db.prepare("SELECT * FROM bills WHERE family_id = ? AND auto_pay = 1 AND status = 'unpaid' AND amount > 0 AND due_date > ? AND due_date <= ?").all(fid, today, monthEnd)) {
    items.push({ kind: 'bill', label: b.name, amount: Number(b.amount), date: b.due_date });
  }
  for (const r of db.prepare('SELECT * FROM recurring_expenses WHERE family_id = ? AND active = 1').all(fid)) {
    if (r.last_period === period) continue; // already logged this month
    items.push({ kind: 'recurring', label: r.note || r.category, amount: Number(r.amount), date: monthDate(period, r.day) });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  res.json({ total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100, items });
});
const BUDGET_BASIS_MONTHS = 3;
app.get('/api/budgets/suggest', auth, (req, res) => {
  const n = BUDGET_BASIS_MONTHS;
  const now = new Date();
  const monthAt = (back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7);
  const from = monthAt(n), to = monthAt(1);
  const rows = db.prepare(`
    SELECT category, SUM(amount) AS total FROM expenses
    WHERE family_id = ? AND substr(date,1,7) >= ? AND substr(date,1,7) <= ?
    GROUP BY category ORDER BY total DESC
  `).all(req.user.family_id, from, to);
  // rounded up to the nearest 10 — a budget you are instantly over is useless
  const categories = rows.map((r) => ({ category: r.category, avg: r.total / n, amount: Math.max(10, Math.ceil(r.total / n / 10) * 10) }));
  res.json({ months: n, from, to, categories });
});
app.post('/api/budgets/bulk', auth, canWrite, (req, res) => {
  const month = String(req.body?.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (YYYY-MM) is required' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const ins = db.prepare(`
    INSERT INTO budgets (family_id, category, month, amount) VALUES (?,?,?,?)
    ON CONFLICT(family_id, category, month) DO UPDATE SET amount = excluded.amount
  `);
  let saved = 0;
  db.transaction(() => {
    for (const it of items) {
      if (!EXPENSE_CATEGORIES.includes(String(it?.category)) || !(Number(it?.amount) >= 0)) continue;
      ins.run(req.user.family_id, String(it.category), month, Number(it.amount));
      saved++;
    }
  })();
  res.json({ ok: true, saved });
});

// ---------- credits (loans) ----------
// Monthly payment from the annuity formula; anticipated payments keep the payment
// constant and shorten the schedule, so the interest saved is baseline minus simulated.
function creditStats(credit, prepays) {
  const P = Number(credit.principal);
  const r = Number(credit.interest_rate) / 100 / 12;
  const n = Math.max(1, Math.round(Number(credit.term_months)));
  const payment = r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
  const baseTotalInterest = payment * n - P;

  const monthIdx = (d) => {
    const [y1, m1] = credit.start_date.split('-').map(Number);
    const [y2, m2] = String(d).split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
  };
  const prepayAt = {};
  let prepaidTotal = 0;
  for (const p of prepays) {
    const k = Math.max(0, monthIdx(p.date));
    prepayAt[k] = (prepayAt[k] || 0) + Number(p.amount);
    prepaidTotal += Number(p.amount);
  }

  const elapsed = Math.max(0, monthIdx(new Date().toISOString().slice(0, 10)));
  let bal = P, totalInterest = 0, months = 0, balanceNow = null;
  const MAX = n + 1200; // safety net if the payment barely covers interest
  while (bal > 0.005 && months < MAX) {
    if (prepayAt[months]) bal = Math.max(0, bal - prepayAt[months]);
    if (months === elapsed) balanceNow = bal;
    if (bal <= 0.005) break;
    const interest = bal * r;
    totalInterest += interest;
    bal = Math.max(0, bal + interest - payment);
    months++;
  }
  if (balanceNow === null) balanceNow = bal; // already paid off before today

  const commission = Number(credit.commission) || 0;
  // breakdown of the NEXT installment: interest accrues on today's balance, the rest is principal.
  // paying one month in advance = that principal portion + 1% early-repayment fee.
  const nextInterest = Math.max(0, balanceNow) * r;
  const nextPrincipal = Math.max(0, Math.min(payment - nextInterest, Math.max(0, balanceNow)));
  return {
    monthly_payment: Math.round(payment * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    monthly_total: Math.round((payment + commission) * 100) / 100, // rate + fixed commission
    next_principal: Math.round(nextPrincipal * 100) / 100,
    next_interest: Math.round(nextInterest * 100) / 100,
    advance_month_cost: Math.round(nextPrincipal * 1.01 * 100) / 100, // next principal + 1%
    base_total_interest: Math.round(baseTotalInterest * 100) / 100,
    total_interest: Math.round(totalInterest * 100) / 100,
    interest_saved: Math.round(Math.max(0, baseTotalInterest - totalInterest) * 100) / 100,
    prepaid_total: Math.round(prepaidTotal * 100) / 100,
    balance: Math.round(balanceNow * 100) / 100,
    months_left: Math.max(0, months - elapsed),
    payoff_date: addMonths(credit.start_date, months),
  };
}
// once a month, on/after each credit's payment day, log its monthly payment (rate + commission) as an expense
function autoLogCreditExpenses() {
  const period = new Date().toISOString().slice(0, 7);
  const todayDay = new Date().getUTCDate();
  for (const c of db.prepare('SELECT * FROM credits').all()) {
    if (c.auto_expense_period === period) continue;
    // an instalment dated the 31st is due on the 30th in a 30-day month — comparing against the raw
    // day would skip that month's payment entirely
    const dueDate = monthDate(period, Number(String(c.start_date).slice(8, 10)) || 1);
    if (todayDay < Number(dueDate.slice(8))) continue; // payment not due yet this month
    const stats = creditStats(c, db.prepare('SELECT * FROM credit_payments WHERE credit_id = ?').all(c.id));
    if (!(stats.months_left > 0) && stats.balance <= 0.005) { // already paid off
      db.prepare('UPDATE credits SET auto_expense_period = ? WHERE id = ?').run(period, c.id);
      continue;
    }
    const total = Math.round((stats.monthly_payment + (Number(c.commission) || 0)) * 100) / 100;
    // a credit tied to a property carries that link onto the expense, so the mortgage lands in
    // the property's own cost history — without it "is this flat making money?" ignores the loan
    // the mirror label is built as "<category>: <note>", so the note here carries no "Credit:"
    // prefix of its own — the expense's own note keeps it
    const b = { category: 'Credit', amount: total, note: `${c.name} ${period}`, date: dueDate, property_id: c.property_id, vehicle_id: null };
    db.transaction(() => {
      const info = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date, property_id) VALUES (?,?,?,?,?,?,?)')
        .run(c.family_id, c.user_id, 'Credit', total, `Credit: ${c.name} ${period}`, dueDate, c.property_id);
      mirrorExpense(c.family_id, info.lastInsertRowid, b, c.user_id);
      db.prepare('UPDATE credits SET auto_expense_period = ? WHERE id = ?').run(period, c.id);
    })();
  }
}
function validateCredit(b, fid, prevPropId = null) {
  if (!b.name) return 'Credit name is required';
  if (!okAmount(b.principal)) return 'Principal must be greater than 0';
  if (!(Number(b.interest_rate) >= 0)) return 'Dobanda (interest %) must be 0 or more';
  if (!(Number(b.term_months) >= 1)) return 'Term must be at least 1 month';
  if (b.commission != null && b.commission !== '' && !(Number(b.commission) >= 0)) return 'Commission must be 0 or more';
  if (!isDate(b.start_date)) return 'Start date must be YYYY-MM-DD';
  if (num(b.user_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.user_id), fid)) {
    return 'Holder must be a member of the family';
  }
  const cProp = num(b.property_id) != null ? db.prepare('SELECT id, managed FROM properties WHERE id = ? AND family_id = ?').get(num(b.property_id), fid) : null;
  if (num(b.property_id) != null && !cProp) return 'Linked property not found';
  // the monthly instalment posts as a household expense — not for a property we merely administer.
  // As above, only a newly made link is refused; one already on the credit stays editable.
  if (cProp?.managed && num(b.property_id) !== prevPropId) return 'That property is managed, not owned — a household credit cannot sit on it';
  return null;
}
const CREDIT_SELECT = `
  SELECT c.*, u.name AS user_name, p.name AS property_name
  FROM credits c
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN properties p ON p.id = c.property_id
`;
app.get('/api/credits', auth, (req, res) => {
  const rows = db.prepare(`${CREDIT_SELECT} WHERE c.family_id = ? ORDER BY c.name`).all(req.user.family_id);
  const pays = db.prepare('SELECT * FROM credit_payments WHERE family_id = ?').all(req.user.family_id);
  res.json(rows.map((c) => ({ ...c, ...creditStats(c, pays.filter((p) => p.credit_id === c.id)) })));
});
app.post('/api/credits', auth, canWrite, (req, res) => {
  const b = req.body || {};
  const err = validateCredit(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare(`
    INSERT INTO credits (family_id, name, lender, principal, interest_rate, term_months, start_date, commission, user_id, property_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.family_id, str(b.name), str(b.lender), Number(b.principal), Number(b.interest_rate),
    Math.round(Number(b.term_months)), b.start_date, Number(b.commission) || 0, num(b.user_id), num(b.property_id), str(b.notes));
  const row = db.prepare(`${CREDIT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid);
  res.json({ ...row, ...creditStats(row, []) });
});
app.put('/api/credits/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM credits WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  const err = validateCredit(b, req.user.family_id, num(row.property_id));
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE credits SET name=?, lender=?, principal=?, interest_rate=?, term_months=?, start_date=?, commission=?, user_id=?, property_id=?, notes=? WHERE id=?')
    .run(str(b.name), str(b.lender), Number(b.principal), Number(b.interest_rate), Math.round(Number(b.term_months)), b.start_date,
      Number(b.commission) || 0, num(b.user_id), num(b.property_id), str(b.notes), row.id);
  const updated = db.prepare(`${CREDIT_SELECT} WHERE c.id = ?`).get(row.id);
  const pays = db.prepare('SELECT * FROM credit_payments WHERE credit_id = ?').all(row.id);
  res.json({ ...updated, ...creditStats(updated, pays) });
});
app.delete('/api/credits/:id', auth, canWrite, (req, res) => {
  const info = db.prepare('DELETE FROM credits WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.get('/api/credits/:id/payments', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name AS paid_by_name FROM credit_payments p
    LEFT JOIN users u ON u.id = p.paid_by
    WHERE p.credit_id = ? AND p.family_id = ? ORDER BY p.date DESC, p.id DESC
  `).all(req.params.id, req.user.family_id);
  res.json(rows);
});
app.post('/api/credits/:id/payments', auth, canWrite, (req, res) => {
  const credit = db.prepare('SELECT * FROM credits WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!credit) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!isDate(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  db.prepare('INSERT INTO credit_payments (credit_id, family_id, amount, date, paid_by) VALUES (?,?,?,?,?)')
    .run(credit.id, req.user.family_id, Number(b.amount), b.date, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/credits/:id/payments/:pid', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM credit_payments WHERE id = ? AND credit_id = ? AND family_id = ?')
    .run(req.params.pid, req.params.id, req.user.family_id);
  res.json({ ok: true });
});

// ---------- bills ----------
// expense categories a bill may be logged under — mirrors CATEGORIES in public/app.js
const EXPENSE_CATEGORIES = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Credit', 'Subscriptions', 'Other'];
const BILL_CAT_MAP = { electricity: 'Utilities', gas: 'Utilities', water: 'Utilities', internet: 'Utilities', mobile: 'Utilities', subscription: 'Subscriptions', property_tax: 'Taxes', other: 'Other' };
const BILL_SELECT = `
  SELECT b.*, u.name AS owner_name, p.name AS property_name, v.name AS vehicle_name,
    -- what this bill last actually cost, so the subscriptions panel can flag a price change
    (SELECT bp.amount FROM bill_payments bp WHERE bp.bill_id = b.id ORDER BY bp.paid_at DESC, bp.id DESC LIMIT 1) AS last_paid_amount
  FROM bills b
  LEFT JOIN users u ON u.id = b.owner_id
  LEFT JOIN properties p ON p.id = b.property_id
  LEFT JOIN vehicles v ON v.id = b.vehicle_id
`;
function validateBillLinks(b, fid, prevPropId = null) {
  if (num(b.owner_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.owner_id), fid)) return 'Owner must be a member of the family';
  if (num(b.property_id) != null && num(b.vehicle_id) != null) return 'Link the bill to a property or a vehicle, not both';
  const bProp = num(b.property_id) != null ? db.prepare('SELECT id, managed FROM properties WHERE id = ? AND family_id = ?').get(num(b.property_id), fid) : null;
  if (num(b.property_id) != null && !bProp) return 'Linked property not found';
  // paying a bill logs a household expense, so a managed property must not be on the other end of
  // it — but only refuse a link being made, never freeze a bill that already carried one
  if (bProp?.managed && num(b.property_id) !== prevPropId) return 'That property is managed, not owned — log the cost on the property';
  if (num(b.vehicle_id) != null && !db.prepare('SELECT id FROM vehicles WHERE id = ? AND family_id = ?').get(num(b.vehicle_id), fid)) return 'Linked vehicle not found';
  if (b.expense_category != null && b.expense_category !== '' && !EXPENSE_CATEGORIES.includes(String(b.expense_category))) return 'Unknown expense category';
  return null;
}
// the expense category a bill lands under: the explicit choice, else derived from the bill type
const billExpenseCategory = (bill) => bill.expense_category || BILL_CAT_MAP[bill.category] || 'Utilities';
// next due date for a recurring bill: a day cycle (e.g. every 30 days) wins over a month cycle
function nextBillDue(bill) {
  if (bill.recur_days > 0) return addDays(bill.due_date, bill.recur_days);
  if (bill.recur_months > 0) return addMonths(bill.due_date, bill.recur_months);
  return null;
}
// paying a bill logs an expense; if it is linked to a property/vehicle the expense is
// mirrored into that entity's cost history, exactly like a manually added expense.
function logBillExpense(bill, amount, userId, date, note) {
  const info = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date, property_id, vehicle_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(bill.family_id, userId, billExpenseCategory(bill), amount, note, date, bill.property_id, bill.vehicle_id);
  if (bill.property_id) {
    db.prepare('INSERT INTO property_records (property_id, family_id, type, date, amount, note, user_id, expense_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(bill.property_id, bill.family_id, 'utility', date, amount, note, userId, info.lastInsertRowid);
  }
  if (bill.vehicle_id) {
    db.prepare('INSERT INTO vehicle_records (vehicle_id, family_id, type, date, amount, note, expense_id) VALUES (?,?,?,?,?,?,?)')
      .run(bill.vehicle_id, bill.family_id, 'other', date, amount, note, info.lastInsertRowid);
  }
}
// auto-pay subscriptions: once due, count them as paid (log payment + expense, roll recurring forward)
function autoPayBills() {
  const today = new Date().toISOString().slice(0, 10);
  const due = db.prepare("SELECT * FROM bills WHERE auto_pay = 1 AND status = 'unpaid' AND due_date <= ? AND amount > 0").all(today);
  for (const bill of due) {
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO bill_payments (bill_id, family_id, amount, paid_at, paid_by) VALUES (?,?,?,?,?)')
        .run(bill.id, bill.family_id, bill.amount, today, bill.owner_id);
      logBillExpense(bill, bill.amount, bill.owner_id, today, `Bill (auto): ${bill.name}`);
      const next = nextBillDue(bill);
      if (next) db.prepare("UPDATE bills SET due_date = ?, status = 'unpaid' WHERE id = ?").run(next, bill.id);
      else db.prepare("UPDATE bills SET status = 'paid' WHERE id = ?").run(bill.id);
    });
    tx();
  }
}
app.get('/api/bills', auth, (req, res) => {
  autoPayBills();
  const bills = db.prepare(`${BILL_SELECT} WHERE b.family_id = ? ORDER BY b.due_date`).all(req.user.family_id);
  res.json(bills);
});
app.post('/api/bills', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !isDate(b.due_date)) return res.status(400).json({ error: 'Name, category and due date are required' });
  const err = validateBillLinks(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare(`
    INSERT INTO bills (family_id, name, provider, category, expense_category, amount, due_date, recur_months, recur_days, auto_pay, owner_id, property_id, vehicle_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.family_id, str(b.name), str(b.provider), str(b.category), str(b.expense_category), num(b.amount), b.due_date,
    Number(b.recur_months) || 0, Number(b.recur_days) || 0,
    b.auto_pay ? 1 : 0, num(b.owner_id), num(b.property_id), num(b.vehicle_id), str(b.notes));
  res.json(db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(info.lastInsertRowid));
});
app.put('/api/bills/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  if (!b.name || !b.category || !isDate(b.due_date)) return res.status(400).json({ error: 'Name, category and due date are required' });
  const err = validateBillLinks(b, req.user.family_id, num(row.property_id));
  if (err) return res.status(400).json({ error: err });
  db.prepare(`
    UPDATE bills SET name=?, provider=?, category=?, expense_category=?, amount=?, due_date=?, recur_months=?, recur_days=?, status=?, auto_pay=?, owner_id=?, property_id=?, vehicle_id=?, notes=? WHERE id=?
  `).run(str(b.name), str(b.provider), str(b.category), str(b.expense_category), num(b.amount), b.due_date,
    Number(b.recur_months) || 0, Number(b.recur_days) || 0,
    b.status === 'paid' ? 'paid' : 'unpaid', b.auto_pay ? 1 : 0, num(b.owner_id), num(b.property_id), num(b.vehicle_id), str(b.notes), row.id);
  res.json(db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(row.id));
});
app.delete('/api/bills/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.attachment) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.attachment)); } catch {} }
  db.prepare('DELETE FROM bills WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Mark a bill paid: records payment history, logs an expense, and rolls recurring bills forward.
app.post('/api/bills/:id/pay', auth, canWrite, (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!bill) return res.status(404).json({ error: 'Not found' });
  const amount = num(req.body?.amount) ?? bill.amount;
  if (!okAmount(amount)) return res.status(400).json({ error: 'Enter the amount paid' });
  const today = new Date().toISOString().slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO bill_payments (bill_id, family_id, amount, paid_at, paid_by) VALUES (?,?,?,?,?)')
      .run(bill.id, bill.family_id, amount, today, req.user.id);
    logBillExpense(bill, amount, bill.owner_id ?? req.user.id, today, `Bill: ${bill.name}`);
    const next = nextBillDue(bill);
    if (next) {
      db.prepare('UPDATE bills SET due_date = ?, status = ?, amount = ? WHERE id = ?').run(next, 'unpaid', bill.amount, bill.id);
    } else {
      db.prepare("UPDATE bills SET status = 'paid' WHERE id = ?").run(bill.id);
    }
  });
  tx();
  res.json({ ok: true });
});

app.get('/api/bills/:id/payments', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name AS paid_by_name FROM bill_payments p
    LEFT JOIN users u ON u.id = p.paid_by
    WHERE p.bill_id = ? AND p.family_id = ? ORDER BY p.paid_at DESC
  `).all(req.params.id, req.user.family_id);
  res.json(rows);
});

// invoice attachments (PDF or image)
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    // status 400 marks this as the caller's mistake, so the handler tells them what was wrong
    // instead of burying it under the generic "something went wrong" used for our own faults
    cb(ok ? null : Object.assign(new Error('Only PDF or image files are allowed'), { status: 400 }), ok);
  },
});
app.post('/api/bills/:id/attachment', auth, canWrite, upload.single('file'), (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!bill) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (bill.attachment) { try { fs.unlinkSync(path.join(UPLOAD_DIR, bill.attachment)); } catch {} }
  db.prepare('UPDATE bills SET attachment = ? WHERE id = ?').run(req.file.filename, bill.id);
  res.json({ attachment: req.file.filename });
});
app.get('/api/bills/:id/attachment', auth, (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!bill || !bill.attachment) return res.status(404).json({ error: 'No attachment' });
  res.sendFile(path.join(UPLOAD_DIR, bill.attachment));
});

// ---------- user settings & profile pictures ----------
// theme + display name for the signed-in member
app.post('/api/settings', auth, (req, res) => {
  const { theme, name, lang, birthday, phone, notif_muted, quiet_start, quiet_end } = req.body || {};
  if (theme && !['light', 'dark', 'system'].includes(theme)) return res.status(400).json({ error: 'Unknown theme' });
  if (lang && !['en', 'ro'].includes(lang)) return res.status(400).json({ error: 'Unknown language' });
  if (birthday != null && birthday !== '' && !isDate(birthday)) return res.status(400).json({ error: 'Birthday must be a valid date' });
  if (theme) db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.user.id);
  if (lang) db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, req.user.id);
  if (name && String(name).trim() && req.user.role !== 'child') db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim(), req.user.id);
  if (birthday !== undefined) db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(birthday || null, req.user.id);
  if (phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(str(phone), req.user.id);
  // alert preferences: an array of muted group names, and quiet hours (0-23) for push
  if (notif_muted !== undefined) {
    const muted = Array.isArray(notif_muted) ? notif_muted.filter((g) => g in ALERT_GROUPS) : [];
    db.prepare('UPDATE users SET notif_muted = ? WHERE id = ?').run(muted.join(','), req.user.id);
  }
  if (quiet_start !== undefined || quiet_end !== undefined) {
    const hour = (v) => (v === null || v === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : undefined);
    const qs = hour(quiet_start), qe = hour(quiet_end);
    if (qs === undefined || qe === undefined) return res.status(400).json({ error: 'Quiet hours must be 0-23' });
    // both or neither: a window needs two edges
    db.prepare('UPDATE users SET quiet_start = ?, quiet_end = ? WHERE id = ?').run(qs === null || qe === null ? null : qs, qs === null || qe === null ? null : qe, req.user.id);
  }
  res.json(db.prepare('SELECT id, family_id, name, email, role, avatar, theme, lang, birthday, phone, notif_muted, quiet_start, quiet_end FROM users WHERE id = ?').get(req.user.id));
});
// who may set a given member's picture: yourself (adult/admin/tenant), or a child if you can write
function canEditAvatar(reqUser, target) {
  if (!target || target.family_id !== reqUser.family_id) return false;
  if (target.id === reqUser.id) return ['admin', 'adult', 'tenant'].includes(reqUser.role);
  return (reqUser.role === 'admin' || reqUser.role === 'adult') && target.role === 'child';
}
app.post('/api/users/:id/avatar', auth, upload.single('file'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!canEditAvatar(req.user, target)) return res.status(403).json({ error: 'Not allowed to change this picture' });
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (!/\.(png|jpg|jpeg|webp)$/i.test(req.file.filename)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {} return res.status(400).json({ error: 'Profile picture must be an image' }); }
  if (target.avatar) { try { fs.unlinkSync(path.join(UPLOAD_DIR, target.avatar)); } catch {} }
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, target.id);
  res.json({ avatar: req.file.filename });
});
app.delete('/api/users/:id/avatar', auth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!canEditAvatar(req.user, target)) return res.status(403).json({ error: 'Not allowed' });
  if (target.avatar) { try { fs.unlinkSync(path.join(UPLOAD_DIR, target.avatar)); } catch {} }
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(target.id);
  res.json({ ok: true });
});
app.get('/api/users/:id/avatar', auth, (req, res) => {
  const target = db.prepare('SELECT avatar, family_id FROM users WHERE id = ?').get(req.params.id);
  if (!target || target.family_id !== req.user.family_id || !target.avatar) return res.status(404).json({ error: 'No picture' });
  res.sendFile(path.join(UPLOAD_DIR, target.avatar));
});

// ---------- documents (acte) ----------
function validateDocument(b, fid) {
  if (!b.name) return 'Document name is required';
  if (['user_id', 'vehicle_id', 'property_id'].filter((k) => num(b[k]) != null).length > 1) {
    return 'Link the document to a single person, vehicle or property';
  }
  if (num(b.user_id) != null && !db.prepare("SELECT id FROM users WHERE id = ? AND family_id = ? AND role != 'tenant'").get(num(b.user_id), fid)) {
    return 'Person must be a member of the family';
  }
  if (num(b.vehicle_id) != null && !db.prepare('SELECT id FROM vehicles WHERE id = ? AND family_id = ?').get(num(b.vehicle_id), fid)) {
    return 'Vehicle not found';
  }
  if (num(b.property_id) != null && !db.prepare('SELECT id FROM properties WHERE id = ? AND family_id = ?').get(num(b.property_id), fid)) {
    return 'Property not found';
  }
  if (b.expiry_date && !isDate(b.expiry_date)) return 'Expiry date must be YYYY-MM-DD';
  return null;
}
const DOC_SELECT = `
  SELECT d.*, u.name AS person_name, v.name AS vehicle_name, p.name AS property_name
  FROM documents d
  LEFT JOIN users u ON u.id = d.user_id
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  LEFT JOIN properties p ON p.id = d.property_id
`;
// which deadline slots exist per entity kind (a slotted document replaces that field's reminder)
const PROPERTY_SLOTS = ['insurance_expiry', 'insurance2_expiry', 'property_tax_due'];
const VEHICLE_SLOTS = ['rca_expiry', 'casco_expiry', 'vignette_expiry', 'itp_expiry', 'road_tax_due'];
function cleanSlot(b) {
  const s = str(b.slot);
  if (!s) return null;
  if (num(b.property_id) != null && PROPERTY_SLOTS.includes(s)) return s;
  if (num(b.vehicle_id) != null && VEHICLE_SLOTS.includes(s)) return s;
  return null; // slot only valid when it matches the linked entity kind
}
app.get('/api/documents', auth, (req, res) => {
  res.json(db.prepare(`${DOC_SELECT} WHERE d.family_id = ? ORDER BY d.expiry_date IS NULL, d.expiry_date, d.name`).all(req.user.family_id));
});
app.post('/api/documents', auth, canWrite, (req, res) => {
  const b = req.body || {};
  const err = validateDocument(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare('INSERT INTO documents (family_id, name, number, user_id, vehicle_id, property_id, slot, expiry_date, notes) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.user.family_id, str(b.name), str(b.number), num(b.user_id), num(b.vehicle_id), num(b.property_id), cleanSlot(b), b.expiry_date || null, str(b.notes));
  res.json(db.prepare(`${DOC_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid));
});
app.put('/api/documents/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  const err = validateDocument(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE documents SET name=?, number=?, user_id=?, vehicle_id=?, property_id=?, slot=?, expiry_date=?, notes=? WHERE id=?')
    .run(str(b.name), str(b.number), num(b.user_id), num(b.vehicle_id), num(b.property_id), cleanSlot(b), b.expiry_date || null, str(b.notes), row.id);
  res.json(db.prepare(`${DOC_SELECT} WHERE d.id = ?`).get(row.id));
});
app.delete('/api/documents/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.attachment) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.attachment)); } catch {} }
  db.prepare('DELETE FROM documents WHERE id = ?').run(row.id);
  res.json({ ok: true });
});
app.post('/api/documents/:id/attachment', auth, canWrite, upload.single('file'), (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (doc.attachment) { try { fs.unlinkSync(path.join(UPLOAD_DIR, doc.attachment)); } catch {} }
  db.prepare('UPDATE documents SET attachment = ? WHERE id = ?').run(req.file.filename, doc.id);
  res.json({ attachment: req.file.filename });
});
app.get('/api/documents/:id/attachment', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!doc || !doc.attachment) return res.status(404).json({ error: 'No attachment' });
  res.sendFile(path.join(UPLOAD_DIR, doc.attachment));
});

// ---------- vehicle & property records ----------
// (a generic subRecords() factory used to live here — it was superseded by the explicit routes
//  below and had been dead for a while. Removed: it built table/column names into SQL by
//  interpolation, which is only ever safe while every caller passes a literal. No caller, no rule.)
// vehicle records: each cost (fuel, service, tires…) also becomes a family expense attributed to the car's owner
const VEH_REC_TYPES = ['service', 'tires', 'fuel', 'other'];
const VEH_CAT_MAP = { fuel: 'Transportation', service: 'Transportation', tires: 'Transportation', other: 'Other' };
app.get('/api/vehicles/:pid/records', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM vehicle_records WHERE vehicle_id = ? AND family_id = ? ORDER BY date DESC, id DESC').all(req.params.pid, req.user.family_id));
});
app.post('/api/vehicles/:pid/records', auth, canWrite, (req, res) => {
  const veh = db.prepare('SELECT * FROM vehicles WHERE id = ? AND family_id = ?').get(req.params.pid, req.user.family_id);
  if (!veh) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!VEH_REC_TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid record type' });
  if (!isDate(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (b.amount != null && b.amount !== '' && !okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  let expenseId = null;
  const rid = db.transaction(() => {
    if (Number(b.amount) > 0) {
      const ei = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date) VALUES (?,?,?,?,?,?)')
        .run(veh.family_id, veh.owner_id, VEH_CAT_MAP[b.type] || 'Transportation', Number(b.amount), `Vehicle: ${veh.name} — ${b.type}${b.note ? ': ' + b.note : ''}`, b.date);
      expenseId = ei.lastInsertRowid;
    }
    return db.prepare('INSERT INTO vehicle_records (vehicle_id, family_id, type, date, amount, odometer, note, expense_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(veh.id, veh.family_id, b.type, b.date, num(b.amount), num(b.odometer), str(b.note), expenseId).lastInsertRowid;
  })();
  res.json(db.prepare('SELECT * FROM vehicle_records WHERE id = ?').get(rid));
});
app.delete('/api/vehicles/:pid/records/:rid', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM vehicle_records WHERE id = ? AND family_id = ?').get(req.params.rid, req.user.family_id);
  if (!row) return res.json({ ok: true });
  db.transaction(() => {
    if (row.expense_id) db.prepare('DELETE FROM expenses WHERE id = ? AND family_id = ?').run(row.expense_id, req.user.family_id);
    db.prepare('DELETE FROM vehicle_records WHERE id = ?').run(row.id);
  })();
  res.json({ ok: true });
});

// property records: cost entries also become a family expense (attributed to a member) or a tenant invoice;
// income entries (rent / other income) are property-summary records only.
const PROP_REC_TYPES = ['maintenance', 'renovation', 'utility', 'rent', 'other_income', 'other'];
const PROP_COST_TYPES = ['maintenance', 'renovation', 'utility', 'other'];
const PR_SELECT = 'SELECT r.*, u.name AS user_name FROM property_records r LEFT JOIN users u ON u.id = r.user_id';
app.get('/api/properties/:pid/records', auth, (req, res) => {
  res.json(db.prepare(`${PR_SELECT} WHERE r.property_id = ? AND r.family_id = ? ORDER BY r.date DESC, r.id DESC`).all(req.params.pid, req.user.family_id));
});
app.post('/api/properties/:pid/records', auth, canWrite, (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND family_id = ?').get(req.params.pid, req.user.family_id);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!PROP_REC_TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid record type' });
  if (!isDate(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (b.amount != null && b.amount !== '' && !okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  const isCost = PROP_COST_TYPES.includes(b.type) && Number(b.amount) > 0;
  const tenant = db.prepare("SELECT id FROM users WHERE role = 'tenant' AND tenant_property_id = ?").get(prop.id);
  let expenseId = null, attributedUser = null;
  const rid = db.transaction(() => {
    if (isCost) {
      if (b.attribute === 'tenant' && tenant) {
        // bill the tenant instead of counting it as a family expense
        db.prepare('INSERT INTO tenant_charges (family_id, property_id, type, title, amount, due_date, note) VALUES (?,?,?,?,?,?,?)')
          .run(prop.family_id, prop.id, 'invoice', `${b.type}${b.note ? ' — ' + b.note : ''}`.slice(0, 120), Number(b.amount), b.date, str(b.note));
      } else if (prop.managed) {
        // a property we administer but do not own: the cost belongs to that property's books, not
        // to this household's. No expenses row, so it never reaches the budget, KPIs or charts.
      } else {
        attributedUser = (num(b.attribute) != null && db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.attribute), prop.family_id))
          ? num(b.attribute) : (prop.owner_id || null);
        const category = b.type === 'utility' ? 'Utilities' : 'Other';
        const ei = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date) VALUES (?,?,?,?,?,?)')
          .run(prop.family_id, attributedUser, category, Number(b.amount), `Property: ${prop.name} — ${b.type}${b.note ? ': ' + b.note : ''}`, b.date);
        expenseId = ei.lastInsertRowid;
      }
    }
    return db.prepare('INSERT INTO property_records (property_id, family_id, type, date, amount, note, user_id, expense_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(prop.id, prop.family_id, b.type, b.date, num(b.amount), str(b.note), attributedUser, expenseId).lastInsertRowid;
  })();
  res.json(db.prepare(`${PR_SELECT} WHERE r.id = ?`).get(rid));
});
app.delete('/api/properties/:pid/records/:rid', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM property_records WHERE id = ? AND family_id = ?').get(req.params.rid, req.user.family_id);
  if (!row) return res.json({ ok: true });
  db.transaction(() => {
    if (row.expense_id) db.prepare('DELETE FROM expenses WHERE id = ? AND family_id = ?').run(row.expense_id, req.user.family_id);
    db.prepare('DELETE FROM property_records WHERE id = ?').run(row.id);
  })();
  res.json({ ok: true });
});

// ---------- tenants & shared charges ----------
// Rent is generated once per month automatically when the property has rent_amount set and a tenant.
function ensureRentCharge(prop) {
  if (!(Number(prop.rent_amount) > 0)) return;
  if (!db.prepare("SELECT id FROM users WHERE role = 'tenant' AND tenant_property_id = ?").get(prop.id)) return;
  const period = new Date().toISOString().slice(0, 7);
  if (db.prepare("SELECT id FROM tenant_charges WHERE property_id = ? AND type = 'rent' AND period = ?").get(prop.id, period)) return;
  db.prepare('INSERT INTO tenant_charges (family_id, property_id, type, title, amount, due_date, period) VALUES (?,?,?,?,?,?,?)')
    .run(prop.family_id, prop.id, 'rent', `Rent ${period}`, Number(prop.rent_amount), monthDate(period, prop.rent_due_day), period);
}
function familyProperty(req) {
  return db.prepare('SELECT * FROM properties WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
}
// "has the tenant paid this month?" — a landlord's first question, and it used to live three
// clicks deep inside the property card. One row per rented property, for the dashboard.
app.get('/api/rent-status', auth, (req, res) => {
  const period = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const p of db.prepare('SELECT * FROM properties WHERE family_id = ? AND rent_amount > 0').all(req.user.family_id)) {
    ensureRentCharge(p); // no-op unless a tenant has actually joined
    const c = db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? AND type = 'rent' AND period = ?").get(p.id, period);
    if (!c) continue; // rent set but nobody renting yet — nothing to chase
    out.push({
      property_id: p.id, property: p.name, amount: c.amount, status: c.status, due_date: c.due_date,
      days_late: c.status !== 'paid' && c.due_date < today ? Math.round((new Date(today) - new Date(c.due_date)) / 86400000) : 0,
    });
  }
  res.json(out);
});

// owner side: tenant info & invite code for a property
app.get('/api/properties/:id/tenant', auth, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const tenants = db.prepare("SELECT id, name, email, created_at FROM users WHERE role = 'tenant' AND tenant_property_id = ?").all(prop.id);
  res.json({ invite_code: prop.tenant_invite_code, tenants });
});
app.post('/api/properties/:id/tenant/invite', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const code = inviteCode();
  db.prepare('UPDATE properties SET tenant_invite_code = ? WHERE id = ?').run(code, prop.id);
  res.json({ invite_code: code });
});
app.delete('/api/properties/:id/tenant/:uid', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const info = db.prepare("DELETE FROM users WHERE id = ? AND role = 'tenant' AND tenant_property_id = ?").run(req.params.uid, prop.id);
  if (!info.changes) return res.status(404).json({ error: 'Tenant not found' });
  res.json({ ok: true });
});

// who to email about tenant matters
function tenantEmails(propId) {
  return db.prepare("SELECT email FROM users WHERE role = 'tenant' AND tenant_property_id = ? AND email IS NOT NULL").all(propId).map((u) => u.email);
}
function propOwnerEmails(prop) {
  if (prop.owner_id) {
    const o = db.prepare('SELECT email FROM users WHERE id = ? AND email IS NOT NULL').get(prop.owner_id);
    if (o) return [o.email];
  }
  return db.prepare("SELECT email FROM users WHERE family_id = ? AND role IN ('admin','adult') AND email IS NOT NULL").all(prop.family_id).map((u) => u.email);
}
function familyCurrency(fid) {
  return db.prepare('SELECT currency FROM families WHERE id = ?').get(fid)?.currency || 'RON';
}
// the app's public address for links inside emails and push notifications. APP_URL overrides
// for local/dev use; production has one known domain, so that is the sane default.
function siteBase() {
  return (process.env.APP_URL || 'https://lafamiliapop.ro').replace(/\/+$/, '');
}
// user-entered text (property names, invoice titles) goes into email HTML too — escape it,
// same reasoning as the client-side XSS hardening, just for the mail-reading surface instead
const htmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a small, inline-styled HTML shell — no external CSS/images, so it survives every mail client
function htmlEmail(bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#eff2f1;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1c2b33;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <div style="font-weight:700;font-size:19px;margin-bottom:16px;">Family<span style="color:#2f6b5a">Hub</span></div>
      ${bodyHtml}
    </div></body></html>`;
}
function htmlButton(href, label, bg) {
  return `<a href="${href}" style="display:inline-block;background:${bg || '#2f6b5a'};color:#ffffff !important;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;font-size:14px;margin:4px 8px 4px 0;">${label}</a>`;
}
// the Revolut wordmark, email-safe (svg/icon fonts are unreliable in mail clients — a styled span survives)
const REVOLUT_BADGE = '<span style="display:inline-block;width:15px;height:15px;background:#0666EB;color:#fff;border-radius:4px;text-align:center;line-height:15px;font-size:11px;font-weight:700;margin-left:7px;vertical-align:-2px;">R</span>';
function notifyMail(to, subject, text, html) {
  if (!process.env.MAIL_FROM || !to.length) return;
  sendMail(to, subject, text, undefined, html).catch((err) => console.error('notify mail:', err.message));
}
// manual "Send reminder" nudges: an in-process cooldown per target so the button can't be spammed
// (same style as the sign-in throttle). Returns minutes left, or 0 if it's clear to send.
const REMIND_COOLDOWN = 15 * 60 * 1000;
const reminderSentAt = new Map();
function remindWait(key) {
  const last = reminderSentAt.get(key);
  if (last && Date.now() - last < REMIND_COOLDOWN) return Math.ceil((REMIND_COOLDOWN - (Date.now() - last)) / 60000);
  return 0;
}
function remindMark(key) { reminderSentAt.set(key, Date.now()); }
// the tenant did something the owner wants to know about now: email + a push pop-up.
// Deliberately no row in `notifications` — that table is reconciled against live deadlines every
// pass, so a one-off event row would be swept straight back out again.
function notifyOwners(prop, subject, mailText, pushBody, opts = {}) {
  notifyMail(propOwnerEmails(prop), subject, mailText, opts.html);
  // everything notifyOwners announces (marked paid, meter reading, maintenance) is tenant-group news
  sendPushToFamily(prop.family_id, { title: subject, body: pushBody || '', url: opts.url || '/#properties', kind: 'tenant_unpaid' }, prop.owner_id).catch(() => {});
}

// owner side: charges shared with the tenant
app.get('/api/properties/:id/charges', auth, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  ensureRentCharge(prop);
  ensureMeterRequests(prop);
  res.json(db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? ORDER BY (status = 'paid'), due_date DESC, id DESC").all(prop.id));
});
app.post('/api/properties/:id/charges', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!['rent', 'invoice'].includes(b.type)) return res.status(400).json({ error: 'Type must be rent or invoice' });
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  if (!okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!isDate(b.due_date)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  const info = db.prepare('INSERT INTO tenant_charges (family_id, property_id, type, title, amount, due_date, note) VALUES (?,?,?,?,?,?,?)')
    .run(prop.family_id, prop.id, b.type, str(b.title), Number(b.amount), b.due_date, str(b.note));
  {
    const cur = familyCurrency(prop.family_id);
    const amountStr = `${Number(b.amount).toFixed(2)} ${cur}`;
    const dueStr = mailDate(b.due_date);
    const invoiceNote = b.type === 'invoice' ? ' and the invoice' : '';
    const site = siteBase();
    // flat link only — Revolut prefills nothing; the tenant types the amount there themselves
    const revolutLine = prop.payment_link ? `Pay via Revolut: ${prop.payment_link}\n` : '';
    notifyMail(tenantEmails(prop.id), `New ${b.type === 'rent' ? 'rent charge' : 'invoice'} for ${prop.name}`,
      `Hello,\n\nA new payment was added for ${prop.name}:\n\n- ${str(b.title)}: ${amountStr}, due ${dueStr}\n\n${revolutLine}Check your invoice: ${site}/\n\nOpen your tenant portal to see the details${invoiceNote}, and press "Mark as paid" once you've paid it.\n`,
      htmlEmail(`
        <p>Hello,</p>
        <p>A new payment was added for <b>${htmlEsc(prop.name)}</b>:</p>
        <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">
          <b>${htmlEsc(str(b.title))}</b><br><span style="font-family:monospace;font-size:15px;">${amountStr}</span> · due ${dueStr}
        </div>
        <p>
          ${prop.payment_link ? htmlButton(htmlEsc(prop.payment_link), `Pay via Revolut${REVOLUT_BADGE}`, '#0666EB') : ''}
          ${htmlButton(`${site}/`, 'Check your invoice')}
        </p>
        <p style="color:#45565f;font-size:13px;">Open your tenant portal to see the details${invoiceNote}, and press "Mark as paid" once you've paid it.</p>
      `));
  }
  res.json(db.prepare('SELECT * FROM tenant_charges WHERE id = ?').get(info.lastInsertRowid));
});
// owner nudges the tenant about anything still needing them: unpaid charges (payable email with
// the Revolut + invoice buttons) and/or pending meter readings
app.post('/api/properties/:id/tenant/remind', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  ensureRentCharge(prop);
  const to = tenantEmails(prop.id);
  if (!to.length) return res.status(400).json({ error: 'No tenant with an email has joined yet' });
  const unpaid = db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? AND status = 'unpaid' ORDER BY due_date").all(prop.id);
  const meters = db.prepare("SELECT * FROM meter_requests WHERE property_id = ? AND status = 'pending'").all(prop.id);
  if (!unpaid.length && !meters.length) return res.status(400).json({ error: "Nothing needs the tenant's attention right now" });
  const wait = remindWait(`rt:${prop.id}`);
  if (wait) return res.status(429).json({ error: `Reminder already sent — try again in ${wait} minute${wait === 1 ? '' : 's'}` });
  const cur = familyCurrency(prop.family_id);
  const total = unpaid.reduce((s, c) => s + c.amount, 0);
  const groups = byLanguage(db.prepare("SELECT email, lang FROM users WHERE role = 'tenant' AND tenant_property_id = ? AND email IS NOT NULL").all(prop.id));
  for (const [lang, addrs] of Object.entries(groups)) {
    const ro = lang === 'ro';
    if (unpaid.length) {
      const m = tenantChargesMail(lang, prop, unpaid, total, cur, { manual: true });
      // fold a pending-meter line into the same email so the tenant gets one nudge, not two
      const meterNote = meters.length ? (ro ? `De trimis și citirile de contor: ${meters.map((x) => x.utility).join(', ')}.` : `Also please send your meter readings: ${meters.map((x) => x.utility).join(', ')}.`) : '';
      notifyMail(addrs, m.subject, meterNote ? `${m.text}\n${meterNote}\n` : m.text,
        meterNote ? m.html.replace('</div></body>', `<p style="color:#45565f;font-size:13px;">${htmlEsc(meterNote)}</p></div></body>`) : m.html);
    } else {
      const utils = meters.map((x) => x.utility).join(', ');
      notifyMail(addrs,
        ro ? `Citiri de contor pentru ${prop.name}` : `Meter readings for ${prop.name}`,
        ro ? `Bună,\n\nUn memento: te rugăm să trimiți citirile de contor pentru ${prop.name} (${utils}).\n\n${siteBase()}/\n`
          : `Hello,\n\nA reminder: please send the meter readings for ${prop.name} (${utils}).\n\n${siteBase()}/\n`,
        htmlEmail(`<p>${ro ? 'Bună,' : 'Hello,'}</p><p>${ro ? 'Un memento: te rugăm să trimiți citirile de contor pentru' : 'A reminder: please send the meter readings for'} <b>${htmlEsc(prop.name)}</b> (${htmlEsc(utils)}).</p>
          <p>${htmlButton(`${siteBase()}/`, ro ? 'Deschide portalul' : 'Open your tenant portal')}</p>`));
    }
  }
  remindMark(`rt:${prop.id}`);
  res.json({ ok: true });
});
// invoice file on a tenant charge (owner uploads, tenant can view)
app.post('/api/properties/:id/charges/:cid/attachment', auth, canWrite, upload.single('file'), (req, res) => {
  const prop = familyProperty(req);
  const ch = prop && db.prepare('SELECT * FROM tenant_charges WHERE id = ? AND property_id = ?').get(req.params.cid, prop.id);
  if (!ch) return res.status(404).json({ error: 'Charge not found' });
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (ch.attachment) { try { fs.unlinkSync(path.join(UPLOAD_DIR, ch.attachment)); } catch {} }
  db.prepare('UPDATE tenant_charges SET attachment = ? WHERE id = ?').run(req.file.filename, ch.id);
  res.json({ attachment: req.file.filename });
});
app.get('/api/properties/:id/charges/:cid/attachment', auth, (req, res) => {
  const prop = familyProperty(req);
  const ch = prop && db.prepare('SELECT * FROM tenant_charges WHERE id = ? AND property_id = ?').get(req.params.cid, prop.id);
  if (!ch || !ch.attachment) return res.status(404).json({ error: 'No attachment' });
  res.sendFile(path.join(UPLOAD_DIR, ch.attachment));
});
// owner confirms a payment the tenant marked (or records one directly);
// confirmed rent is logged as property income so the spent/income summary stays true
app.post('/api/properties/:id/charges/:cid/confirm', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const ch = db.prepare('SELECT * FROM tenant_charges WHERE id = ? AND property_id = ?').get(req.params.cid, prop.id);
  if (!ch) return res.status(404).json({ error: 'Charge not found' });
  if (ch.status === 'paid') return res.status(400).json({ error: 'Already confirmed' });
  const today = new Date().toISOString().slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare("UPDATE tenant_charges SET status = 'paid', confirmed_at = ? WHERE id = ?").run(today, ch.id);
    if (ch.type === 'rent') {
      db.prepare('INSERT INTO property_records (property_id, family_id, type, date, amount, note) VALUES (?,?,?,?,?,?)')
        .run(prop.id, prop.family_id, 'rent', today, ch.amount, ch.title);
    }
  });
  tx();
  res.json({ ok: true });
});
app.post('/api/properties/:id/charges/:cid/reject', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const info = db.prepare("UPDATE tenant_charges SET status = 'unpaid', marked_paid_at = NULL WHERE id = ? AND property_id = ? AND status = 'pending'")
    .run(req.params.cid, prop.id);
  if (!info.changes) return res.status(404).json({ error: 'No pending payment to reject' });
  res.json({ ok: true });
});
app.delete('/api/properties/:id/charges/:cid', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const info = db.prepare('DELETE FROM tenant_charges WHERE id = ? AND property_id = ?').run(req.params.cid, prop.id);
  if (!info.changes) return res.status(404).json({ error: 'Charge not found' });
  res.json({ ok: true });
});

// ---------- meter reading requests ----------
const METER_UTILITIES = ['electricity', 'gas', 'water'];
// scheduled readings: once per month on/after reading_day, create a request per configured utility and email the tenant
// each entry of reading_utilities is "utility:day"; a bare "utility" falls back to reading_day
function readingSchedule(prop) {
  const def = Number(prop.reading_day) || 0;
  return String(prop.reading_utilities || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((entry) => { const [u, d] = entry.split(':'); return { util: (u || '').trim(), day: Number(d) || def }; })
    .filter((x) => METER_UTILITIES.includes(x.util) && x.day >= 1);
}
function ensureMeterRequests(prop) {
  const sched = readingSchedule(prop);
  if (!sched.length) return;
  if (!db.prepare("SELECT id FROM users WHERE role = 'tenant' AND tenant_property_id = ?").get(prop.id)) return;
  const period = new Date().toISOString().slice(0, 7);
  const todayISO = new Date().toISOString().slice(0, 10);
  const created = [];
  for (const { util: u, day } of sched) {
    // each meter fires on its own day; a 31st fires on the 30th in a 30-day month, not never
    if (todayISO < monthDate(period, day)) continue;
    if (db.prepare('SELECT id FROM meter_requests WHERE property_id = ? AND utility = ? AND period = ?').get(prop.id, u, period)) continue;
    db.prepare('INSERT INTO meter_requests (family_id, property_id, utility, period) VALUES (?,?,?,?)').run(prop.family_id, prop.id, u, period);
    created.push(u);
  }
  if (created.length) {
    const plural = created.length > 1 ? 's' : '';
    notifyMail(tenantEmails(prop.id), `Meter reading needed for ${prop.name}`,
      `Hello,\n\nPlease send this month's meter reading${plural} for ${prop.name}: ${created.join(', ')}.\n\nOpen your tenant portal and type the value or upload a photo of the meter:\n${siteBase()}/\n`,
      htmlEmail(`<p>Hello,</p><p>Please send this month's meter reading${plural} for <b>${htmlEsc(prop.name)}</b>: ${htmlEsc(created.join(', '))}.</p>
        <p>${htmlButton(`${siteBase()}/`, 'Open your tenant portal')}</p>
        <p style="color:#45565f;font-size:13px;">Type the value or upload a photo of the meter there.</p>`));
  }
}
// owner: request a reading now, list and manage requests
app.post('/api/properties/:id/meter-request', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const u = String(req.body?.utility || '');
  if (!METER_UTILITIES.includes(u)) return res.status(400).json({ error: 'Utility must be electricity, gas or water' });
  const info = db.prepare('INSERT INTO meter_requests (family_id, property_id, utility) VALUES (?,?,?)').run(prop.family_id, prop.id, u);
  notifyMail(tenantEmails(prop.id), `Meter reading needed for ${prop.name}`,
    `Hello,\n\nPlease send the current ${u} meter reading for ${prop.name}.\n\nOpen your tenant portal and type the value or upload a photo of the meter:\n${siteBase()}/\n`,
    htmlEmail(`<p>Hello,</p><p>Please send the current <b>${htmlEsc(u)}</b> meter reading for <b>${htmlEsc(prop.name)}</b>.</p>
      <p>${htmlButton(`${siteBase()}/`, 'Open your tenant portal')}</p>
      <p style="color:#45565f;font-size:13px;">Type the value or upload a photo of the meter there.</p>`));
  res.json(db.prepare('SELECT * FROM meter_requests WHERE id = ?').get(info.lastInsertRowid));
});
app.get('/api/properties/:id/meter-requests', auth, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  ensureMeterRequests(prop);
  res.json(db.prepare("SELECT * FROM meter_requests WHERE property_id = ? ORDER BY (status = 'done'), id DESC LIMIT 60").all(prop.id));
});
app.delete('/api/properties/:id/meter-requests/:rid', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare('SELECT * FROM meter_requests WHERE id = ? AND property_id = ?').get(req.params.rid, prop.id);
  if (row?.photo) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.photo)); } catch {} }
  db.prepare('DELETE FROM meter_requests WHERE id = ? AND property_id = ?').run(req.params.rid, prop.id);
  res.json({ ok: true });
});
app.get('/api/properties/:id/meter-requests/:rid/photo', auth, (req, res) => {
  const prop = familyProperty(req);
  const row = prop && db.prepare('SELECT * FROM meter_requests WHERE id = ? AND property_id = ?').get(req.params.rid, prop.id);
  if (!row || !row.photo) return res.status(404).json({ error: 'No photo' });
  res.sendFile(path.join(UPLOAD_DIR, row.photo));
});

// owner side: maintenance the tenant reported
const MAINT_SELECT = 'SELECT m.*, u.name AS reported_by FROM maintenance_requests m LEFT JOIN users u ON u.id = m.user_id';
app.get('/api/properties/:id/maintenance', auth, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare(`${MAINT_SELECT} WHERE m.property_id = ? ORDER BY (m.status = 'done'), m.id DESC`).all(prop.id));
});
app.post('/api/properties/:id/maintenance/:rid/resolve', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  const row = prop && db.prepare('SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ?').get(req.params.rid, prop.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const done = row.status !== 'done';
  db.prepare('UPDATE maintenance_requests SET status = ?, resolved_at = ? WHERE id = ?')
    .run(done ? 'done' : 'open', done ? new Date().toISOString().slice(0, 10) : null, row.id);
  // tell the tenant their report was dealt with
  if (done) notifyMail(tenantEmails(prop.id), `Maintenance sorted — ${prop.name}`,
    `Hello,\n\nYour maintenance report for ${prop.name} was marked as done:\n\n- ${row.title}\n\nIf it is not actually fixed, open your tenant portal and report it again:\n${siteBase()}/\n`,
    htmlEmail(`<p>Hello,</p><p>Your maintenance report for <b>${htmlEsc(prop.name)}</b> was marked as done:</p>
      <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;"><b>${htmlEsc(row.title)}</b></div>
      <p>${htmlButton(`${siteBase()}/`, 'Open your tenant portal')}</p>
      <p style="color:#45565f;font-size:13px;">If it is not actually fixed, report it again there.</p>`));
  res.json({ ok: true });
});
app.delete('/api/properties/:id/maintenance/:rid', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  const row = prop && db.prepare('SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ?').get(req.params.rid, prop.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.photo) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.photo)); } catch {} }
  db.prepare('DELETE FROM maintenance_requests WHERE id = ?').run(row.id);
  res.json({ ok: true });
});
app.get('/api/properties/:id/maintenance/:rid/photo', auth, (req, res) => {
  const prop = familyProperty(req);
  const row = prop && db.prepare('SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ?').get(req.params.rid, prop.id);
  if (!row || !row.photo) return res.status(404).json({ error: 'No photo' });
  res.sendFile(path.join(UPLOAD_DIR, row.photo));
});

// tenant side: the only data a tenant account can reach
function tenantProp(req) { return db.prepare('SELECT * FROM properties WHERE id = ?').get(req.user.tenant_property_id); }
function meterDone(req, res, row, prop, readingText) {
  db.prepare("UPDATE meter_requests SET status = 'done', provided_at = ? WHERE id = ?").run(new Date().toISOString().slice(0, 10), row.id);
  notifyOwners(prop, `Meter reading received — ${prop.name} (${row.utility})`,
    `Hello,\n\n${req.user.name} sent the ${row.utility} reading for ${prop.name}:\n\n${readingText}\n\nOpen Family Hub to see it:\n${siteBase()}/#properties\n`,
    `${req.user.name} sent the ${row.utility} reading — ${readingText}`,
    { html: htmlEmail(`<p>Hello,</p><p><b>${htmlEsc(req.user.name)}</b> sent the <b>${htmlEsc(row.utility)}</b> reading for <b>${htmlEsc(prop.name)}</b>:</p>
      <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">${htmlEsc(readingText)}</div>
      <p>${htmlButton(`${siteBase()}/#properties`, 'Open Properties')}</p>`) });
  res.json({ ok: true });
}
app.get('/api/tenant/charges', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const prop = tenantProp(req);
  if (!prop) return res.status(404).json({ error: 'Your rental is no longer registered — contact the owner' });
  ensureRentCharge(prop);
  ensureMeterRequests(prop);
  const charges = db.prepare("SELECT id, type, title, amount, due_date, status, marked_paid_at, confirmed_at, attachment, note FROM tenant_charges WHERE property_id = ? ORDER BY (status = 'paid'), due_date DESC, id DESC").all(prop.id);
  const meters = db.prepare("SELECT id, utility, status, reading, provided_at, requested_at FROM meter_requests WHERE property_id = ? ORDER BY (status = 'done'), id DESC LIMIT 20").all(prop.id);
  const maintenance = db.prepare("SELECT id, title, note, photo, status, created_at, resolved_at, reopened_at, reopen_note FROM maintenance_requests WHERE property_id = ? ORDER BY (status = 'done'), id DESC LIMIT 20").all(prop.id);
  const fam = db.prepare('SELECT currency FROM families WHERE id = ?').get(prop.family_id);
  res.json({ property: { name: prop.name, address: prop.address, payment_link: prop.payment_link, currency: fam?.currency || 'RON' }, charges, meters, maintenance });
});
app.get('/api/tenant/charges/:cid/attachment', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const ch = db.prepare('SELECT * FROM tenant_charges WHERE id = ? AND property_id = ?').get(req.params.cid, req.user.tenant_property_id);
  if (!ch || !ch.attachment) return res.status(404).json({ error: 'No attachment' });
  res.sendFile(path.join(UPLOAD_DIR, ch.attachment));
});
app.post('/api/tenant/charges/:cid/pay', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const ch = db.prepare("SELECT * FROM tenant_charges WHERE id = ? AND property_id = ? AND status = 'unpaid'").get(req.params.cid, req.user.tenant_property_id);
  if (!ch) return res.status(404).json({ error: 'Charge not found or already marked' });
  db.prepare("UPDATE tenant_charges SET status = 'pending', marked_paid_at = ? WHERE id = ?").run(new Date().toISOString().slice(0, 10), ch.id);
  const prop = tenantProp(req);
  if (prop) {
    const cur = familyCurrency(prop.family_id);
    const amountStr = `${Number(ch.amount).toFixed(2)} ${cur}`;
    notifyOwners(prop, `Payment marked as paid — ${prop.name}`,
      `Hello,\n\n${req.user.name} marked this as paid for ${prop.name}:\n\n- ${ch.title}: ${amountStr}, due ${mailDate(ch.due_date)}\n\nOpen Family Hub to confirm (or reject) it:\n${siteBase()}/#properties\n`,
      `${req.user.name} paid ${ch.title} — ${amountStr}. Confirm it in Family Hub.`,
      { html: htmlEmail(`<p>Hello,</p><p><b>${htmlEsc(req.user.name)}</b> marked this as paid for <b>${htmlEsc(prop.name)}</b>:</p>
        <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">
          <b>${htmlEsc(ch.title)}</b><br><span style="font-family:monospace;font-size:15px;">${amountStr}</span> · due ${mailDate(ch.due_date)}
        </div>
        <p>${htmlButton(`${siteBase()}/#properties`, 'Confirm the payment')}</p>`) });
  }
  res.json({ ok: true });
});
// tenant answers a meter request with a typed value and/or a photo
app.post('/api/tenant/meter/:rid', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const row = db.prepare("SELECT * FROM meter_requests WHERE id = ? AND property_id = ? AND status = 'pending'").get(req.params.rid, req.user.tenant_property_id);
  if (!row) return res.status(404).json({ error: 'Request not found or already answered' });
  const reading = str(req.body?.reading);
  if (!reading) return res.status(400).json({ error: 'Type the meter value' });
  db.prepare('UPDATE meter_requests SET reading = ? WHERE id = ?').run(reading, row.id);
  meterDone(req, res, row, tenantProp(req), `Reading: ${reading}`);
});
// tenant reports something that needs fixing (+ optional photo, uploaded right after)
app.post('/api/tenant/maintenance', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const prop = tenantProp(req);
  if (!prop) return res.status(404).json({ error: 'Your rental is no longer registered — contact the owner' });
  const title = str(req.body?.title);
  if (!title) return res.status(400).json({ error: 'Describe what needs fixing' });
  const info = db.prepare('INSERT INTO maintenance_requests (family_id, property_id, user_id, title, note) VALUES (?,?,?,?,?)')
    .run(prop.family_id, prop.id, req.user.id, title, str(req.body?.note));
  {
    const note = req.body?.note ? str(req.body.note) : '';
    notifyOwners(prop, `Maintenance requested — ${prop.name}`,
      `Hello,\n\n${req.user.name} reported a problem at ${prop.name}:\n\n- ${title}${note ? `\n\n${note}` : ''}\n\nOpen Family Hub to see it (and the photo, if one was attached):\n${siteBase()}/#properties\n`,
      `${req.user.name}: ${title}`,
      { html: htmlEmail(`<p>Hello,</p><p><b>${htmlEsc(req.user.name)}</b> reported a problem at <b>${htmlEsc(prop.name)}</b>:</p>
        <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">
          <b>${htmlEsc(title)}</b>${note ? `<br>${htmlEsc(note)}` : ''}
        </div>
        <p>${htmlButton(`${siteBase()}/#properties`, 'Open Properties')}</p>
        <p style="color:#45565f;font-size:13px;">See the photo there, if one was attached.</p>`) });
  }
  res.json(db.prepare('SELECT * FROM maintenance_requests WHERE id = ?').get(info.lastInsertRowid));
});
app.post('/api/tenant/maintenance/:rid/photo', auth, upload.single('file'), (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const row = db.prepare('SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ? AND user_id = ?')
    .get(req.params.rid, req.user.tenant_property_id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (!req.file) return res.status(400).json({ error: 'No photo received' });
  if (row.photo) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.photo)); } catch {} }
  db.prepare('UPDATE maintenance_requests SET photo = ? WHERE id = ?').run(req.file.filename, row.id);
  res.json({ photo: req.file.filename });
});
app.get('/api/tenant/maintenance/:rid/photo', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const row = db.prepare('SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ?').get(req.params.rid, req.user.tenant_property_id);
  if (!row || !row.photo) return res.status(404).json({ error: 'No photo' });
  res.sendFile(path.join(UPLOAD_DIR, row.photo));
});
// the owner marked it done but it is not actually fixed — the tenant reopens the SAME ticket rather
// than filing a fresh one, so the history and photo stay attached to the original report
app.post('/api/tenant/maintenance/:rid/reopen', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const prop = tenantProp(req);
  const row = prop && db.prepare("SELECT * FROM maintenance_requests WHERE id = ? AND property_id = ? AND status = 'done'").get(req.params.rid, prop.id);
  if (!row) return res.status(404).json({ error: 'Request not found or not marked as fixed' });
  const note = str(req.body?.note);
  db.prepare("UPDATE maintenance_requests SET status = 'open', resolved_at = NULL, reopened_at = ?, reopen_note = ? WHERE id = ?")
    .run(new Date().toISOString().slice(0, 10), note || null, row.id);
  notifyOwners(prop, `Maintenance reopened — ${prop.name}`,
    `Hello,\n\n${req.user.name} reopened a report at ${prop.name} — it is not actually fixed:\n\n- ${row.title}${note ? `\n\n"${note}"` : ''}\n\nOpen Family Hub to see it:\n${siteBase()}/#properties\n`,
    `${req.user.name} reopened: ${row.title}`,
    { html: htmlEmail(`<p>Hello,</p><p><b>${htmlEsc(req.user.name)}</b> reopened a report at <b>${htmlEsc(prop.name)}</b> — it is not actually fixed:</p>
      <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">
        <b>${htmlEsc(row.title)}</b>${note ? `<br><span style="color:#45565f">${htmlEsc(note)}</span>` : ''}
      </div>
      <p>${htmlButton(`${siteBase()}/#properties`, 'Open Properties')}</p>`) });
  res.json({ ok: true });
});
// tenant nudges the owner about anything waiting on THEM: payments marked paid but not yet
// confirmed, and maintenance still open. Owner-facing, so English + a push (respects the owner's
// alert prefs via notifyOwners).
app.post('/api/tenant/remind', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const prop = tenantProp(req);
  if (!prop) return res.status(404).json({ error: 'Your rental is no longer registered — contact the owner' });
  const pending = db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? AND status = 'pending' ORDER BY due_date").all(prop.id);
  const open = db.prepare("SELECT * FROM maintenance_requests WHERE property_id = ? AND status = 'open' ORDER BY id DESC").all(prop.id);
  if (!pending.length && !open.length) return res.status(400).json({ error: 'Nothing is waiting on the owner right now' });
  const wait = remindWait(`to:${prop.id}`);
  if (wait) return res.status(429).json({ error: `Reminder already sent — try again in ${wait} minute${wait === 1 ? '' : 's'}` });
  const cur = familyCurrency(prop.family_id);
  const parts = [], htmlParts = [];
  if (pending.length) {
    parts.push(`Payments marked as paid, waiting for you to confirm:\n${pending.map((c) => `- ${c.title}: ${Number(c.amount).toFixed(2)} ${cur}, due ${mailDate(c.due_date)}`).join('\n')}`);
    htmlParts.push(`<p><b>Payments marked as paid, waiting for you to confirm:</b></p>${pending.map((c) => `<div style="margin:6px 0;padding:10px 14px;background:#eff2f1;border-radius:8px;"><b>${htmlEsc(c.title)}</b><br><span style="font-family:monospace">${Number(c.amount).toFixed(2)} ${cur}</span> · due ${mailDate(c.due_date)}</div>`).join('')}`);
  }
  if (open.length) {
    parts.push(`Maintenance still open:\n${open.map((m) => `- ${m.title}`).join('\n')}`);
    htmlParts.push(`<p><b>Maintenance still open:</b></p>${open.map((m) => `<div style="margin:6px 0;padding:10px 14px;background:#eff2f1;border-radius:8px;"><b>${htmlEsc(m.title)}</b>${m.note ? `<br>${htmlEsc(m.note)}` : ''}</div>`).join('')}`);
  }
  const subject = `Reminder from ${req.user.name} — ${prop.name}`;
  notifyOwners(prop, subject,
    `Hello,\n\n${req.user.name} is waiting on you for ${prop.name}:\n\n${parts.join('\n\n')}\n\nOpen Family Hub:\n${siteBase()}/#tenants\n`,
    `${req.user.name}: ${pending.length ? `${pending.length} payment${pending.length === 1 ? '' : 's'} to confirm` : ''}${pending.length && open.length ? ', ' : ''}${open.length ? `${open.length} open request${open.length === 1 ? '' : 's'}` : ''}`,
    { url: '/#tenants', html: htmlEmail(`<p>Hello,</p><p><b>${htmlEsc(req.user.name)}</b> is waiting on you for <b>${htmlEsc(prop.name)}</b>:</p>${htmlParts.join('')}<p>${htmlButton(`${siteBase()}/#tenants`, 'Open Family Hub')}</p>`) });
  remindMark(`to:${prop.id}`);
  res.json({ ok: true });
});
app.post('/api/tenant/meter/:rid/photo', auth, upload.single('file'), (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const row = db.prepare("SELECT * FROM meter_requests WHERE id = ? AND property_id = ? AND status = 'pending'").get(req.params.rid, req.user.tenant_property_id);
  if (!row) return res.status(404).json({ error: 'Request not found or already answered' });
  if (!req.file) return res.status(400).json({ error: 'No photo received' });
  db.prepare('UPDATE meter_requests SET photo = ? WHERE id = ?').run(req.file.filename, row.id);
  meterDone(req, res, row, tenantProp(req), 'A photo of the meter was uploaded (see it in the app).');
});

// next upcoming occurrence of a yearly date (birthday): this year if still ahead, else next year
function nextBirthday(bday) {
  const [, mm, dd] = String(bday).split('-');
  if (!mm || !dd) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const y = Number(todayStr.slice(0, 4));
  const thisYear = `${y}-${mm}-${dd}`;
  return thisYear >= todayStr ? thisYear : `${y + 1}-${mm}-${dd}`;
}

// ---------- family lists (wishlists, groceries, personal targets) ----------
const LIST_KINDS = ['buy', 'travel', 'grocery', 'targets', 'baptism'];
app.get('/api/lists', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, u.name AS user_name FROM list_items l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.family_id = ? ORDER BY l.done, l.id DESC
  `).all(req.user.family_id));
});
app.post('/api/lists', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!LIST_KINDS.includes(b.list)) return res.status(400).json({ error: 'Unknown list' });
  if (!str(b.title)) return res.status(400).json({ error: 'Write what it is first' });
  let uid = num(b.user_id);
  if (uid != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(uid, req.user.family_id)) {
    return res.status(400).json({ error: 'Person must be a member of the family' });
  }
  if (uid == null) uid = req.user.id;
  // head counts only mean anything on a guest list, and a negative one never does
  const headCount = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
  const info = db.prepare('INSERT INTO list_items (family_id, list, title, note, amount, user_id, adults, kids, rsvp) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.user.family_id, b.list, str(b.title), str(b.note), num(b.amount), uid,
      headCount(b.adults), headCount(b.kids), ['yes', 'no'].includes(b.rsvp) ? b.rsvp : null);
  res.json(db.prepare('SELECT * FROM list_items WHERE id = ?').get(info.lastInsertRowid));
});
// A guest either answered or hasn't; sending the same answer again clears it, so a mis-tap is one
// tap to undo rather than a dead end.
app.post('/api/lists/:id/rsvp', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM list_items WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const want = ['yes', 'no'].includes(req.body?.rsvp) ? req.body.rsvp : null;
  const next = row.rsvp === want ? null : want;
  db.prepare('UPDATE list_items SET rsvp = ? WHERE id = ?').run(next, row.id);
  res.json({ ok: true, rsvp: next });
});
// the gift a guest brought, recorded after the fact
app.post('/api/lists/:id/gift', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT id FROM list_items WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const amount = req.body?.amount === '' || req.body?.amount == null ? null : num(req.body.amount);
  if (amount != null && !(amount >= 0)) return res.status(400).json({ error: 'Gift must be 0 or more' });
  db.prepare('UPDATE list_items SET amount = ?, note = COALESCE(?, note) WHERE id = ?')
    .run(amount, req.body?.note !== undefined ? str(req.body.note) : null, row.id);
  res.json({ ok: true });
});
app.post('/api/lists/:id/toggle', auth, canWrite, (req, res) => {
  const info = db.prepare('UPDATE list_items SET done = 1 - done WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/lists/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM list_items WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true });
});

// ---------- reminders (aggregated deadlines) ----------
function collectReminders(fid, horizon, scopeUserId = null) {
  const items = [];
  // priority: birthdays, cars & documents rank above property, above bills (tiebreaker on same date)
  const PRIO = { birthday: 3, document: 3, rca: 3, casco: 3, vignette: 3, itp: 3, road_tax: 3, tenant_unpaid: 2, property_insurance: 2, property_tax: 2, bill: 1 };
  const push = (kind, label, entity, date, id, owner, extra) => {
    if (!date) return;
    items.push({ kind, label, entity, date, ref_id: id, owner_id: owner ?? null, priority: PRIO[kind] || 1, ...extra });
  };
  for (const b of db.prepare("SELECT * FROM bills WHERE family_id = ? AND status = 'unpaid'").all(fid)) {
    // auto_pay travels with the item so the UI can show it without the "needs you" colour
    push('bill', b.name, b.provider || b.category, b.due_date, b.id, b.owner_id, { amount: b.amount, auto_pay: b.auto_pay });
  }
  // a document tied to an entity slot (e.g. property PAD) replaces that field's reminder — no duplicates
  const covered = new Set();
  for (const d of db.prepare("SELECT property_id, vehicle_id, slot FROM documents WHERE family_id = ? AND slot IS NOT NULL AND expiry_date IS NOT NULL").all(fid)) {
    if (d.property_id) covered.add(`property:${d.property_id}:${d.slot}`);
    if (d.vehicle_id) covered.add(`vehicle:${d.vehicle_id}:${d.slot}`);
  }
  const vpush = (id, slot, kind, label, entity, date, owner) => { if (!covered.has(`vehicle:${id}:${slot}`)) push(kind, label, entity, date, id, owner); };
  const ppush = (id, slot, kind, label, entity, date, owner) => { if (!covered.has(`property:${id}:${slot}`)) push(kind, label, entity, date, id, owner); };
  for (const v of db.prepare('SELECT * FROM vehicles WHERE family_id = ?').all(fid)) {
    vpush(v.id, 'rca_expiry', 'rca', 'RCA insurance', v.name, v.rca_expiry, v.owner_id);
    vpush(v.id, 'casco_expiry', 'casco', 'Casco insurance', v.name, v.casco_expiry, v.owner_id);
    vpush(v.id, 'vignette_expiry', 'vignette', 'Rovinieta (vignette)', v.name, v.vignette_expiry, v.owner_id);
    vpush(v.id, 'itp_expiry', 'itp', 'ITP inspection', v.name, v.itp_expiry, v.owner_id);
    vpush(v.id, 'road_tax_due', 'road_tax', 'Vehicle tax', v.name, v.road_tax_due, v.owner_id);
  }
  for (const p of db.prepare('SELECT * FROM properties WHERE family_id = ?').all(fid)) {
    ppush(p.id, 'insurance_expiry', 'property_insurance', 'Property insurance (PAD)', p.name, p.insurance_expiry, p.owner_id);
    ppush(p.id, 'insurance2_expiry', 'property_insurance', 'Additional home insurance', p.name, p.insurance2_expiry, p.owner_id);
    ppush(p.id, 'property_tax_due', 'property_tax', 'Property tax', p.name, p.property_tax_due, p.owner_id);
  }
  for (const d of db.prepare(`${DOC_SELECT} WHERE d.family_id = ? AND d.expiry_date IS NOT NULL`).all(fid)) {
    push('document', `Act: ${d.name}`, d.person_name || d.vehicle_name || d.property_name || 'Family', d.expiry_date, d.id, d.user_id);
  }
  // charges the tenant has not paid past their due date — the owner has to chase them.
  // only overdue ones surface: an upcoming rent charge is the tenant's business, not a family deadline.
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const c of db.prepare(`
    SELECT c.*, p.name AS property_name, p.owner_id FROM tenant_charges c
    JOIN properties p ON p.id = c.property_id
    WHERE c.family_id = ? AND c.status = 'unpaid' AND c.due_date < ?
  `).all(fid, todayISO)) {
    // property_id travels too: ref_id is the charge, but the useful place to land is the property's
    // own dashboard, which is where you confirm the payment
    push('tenant_unpaid', `${c.title} — unpaid by tenant`, c.property_name, c.due_date, c.id, c.owner_id, { amount: c.amount, property_id: c.property_id });
  }
  // birthdays repeat yearly; show the next upcoming one. Family-wide (owner null) so everyone is reminded.
  for (const u of db.prepare("SELECT id, name, birthday FROM users WHERE family_id = ? AND role != 'tenant' AND birthday IS NOT NULL AND birthday != ''").all(fid)) {
    push('birthday', `🎂 ${u.name}'s birthday`, '', nextBirthday(u.birthday), u.id, null);
  }
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(Date.now() + horizon * 86400000).toISOString().slice(0, 10);
  let out = items.filter((i) => i.date <= limit);
  // person scope: a member sees only what they're responsible for, plus family-wide (unowned) items
  if (scopeUserId != null) out = out.filter((i) => i.owner_id == null || i.owner_id === scopeUserId);
  return out
    .map((i) => ({ ...i, days_left: Math.ceil((new Date(i.date) - new Date(today)) / 86400000) }))
    .sort((a, b) => a.date.localeCompare(b.date) || b.priority - a.priority);
}
app.get('/api/reminders', auth, (req, res) => {
  const horizon = Math.min(Number(req.query.days) || 60, 365);
  // ?user=me limits to what the signed-in member is responsible for (admins may pass a member id)
  let scope = null;
  if (req.query.user === 'me' && req.user.role !== 'admin') scope = req.user.id;
  else if (req.query.user && req.query.user !== 'all' && !isNaN(Number(req.query.user))) scope = Number(req.query.user);
  res.json(collectReminders(req.user.family_id, horizon, scope));
});

// ---------- calendar (iCal feed + subscribe link) ----------
app.get('/api/calendar/info', auth, (req, res) => {
  const fam = db.prepare('SELECT cal_token FROM families WHERE id = ?').get(req.user.family_id);
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ url: fam?.cal_token ? `${base}/calendar/${fam.cal_token}.ics` : null });
});
app.post('/api/calendar/token', auth, canWrite, (req, res) => {
  const token = crypto.randomBytes(20).toString('hex');
  db.prepare('UPDATE families SET cal_token = ? WHERE id = ?').run(token, req.user.family_id);
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ url: `${base}/calendar/${token}.ics` });
});
// public-by-token feed for Google/Apple Calendar subscriptions
app.get('/calendar/:token.ics', (req, res) => {
  const fam = db.prepare('SELECT * FROM families WHERE cal_token = ?').get(req.params.token);
  if (!fam) return res.status(404).send('Not found');
  const escICS = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Hub//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:Family Hub — ${escICS(fam.name)}`];
  for (const r of collectReminders(fam.id, 365)) {
    lines.push('BEGIN:VEVENT',
      `UID:fh-${r.kind}-${r.ref_id}-${r.date}@familyhub`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${r.date.replace(/-/g, '')}`,
      `SUMMARY:${escICS(r.label + (r.entity ? ` — ${r.entity}` : ''))}`,
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.send(lines.join('\r\n') + '\r\n');
});

// ---------- web push ----------
let _webpush = null, VAPID_KEYS = null;
function getWebPush() {
  if (_webpush) return _webpush;
  const wp = require('web-push');
  const f = path.join(DATA_DIR, '.vapid.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(wp.generateVAPIDKeys()), { mode: 0o600 });
  VAPID_KEYS = JSON.parse(fs.readFileSync(f, 'utf8'));
  const contact = String(process.env.MAIL_FROM || '').match(/[^\s<>]+@[^\s<>]+/)?.[0] || 'admin@example.com';
  wp.setVapidDetails('mailto:' + contact, VAPID_KEYS.publicKey, VAPID_KEYS.privateKey);
  _webpush = wp;
  return wp;
}
// push a payload to every subscribed device of the family (owner-scoped alerts go to admins + the owner)
async function sendPushToFamily(fid, payload, ownerId = null) {
  let wp; try { wp = getWebPush(); } catch { return; }
  let subs = db.prepare('SELECT s.*, u.role, u.lang, u.notif_muted, u.quiet_start, u.quiet_end FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.family_id = ?').all(fid);
  if (ownerId != null) subs = subs.filter((s) => s.role === 'admin' || s.user_id === ownerId);
  // per-member preferences: muted alert groups drop the push, quiet hours hold everything back
  const group = GROUP_OF_KIND[payload.kind];
  subs = subs.filter((s) => !(group && mutedSet(s).has(group)) && !inQuietHours(s.quiet_start, s.quiet_end)
    && !(payload.item && snoozedItems(s.user_id).has(payload.item))); // snoozed for them = no buzz either
  const { i18n, ...shared } = payload; // i18n is rendered per device, never sent as-is
  for (const s of subs) {
    const body = i18n ? { ...shared, ...alertText(s.lang === 'ro' ? 'ro' : 'en', i18n) } : shared;
    try { await wp.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json) }, JSON.stringify(body)); }
    catch (err) { if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); }
  }
}
app.get('/api/push/key', auth, (req, res) => {
  try { getWebPush(); res.json({ key: VAPID_KEYS.publicKey }); }
  catch (err) { res.status(500).json({ error: 'Push is not available on this server' }); }
});
app.post('/api/push/subscribe', auth, (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !s.keys) return res.status(400).json({ error: 'Invalid subscription' });
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, family_id, endpoint, keys_json) VALUES (?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, family_id = excluded.family_id, keys_json = excluded.keys_json
  `).run(req.user.id, req.user.family_id, String(s.endpoint), JSON.stringify(s.keys));
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', auth, (req, res) => {
  if (req.body?.endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body.endpoint), req.user.id);
  res.json({ ok: true });
});
app.post('/api/push/test', auth, async (req, res) => {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.user.id);
  if (!subs.length) return res.status(400).json({ error: 'No subscription on this account yet' });
  let wp; try { wp = getWebPush(); } catch { return res.status(500).json({ error: 'Push is not available on this server' }); }
  for (const s of subs) {
    try { await wp.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json) }, JSON.stringify({ title: 'Family Hub', body: 'Push notifications are working 🎉' })); }
    catch (err) { console.error('push test:', err.message); }
  }
  res.json({ ok: true });
});

// ---------- site notifications ----------
// ascending on purpose: the loop below breaks on the first threshold crossed, which must be the
// TIGHTEST one. Descending order meant everything from 30 days down to 0 landed on the same key,
// so an alert was raised once at 30 days and never re-notified as the deadline closed in.
const THRESHOLDS = [0, 1, 7, 14, 30];
// only the important stuff raises alerts: insurance, car deadlines, PAD, personal papers,
// and money a tenant owes past its due date.
// regular bills stay visible in the dashboard ribbon but never notify.
const ALERT_KINDS = new Set(['rca', 'casco', 'vignette', 'itp', 'road_tax', 'property_insurance', 'document', 'birthday', 'tenant_unpaid']);
// user-facing preference groups: each member can mute whole groups (users.notif_muted, CSV).
// The group names are the API surface the Settings page speaks.
const ALERT_GROUPS = {
  vehicles: ['rca', 'casco', 'vignette', 'itp', 'road_tax'],
  property: ['property_insurance'],
  tenant: ['tenant_unpaid', 'maintenance'],
  documents: ['document'],
  birthdays: ['birthday'],
};
const GROUP_OF_KIND = Object.fromEntries(Object.entries(ALERT_GROUPS).flatMap(([g, kinds]) => kinds.map((k) => [k, g])));
const mutedSet = (user) => new Set(String(user.notif_muted || '').split(',').filter(Boolean));
// quiet hours are stored as plain hours in Romanian wall-clock time (the household's day),
// regardless of where the server happens to run
function bucharestHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
}
function inQuietHours(qs, qe, h = bucharestHour()) {
  if (qs == null || qe == null || qs === qe) return false;
  return qs < qe ? h >= qs && h < qe : h >= qs || h < qe; // second form wraps midnight (22 → 8)
}
// where tapping an alert (push notification or the in-app list) should land, derived from the
// kind encoded at the front of its key — so "opening the notification" goes to the relevant page
// instead of the bare dashboard.
const ALERT_PAGE = {
  rca: '/#vehicles', casco: '/#vehicles', vignette: '/#vehicles', itp: '/#vehicles', road_tax: '/#vehicles',
  property_insurance: '/#properties', tenant_unpaid: '/#properties', maintenance: '/#properties',
  document: '/#acte', birthday: '/#family',
};
function alertUrl(key) { return ALERT_PAGE[String(key).split(':')[0]] || '/#alerts'; }
// the thing an alert is about, without the threshold: "rca:3:2026-08-16:14" -> "rca:3:2026-08-16".
// Snoozes hang off this, so they hold as the alert escalates and lapse when the date moves.
const alertItem = (key) => String(key).split(':').slice(0, 3).join(':');
const DISMISSED_UNTIL = '9999-12-31'; // "not this time round" — the key changes when it's renewed
function snoozedItems(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return new Set(db.prepare('SELECT item_key FROM alert_snoozes WHERE user_id = ? AND until > ?')
    .all(userId, today).map((r) => r.item_key));
}
// Alerts are stored once per family but read by members who may not share a language, so the text
// is rendered from `params` at read time (and per subscriber when pushing) instead of being frozen
// in English at write time. mailLabel/mailDate already translate the deadline names and dates.
function alertText(lang, p) {
  if (!p) return null;
  const ro = lang === 'ro';
  const days = (n) => (ro ? roDays(n) : `${n} day${n === 1 ? '' : 's'}`);
  if (p.t === 'maint') {
    const when = p.days <= 0 ? (ro ? 'azi' : 'today') : (ro ? `acum ${days(p.days)}` : `${days(p.days)} ago`);
    return {
      title: ro ? `De reparat: ${p.title}` : `To fix: ${p.title}`,
      body: ro ? `${p.property} — raportat de ${p.reporter} ${when}` : `${p.property} — reported by ${p.reporter} ${when}`,
    };
  }
  const label = mailLabel(lang, p.label);
  const tail = `${p.entity ? `${p.entity} — ` : ''}`;
  const amount = p.amount ? `, ${p.amount}` : '';
  const when = mailDate(p.date);
  if (p.days < 0) {
    const late = -p.days;
    return {
      title: ro ? `Restant: ${label}` : `Overdue: ${label}`,
      body: ro ? `${tail}era scadent ${when}, acum ${days(late)}${amount}` : `${tail}was due ${when}, ${days(late)} ago${amount}`,
    };
  }
  return {
    title: p.days === 0 ? (ro ? `Scadent azi: ${label}` : `Due today: ${label}`)
      : (ro ? `${label} — mai ${p.days === 1 ? 'este o zi' : `sunt ${roDays(p.days)}`}` : `${label} — ${days(p.days)} left`),
    body: ro ? `${tail}scadent ${when}${amount}` : `${tail}due ${when}${amount}`,
  };
}
// stored text is the English rendering; params drive every localized read
const alertRow = (lang, row) => {
  let p = null;
  try { p = row.params ? JSON.parse(row.params) : null; } catch { /* older row without params */ }
  return alertText(lang, p) || { title: row.title, body: row.body };
};
function generateNotifications(fid) {
  const ins = db.prepare('INSERT OR IGNORE INTO notifications (family_id, key, title, body, owner_id, params) VALUES (?,?,?,?,?,?)');
  const upd = db.prepare('UPDATE notifications SET title = ?, body = ?, params = ? WHERE family_id = ? AND key = ? AND (title != ? OR body != ?)');
  const unread = db.prepare('DELETE FROM notification_reads WHERE notification_id IN (SELECT id FROM notifications WHERE family_id = ? AND key = ?)');
  const fresh = [];
  const live = new Set(); // every key this pass still considers unsolved
  const cur = familyCurrency(fid);
  // keys are stable per item+threshold, so the text is refreshed on every pass and "X days left"
  // always matches the dashboard. English text is stored; `params` renders it per reader.
  const add = (key, params, owner, push = true) => {
    live.add(key);
    const { title, body } = alertText('en', params);
    const json = JSON.stringify(params);
    if (ins.run(fid, key, title, body, owner, json).changes > 0) {
      if (push) fresh.push({ params, owner, key });
    } else if (upd.run(title, body, json, fid, key, title, body).changes > 0) {
      // the item is still unsolved and its message moved on (another day gone by): a read alert
      // would otherwise stay buried, so put it back in front of the family.
      unread.run(fid, key);
    }
  };
  for (const r of collectReminders(fid, 31)) {
    if (!ALERT_KINDS.has(r.kind)) continue;
    const prefix = `${r.kind}:${r.ref_id}:${r.date}:`;
    const base = { label: r.label, entity: r.entity || '', date: r.date, amount: r.amount ? `${Number(r.amount).toFixed(2)} ${cur}` : '' };
    if (r.days_left < 0) {
      // the days-late count keeps the text moving, so an unsolved overdue item resurfaces daily
      add(`${prefix}overdue`, { ...base, days: r.days_left }, r.owner_id);
      continue;
    }
    for (const t of THRESHOLDS) {
      if (r.days_left <= t) {
        add(`${prefix}${t}`, { ...base, days: r.days_left }, r.owner_id);
        break; // only the tightest threshold crossed right now
      }
    }
  }
  // maintenance the tenant reported and nobody has fixed yet. Not a dated deadline, so it is not
  // routed through collectReminders — on the dashboard "3d overdue" would misread; it is open, not late.
  // push = false: reporting it already sent the owner a pop-up, and this would double up.
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const m of db.prepare(`
    SELECT m.id, m.title, m.created_at, p.name AS property_name, p.owner_id, u.name AS reporter
    FROM maintenance_requests m
    JOIN properties p ON p.id = m.property_id
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.family_id = ? AND m.status = 'open'
  `).all(fid)) {
    const days = Math.round((new Date(todayISO) - new Date(String(m.created_at).slice(0, 10))) / 86400000);
    add(`maintenance:${m.id}:open`,
      { t: 'maint', title: m.title, property: m.property_name, reporter: m.reporter || 'the tenant', days },
      m.owner_id, false);
  }
  // Anything not regenerated above is solved — renewed deadline, paid charge, deleted item, or an
  // older threshold superseded by a tighter one. Solved alerts are deleted rather than left stale.
  const keep = [...live];
  db.prepare(`DELETE FROM notifications WHERE family_id = ?${keep.length ? ` AND key NOT IN (${keep.map(() => '?').join(',')})` : ''}`)
    .run(fid, ...keep);
  // Snoozes outlive their alert otherwise. Dropping the ones whose item is gone keeps the table from
  // growing forever, and means a renewed deadline (new date -> new item key) starts alerting again.
  const items = [...new Set(keep.map(alertItem))];
  db.prepare(`DELETE FROM alert_snoozes WHERE family_id = ?${items.length ? ` AND item_key NOT IN (${items.map(() => '?').join(',')})` : ''}`)
    .run(fid, ...items);
  // only genuinely new alerts push to devices — a resurfaced one would push every single day
  // i18n travels with the payload so each device is pushed in its owner's language
  for (const n of fresh) sendPushToFamily(fid, { i18n: n.params, url: alertUrl(n.key), kind: String(n.key).split(':')[0], item: alertItem(n.key) }, n.owner).catch(() => {});
}
app.get('/api/notifications', auth, (req, res) => {
  generateNotifications(req.user.family_id);
  // admins see every alert; other members only ones they're responsible for (plus family-wide)
  const isAdmin = req.user.role === 'admin';
  const rows = db.prepare(`
    SELECT n.id, n.key, n.title, n.body, n.params, n.created_at,
           CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS read
    FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.family_id = ? ${isAdmin ? '' : 'AND (n.owner_id IS NULL OR n.owner_id = ?)'}
    ORDER BY n.id DESC LIMIT 100
  `).all(...(isAdmin ? [req.user.id, req.user.family_id] : [req.user.id, req.user.family_id, req.user.id]));
  // url derived from the key, not the key itself — clients get a destination, not internal shape.
  // Muted groups disappear from this member's list and badge; other members still see them.
  const muted = mutedSet(req.user);
  const snoozed = snoozedItems(req.user.id);
  const items = rows
    .filter((r) => !muted.has(GROUP_OF_KIND[String(r.key).split(':')[0]]) && !snoozed.has(alertItem(r.key)))
    .map(({ key, params, title, body, ...r }) => ({ ...r, ...alertRow(req.user.lang, { title, body, params }), item: alertItem(key), url: alertUrl(key) }));
  res.json({ items, unread: items.filter((x) => !x.read).length });
});
// quiet an alert you have dealt with (or will deal with later) without having to finish the task
app.post('/api/notifications/snooze', auth, (req, res) => {
  const item = String(req.body?.item || '');
  if (!/^[a-z_]+:\d+:[a-z0-9-]+$/.test(item)) return res.status(400).json({ error: 'Unknown alert' });
  const days = Number(req.body?.days);
  const until = req.body?.dismiss ? DISMISSED_UNTIL : addDays(new Date().toISOString().slice(0, 10), Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 7);
  db.prepare(`
    INSERT INTO alert_snoozes (family_id, user_id, item_key, until) VALUES (?,?,?,?)
    ON CONFLICT(user_id, item_key) DO UPDATE SET until = excluded.until
  `).run(req.user.family_id, req.user.id, item, until);
  res.json({ ok: true, until });
});
app.post('/api/notifications/read', auth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  const rows = ids || db.prepare('SELECT id FROM notifications WHERE family_id = ?').all(req.user.family_id).map((r) => r.id);
  const ins = db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?,?)');
  const tx = db.transaction(() => rows.forEach((id) => ins.run(id, req.user.id)));
  tx();
  res.json({ ok: true });
});

// ---------- email reminders ----------
// Tenants: one email when any unpaid charge (rent or shared invoice) is due within 7 days,
// listing everything they owe. Family admins/adults: bills due within 7 days, plus
// insurance / deadline / document expiries at 30, 14, 7 and 3 days.
// email_log keeps one send per item per threshold; MAIL_FROM unset = feature off.
const MAIL_THRESHOLDS = [3, 7, 14, 30]; // ascending, so .find() returns the tightest crossed

// ---------- email copy, in the recipient's own language ----------
// Recipients are grouped by their `lang` and each group gets its own email. Kept deliberately
// small and local: the UI dictionary lives in the browser, and these are the only strings the
// server itself writes. Reminder labels come from collectReminders in English, so they are
// mapped here too — otherwise a Romanian email would read "Rovinieta (vignette)".
const MAIL_LABELS_RO = {
  'RCA insurance': 'Asigurare RCA', 'Casco insurance': 'Asigurare Casco', 'Rovinieta (vignette)': 'Rovinietă',
  'ITP inspection': 'Inspecție ITP', 'Vehicle tax': 'Taxă auto', 'Property insurance (PAD)': 'Asigurare locuință (PAD)',
  'Additional home insurance': 'Asigurare facultativă locuință', 'Property tax': 'Impozit proprietate',
};
const mailDate = (iso) => { const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso); };
// Romanian takes "de" from 20 upwards — "3 zile" but "24 de zile". Small thing, reads wrong without it.
const roDays = (n) => (n === 1 ? 'o zi' : `${n}${n % 100 >= 20 || n % 100 === 0 ? ' de' : ''} zile`);
function mailLabel(lang, label) {
  if (lang !== 'ro') return label;
  if (MAIL_LABELS_RO[label]) return MAIL_LABELS_RO[label];
  let m;
  if ((m = /^🎂 (.+)'s birthday$/.exec(label))) return `🎂 Ziua de naștere: ${m[1]}`;
  if ((m = /^(.+) — unpaid by tenant$/.exec(label))) return `${m[1]} — neplătit de chiriaș`;
  return label; // user-entered text (a bill or document name) stays as they typed it
}
const mailDays = (lang, d) => (lang === 'ro'
  ? (d === 0 ? 'astăzi' : `în ${roDays(d)}`)
  : (d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`));
// split a recipient list into { en: [...], ro: [...] } so each person reads their own language
function byLanguage(rows) {
  const groups = {};
  for (const r of rows) (groups[r.lang === 'ro' ? 'ro' : 'en'] ||= []).push(r.email);
  return groups;
}
function familyDigestMail(lang, famName, items, cur) {
  const ro = lang === 'ro';
  const lines = items.map((i) => `- ${mailLabel(lang, i.label)}${i.entity ? ` (${i.entity})` : ''}: `
    + `${ro ? 'scadent' : 'due'} ${mailDate(i.date)}, ${mailDays(lang, i.days_left)}`
    + `${i.amount ? ` — ${Number(i.amount).toFixed(2)} ${cur}` : ''}`).join('\n');
  const rows = items.map((i) => `<div style="margin:6px 0;padding:10px 14px;background:#eff2f1;border-radius:8px;">
      <b>${htmlEsc(mailLabel(lang, i.label))}</b>${i.entity ? ` <span style="color:#45565f">${htmlEsc(i.entity)}</span>` : ''}<br>
      <span style="font-size:13px;color:#45565f;">${ro ? 'scadent' : 'due'} ${mailDate(i.date)} · ${mailDays(lang, i.days_left)}${i.amount ? ` · <span style="font-family:monospace">${Number(i.amount).toFixed(2)} ${cur}</span>` : ''}</span>
    </div>`).join('');
  const subject = ro ? `Family Hub — ${items.length} ${items.length === 1 ? 'termen se apropie' : 'termene se apropie'}`
    : `Family Hub — ${items.length} deadline${items.length === 1 ? '' : 's'} coming up`;
  const intro = ro ? `Aceste lucruri din Family Hub-ul familiei ${famName} au nevoie de atenție în curând:`
    : `These items in ${famName}'s Family Hub need attention soon:`;
  const foot = ro ? 'Deschide Family Hub pentru detalii și ca să le marchezi rezolvate.' : 'Open Family Hub for details and to mark them done.';
  return {
    subject,
    text: `${ro ? 'Bună,' : 'Hello,'}\n\n${intro}\n\n${lines}\n\n${foot}\n`,
    html: htmlEmail(`<p>${ro ? 'Bună,' : 'Hello,'}</p><p>${htmlEsc(intro)}</p>${rows}
      <p>${htmlButton(`${siteBase()}/#alerts`, ro ? 'Deschide Family Hub' : 'Open Family Hub')}</p>
      <p style="color:#45565f;font-size:13px;">${htmlEsc(foot)}</p>`),
  };
}
// the tenant's unpaid charges as a payable email — same Pay-via-Revolut + Check-invoice buttons the
// new-charge email carries, so a reminder is as actionable as the original. Used by the daily digest
// AND the owner's manual "Send reminder" (opts.manual just changes the intro line).
function tenantChargesMail(lang, prop, charges, total, cur, opts = {}) {
  const ro = lang === 'ro';
  const site = siteBase();
  const dueW = ro ? 'scadent' : 'due';
  const lines = charges.map((c) => `- ${c.title}: ${Number(c.amount).toFixed(2)} ${cur}, ${dueW} ${mailDate(c.due_date)}`).join('\n');
  const rows = charges.map((c) => `<div style="margin:8px 0;padding:10px 14px;background:#eff2f1;border-radius:8px;">
      <b>${htmlEsc(c.title)}</b><br><span style="font-family:monospace;font-size:15px;">${Number(c.amount).toFixed(2)} ${cur}</span> · ${dueW} ${mailDate(c.due_date)}
    </div>`).join('');
  const t = {
    subject: ro ? `Plăți pentru ${prop.name} — scadente în curând` : `Payments for ${prop.name} — due soon`,
    greet: ro ? 'Bună,' : 'Hello,',
    intro: opts.manual
      ? (ro ? `Un memento despre plățile care așteaptă pentru <b>${htmlEsc(prop.name)}</b>:` : `A reminder about the payments waiting on <b>${htmlEsc(prop.name)}</b>:`)
      : (ro ? `Un memento prietenos despre plățile care urmează pentru <b>${htmlEsc(prop.name)}</b>:` : `A friendly reminder about your upcoming payments for <b>${htmlEsc(prop.name)}</b>:`),
    introText: opts.manual
      ? (ro ? `Un memento despre plățile care așteaptă pentru ${prop.name}:` : `A reminder about the payments waiting on ${prop.name}:`)
      : (ro ? `Un memento prietenos despre plățile care urmează pentru ${prop.name}:` : `A friendly reminder about your upcoming payments for ${prop.name}:`),
    totalW: ro ? 'Total de plată' : 'Total to pay',
    payW: ro ? 'Plătește cu Revolut' : 'Pay via Revolut',
    invW: ro ? 'Vezi factura' : 'Check your invoice',
    foot: ro ? 'După ce plătești, deschide portalul de chiriaș și apasă „Marchează plătit”, ca proprietarul să poată confirma.'
      : 'After you pay, open your tenant portal and press "Mark as paid" so the owner can confirm it.',
  };
  return {
    subject: t.subject,
    text: `${t.greet}\n\n${t.introText}\n\n${lines}\n\n${t.totalW}: ${total.toFixed(2)} ${cur}\n\n`
      + `${prop.payment_link ? `${t.payW}: ${prop.payment_link}\n` : ''}${t.invW}: ${site}/\n\n${t.foot}\n`,
    html: htmlEmail(`<p>${t.greet}</p><p>${t.intro}</p>${rows}
      <p style="font-weight:600;margin:12px 0 6px">${t.totalW}: <span style="font-family:monospace">${total.toFixed(2)} ${cur}</span></p>
      <p>${prop.payment_link ? htmlButton(htmlEsc(prop.payment_link), `${t.payW}${REVOLUT_BADGE}`, '#0666EB') : ''}${htmlButton(`${site}/`, t.invW)}</p>
      <p style="color:#45565f;font-size:13px;">${t.foot}</p>`),
  };
}

let mailTransport = null;
function getMailTransport() {
  if (mailTransport) return mailTransport;
  const nodemailer = require('nodemailer');
  if (process.env.MAIL_DEBUG === '1') {
    mailTransport = nodemailer.createTransport({ jsonTransport: true });
  } else if (process.env.SMTP_HOST) {
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    mailTransport = nodemailer.createTransport({ sendmail: true, path: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail' });
  }
  return mailTransport;
}
async function sendMail(to, subject, text, attachments, html) {
  const info = await getMailTransport().sendMail({ from: process.env.MAIL_FROM, to: to.join(', '), subject, text, attachments, html });
  if (process.env.MAIL_DEBUG === '1') console.log('MAIL_DEBUG:', String(info.message).slice(0, 3000));
}
// claim keys atomically so parallel workers can't double-send; released again if sending fails
function claimKeys(keys) {
  const ins = db.prepare('INSERT OR IGNORE INTO email_log (key) VALUES (?)');
  return keys.filter((k) => ins.run(k).changes > 0);
}
function releaseKeys(keys) {
  const del = db.prepare('DELETE FROM email_log WHERE key = ?');
  keys.forEach((k) => del.run(k));
}
async function runEmailReminders() {
  if (!process.env.MAIL_FROM) return { skipped: 'MAIL_FROM not set — email reminders disabled' };
  const daysTo = (d) => Math.ceil((new Date(d) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
  let sent = 0, errors = 0;
  for (const fam of db.prepare('SELECT * FROM families').all()) {
    const cur = fam.currency || 'RON';
    // --- household digest: bills ≤ 7 days, other deadlines at 30/14/7/3 ---
    const due = [];
    const keys = [];
    for (const it of collectReminders(fam.id, 31)) {
      if (it.days_left < 0) continue;
      let key = null;
      if (it.kind === 'bill') {
        // auto-paid subscriptions collect themselves — nothing for anyone to act on
        if (!it.auto_pay && it.days_left <= 7) key = `adm:${fam.id}:bill:${it.ref_id}:${it.date}:7`;
      } else {
        const t = MAIL_THRESHOLDS.find((x) => it.days_left <= x);
        if (t != null) key = `adm:${fam.id}:${it.kind}:${it.ref_id}:${it.date}:${t}`;
      }
      if (!key) continue;
      due.push(it);
      keys.push(key);
    }
    if (due.length) {
      const claimed = claimKeys(keys);
      if (claimed.length) {
        const groups = byLanguage(db.prepare("SELECT email, lang FROM users WHERE family_id = ? AND role IN ('admin','adult') AND email IS NOT NULL").all(fam.id));
        let anySent = false;
        for (const [lang, addrs] of Object.entries(groups)) {
          const { subject, text, html } = familyDigestMail(lang, fam.name, due, cur);
          try { await sendMail(addrs, subject, text, undefined, html); sent++; anySent = true; }
          catch (err) { errors++; console.error('email reminders (family):', err.message); }
        }
        // only unclaim if nobody got it — otherwise a retry would double-send to the group that did
        if (!anySent) releaseKeys(claimed);
      }
    }
    // --- tenants: rent due ≤ 7 days pulls every unpaid charge into one email ---
    for (const prop of db.prepare('SELECT * FROM properties WHERE family_id = ?').all(fam.id)) {
      ensureRentCharge(prop);
      const unpaid = db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? AND status = 'unpaid' ORDER BY due_date").all(prop.id);
      const trigger = unpaid.filter((c) => { const d = daysTo(c.due_date); return d >= 0 && d <= 7; });
      if (!trigger.length) continue;
      const claimed = claimKeys(trigger.map((c) => `ten:${c.id}:${c.due_date}`));
      if (!claimed.length) continue;
      const groups = byLanguage(db.prepare("SELECT email, lang FROM users WHERE role = 'tenant' AND tenant_property_id = ? AND email IS NOT NULL").all(prop.id));
      if (!Object.keys(groups).length) { releaseKeys(claimed); continue; }
      const total = unpaid.reduce((s, c) => s + c.amount, 0);
      let anySent = false;
      for (const [lang, addrs] of Object.entries(groups)) {
        const { subject, text, html } = tenantChargesMail(lang, prop, unpaid, total, cur);
        try { await sendMail(addrs, subject, text, undefined, html); sent++; anySent = true; }
        catch (err) { errors++; console.error('email reminders (tenant):', err.message); }
      }
      if (!anySent) releaseKeys(claimed);
    }
  }
  return { sent, errors };
}
// ---------- monthly email report ----------
// sent once per family at the start of each month, summarizing the month that just ended
async function runMonthlyReports() {
  if (!process.env.MAIL_FROM) return;
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  for (const fam of db.prepare('SELECT * FROM families').all()) {
    const key = `report:${fam.id}:${prev}`;
    if (!claimKeys([key]).length) continue;
    const to = db.prepare("SELECT email FROM users WHERE family_id = ? AND role IN ('admin','adult') AND email IS NOT NULL").all(fam.id).map((u) => u.email);
    if (!to.length) { releaseKeys([key]); continue; }
    const cur = fam.currency || 'RON';
    const m = (n) => `${Number(n || 0).toFixed(2)} ${cur}`;
    const income = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM incomes WHERE family_id = ? AND substr(date,1,7) = ?").get(fam.id, prev).t;
    const spent = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE family_id = ? AND substr(date,1,7) = ?").get(fam.id, prev).t;
    const cats = db.prepare("SELECT category, SUM(amount) t FROM expenses WHERE family_id = ? AND substr(date,1,7) = ? GROUP BY category ORDER BY t DESC LIMIT 6").all(fam.id, prev);
    const byMember = db.prepare(`
      SELECT COALESCE(u.name, '—') name, SUM(e.amount) t FROM expenses e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.family_id = ? AND substr(e.date,1,7) = ? GROUP BY u.id ORDER BY t DESC`).all(fam.id, prev);
    const budgets = db.prepare('SELECT * FROM budgets WHERE family_id = ? AND month = ?').all(fam.id, prev);
    const budgetData = budgets.map((b) => {
      const s = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE family_id = ? AND category = ? AND substr(date,1,7) = ?').get(fam.id, b.category, prev).t;
      return { category: b.category, spent: s, amount: b.amount, over: s > b.amount };
    });
    const budgetLines = budgetData.map((b) => `  ${b.category}: ${m(b.spent)} / ${m(b.amount)}${b.over ? '  (over!)' : ''}`);
    const savBal = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END),0) t FROM savings WHERE family_id = ?").get(fam.id).t;
    const savMonth = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END),0) t FROM savings WHERE family_id = ? AND substr(date,1,7) = ?").get(fam.id, prev).t;
    const text = [
      `Hello,`, '',
      `Here is ${fam.name}'s money summary for ${prev}:`, '',
      `Income:   ${m(income)}`,
      `Spent:    ${m(spent)}`,
      `Left over: ${m(income - spent)}`, '',
      cats.length ? `Top spending categories:\n${cats.map((c) => `  ${c.category}: ${m(c.t)}`).join('\n')}` : 'No expenses were logged.',
      byMember.length ? `\nSpending per person:\n${byMember.map((x) => `  ${x.name}: ${m(x.t)}`).join('\n')}` : '',
      budgetLines.length ? `\nBudgets vs actual:\n${budgetLines.join('\n')}` : '',
      `\nEconomy account: ${m(savBal)} (${savMonth >= 0 ? '+' : ''}${m(savMonth)} in ${prev})`, '',
      `Open Family Hub for the full picture.`,
    ].filter((s) => s !== '').join('\n');
    // a "spent vs budget" line: green under budget, red over it
    const list = (arr, fmt) => arr.map(fmt).join('');
    const kvRow = (label, val, strong) => `<div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0;${strong ? 'font-weight:600' : ''}"><span>${htmlEsc(label)}</span><span style="font-family:monospace">${val}</span></div>`;
    const html = htmlEmail(`
      <p>Hello,</p>
      <p>Here is <b>${htmlEsc(fam.name)}</b>'s money summary for <b>${prev}</b>:</p>
      <div style="margin:14px 0;padding:12px 14px;background:#eff2f1;border-radius:8px;">
        ${kvRow('Income', m(income))}${kvRow('Spent', m(spent))}${kvRow('Left over', m(income - spent), true)}
      </div>
      ${cats.length ? `<p style="font-weight:600;margin:12px 0 2px">Top spending categories</p>${list(cats, (c) => kvRow(c.category, m(c.t)))}` : '<p style="color:#45565f">No expenses were logged.</p>'}
      ${byMember.length ? `<p style="font-weight:600;margin:14px 0 2px">Spending per person</p>${list(byMember, (x) => kvRow(x.name, m(x.t)))}` : ''}
      ${budgetData.length ? `<p style="font-weight:600;margin:14px 0 2px">Budgets vs actual</p>${list(budgetData, (b) => `<div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0"><span>${htmlEsc(b.category)}</span><span style="font-family:monospace;color:${b.over ? '#b23a2e' : '#2f6b5a'}">${m(b.spent)} / ${m(b.amount)}${b.over ? ' ⚠' : ''}</span></div>`)}` : ''}
      <p style="margin-top:14px">Economy account: <b>${m(savBal)}</b> <span style="color:#45565f">(${savMonth >= 0 ? '+' : ''}${m(savMonth)} in ${prev})</span></p>
      <p>${htmlButton(`${siteBase()}/#dashboard`, 'Open Family Hub')}</p>`);
    try { await sendMail(to, `Family Hub — ${prev} monthly report`, text + '\n', undefined, html); }
    catch (err) { releaseKeys([key]); console.error('monthly report:', err.message); }
  }
}

// ---------- weekly backup by email ----------
// A consistent snapshot (VACUUM INTO) of the database, plus the uploaded files, gzipped and
// mailed to the admins. The database alone is useless for restoring: it holds the metadata for
// each act/invoice ("Pașaport, expires 2029") while the actual scan lives in DATA_DIR/uploads.

// Minimal USTAR writer: a tar is just 512-byte headers followed by NUL-padded bodies. Adding a
// dependency for that on a host where native builds are blocked is not worth it.
function tarFiles(dir, names) {
  const parts = [];
  const padTo512 = (buf) => (buf.length % 512 ? Buffer.concat([buf, Buffer.alloc(512 - (buf.length % 512))]) : buf);
  for (const name of names) {
    const body = fs.readFileSync(path.join(dir, name));
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 99), 0, 'utf8');                                              // name
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);    // mode, uid, gid
    h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);                      // size, octal
    h.write(Math.floor(fs.statSync(path.join(dir, name)).mtimeMs / 1000).toString(8).padStart(11, '0') + '\0', 136);
    h.write('        ', 148);                                                            // checksum: spaces while summing
    h.write('0', 156);                                                                   // typeflag: regular file
    h.write('ustar\0', 257); h.write('00', 263);                                         // magic + version
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);                              // real checksum
    parts.push(h, padTo512(body));
  }
  parts.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  return Buffer.concat(parts);
}
// The same consistent snapshot the weekly mail takes, but on demand and straight down the wire —
// an off-site copy without going through cPanel. Admin only: the file is the whole database.
app.get('/api/backup', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  const tmp = path.join(DATA_DIR, `backup-dl-${crypto.randomBytes(6).toString('hex')}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    const gz = require('zlib').gzipSync(fs.readFileSync(tmp));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="familyhub-${new Date().toISOString().slice(0, 10)}.db.gz"`);
    res.send(gz);
  } catch (err) {
    console.error('backup download:', err.message);
    res.status(500).json({ error: 'Could not build the backup' });
  } finally {
    try { fs.unlinkSync(tmp); } catch {} // the snapshot is a temp file whatever happened
  }
});
async function runWeeklyBackup() {
  if (!process.env.MAIL_FROM) return;
  const fams = db.prepare('SELECT id FROM families').all();
  if (fams.length !== 1) return; // the file contains every family — only safe on a single-family install
  const to = db.prepare("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL").all().map((u) => u.email);
  if (!to.length) return;
  const now = new Date();
  const week = Math.ceil(((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  const key = `backup:${now.getUTCFullYear()}-W${week}`;
  if (!claimKeys([key]).length) return;
  const tmp = path.join(DATA_DIR, `backup-tmp-${Date.now()}.db`);
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const CAP = 20 * 1024 * 1024; // keep the whole message under the usual ~25 MB mailbox limit
  try {
    const zlib = require('zlib');
    db.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    const gz = zlib.gzipSync(fs.readFileSync(tmp));
    fs.unlinkSync(tmp);
    const stamp = now.toISOString().slice(0, 10);
    if (gz.length > CAP) {
      await sendMail(to, `Family Hub — backup ${stamp} too large to email`,
        `The weekly database backup is ${size(gz.length)} — too large to attach.\nCopy DATA_DIR/familyhub.db and DATA_DIR/uploads off the server manually.\n`,
        undefined,
        htmlEmail(`<p>The weekly database backup is <b>${size(gz.length)}</b> — too large to attach.</p>
          <p>Copy <code style="background:#eff2f1;padding:1px 5px;border-radius:4px">DATA_DIR/familyhub.db</code> and <code style="background:#eff2f1;padding:1px 5px;border-radius:4px">DATA_DIR/uploads</code> off the server manually.</p>`));
      return;
    }
    const attachments = [{ filename: `familyhub-${stamp}.db.gz`, content: gz }];

    // the uploads (scans, invoices, meter photos, avatars) — the database is only metadata without them
    const names = fs.readdirSync(UPLOAD_DIR).filter((f) => { try { return fs.statSync(path.join(UPLOAD_DIR, f)).isFile(); } catch { return false; } });
    let filesNote;
    if (!names.length) {
      filesNote = 'There are no uploaded files yet.';
    } else {
      const tgz = zlib.gzipSync(tarFiles(UPLOAD_DIR, names));
      if (gz.length + tgz.length > CAP) {
        // already-compressed jpg/pdf will not shrink, so this is the honest failure mode:
        // say so loudly instead of quietly shipping a backup that cannot restore the scans
        filesNote = `⚠ The ${plural(names.length, 'uploaded file', 'uploaded files')} (${size(tgz.length)}) were TOO LARGE to attach and are NOT in this backup.\n`
          + `  Copy DATA_DIR/uploads off the server yourself — without it the scans and invoices cannot be restored.`;
      } else {
        attachments.push({ filename: `familyhub-uploads-${stamp}.tar.gz`, content: tgz });
        filesNote = `Also attached: ${plural(names.length, 'uploaded file', 'uploaded files')} (${size(tgz.length)}) — the scans, invoices, meter photos and profile pictures.`;
      }
    }
    await sendMail(to, `Family Hub — weekly backup ${stamp}`,
      `Attached is this week's backup.\n\n`
      + `- Database: ${(gz.length / 1024).toFixed(1)} KB gzipped\n- ${filesNote}\n\n`
      + `To restore: stop the app, gunzip the .db.gz over familyhub.db in your DATA_DIR, and untar the uploads archive into DATA_DIR/uploads. Then start the app.\n`,
      attachments,
      htmlEmail(`<p>Attached is this week's backup.</p>
        <div style="margin:12px 0;padding:10px 14px;background:#eff2f1;border-radius:8px;font-size:14px;">
          <div>Database: <b>${(gz.length / 1024).toFixed(1)} KB</b> gzipped</div>
          <div style="margin-top:4px">${htmlEsc(filesNote)}</div>
        </div>
        <p style="color:#45565f;font-size:13px;">To restore: stop the app, gunzip the .db.gz over <code style="background:#eff2f1;padding:1px 5px;border-radius:4px">familyhub.db</code> in your DATA_DIR, and untar the uploads archive into <code style="background:#eff2f1;padding:1px 5px;border-radius:4px">DATA_DIR/uploads</code>. Then start the app.</p>`));
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    releaseKeys([key]);
    console.error('weekly backup:', err.message);
  }
}

// Cascading deletes remove rows, not the files they point at, so a deleted property or vehicle
// leaves its scans behind forever. Sweep anything no row references any more.
function sweepOrphanUploads() {
  const referenced = new Set();
  for (const [table, col] of [['users', 'avatar'], ['documents', 'attachment'], ['bills', 'attachment'],
    ['tenant_charges', 'attachment'], ['meter_requests', 'photo'], ['maintenance_requests', 'photo']]) {
    for (const r of db.prepare(`SELECT ${col} AS f FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`).all()) referenced.add(r.f);
  }
  let removed = 0;
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    try {
      const st = fs.statSync(path.join(UPLOAD_DIR, name));
      if (!st.isFile() || referenced.has(name)) continue;
      // grace period: multer writes the file before the row exists, so a file uploaded moments
      // ago is not an orphan — it is a request still in flight
      if (Date.now() - st.mtimeMs < 24 * 3600 * 1000) continue;
      fs.unlinkSync(path.join(UPLOAD_DIR, name));
      removed++;
    } catch { /* leave anything we cannot stat or delete */ }
  }
  if (removed) console.log(`swept ${removed} orphaned upload(s)`);
  return removed;
}

// runs shortly after every start (visits wake the app) and every 6 hours while it stays alive;
// a cron hitting /api/cron/email-reminders guarantees a daily check even with zero visits
async function emailReminderTick() {
  try { autoPayBills(); } catch (err) { console.error('auto-pay bills:', err.message); }
  try { autoLogCreditExpenses(); } catch (err) { console.error('auto credit expense:', err.message); }
  try { autoLogIncomes(); } catch (err) { console.error('auto incomes:', err.message); }
  try { autoLogRecurringExpenses(); } catch (err) { console.error('auto recurring expenses:', err.message); }
  try { for (const p of db.prepare('SELECT * FROM properties').all()) ensureMeterRequests(p); } catch (err) { console.error('meter schedule:', err.message); }
  try { await runEmailReminders(); } catch (err) { console.error('email reminders:', err.message); }
  try { await runMonthlyReports(); } catch (err) { console.error('monthly report:', err.message); }
  try { await runWeeklyBackup(); } catch (err) { console.error('weekly backup:', err.message); }
  try { sweepOrphanUploads(); } catch (err) { console.error('orphan sweep:', err.message); }
  // spent reset links have no further use — stop the table growing a row per request
  try { db.prepare("DELETE FROM password_resets WHERE used = 1 OR expires_at < datetime('now')").run(); } catch (err) { console.error('reset cleanup:', err.message); }
  // idempotent and cheap: linking a credit to a property later still backfills within a day,
  // without waiting for the next deploy restart
  try { backfillCreditPropertyLinks(); } catch (err) { console.error('credit backfill:', err.message); }
}
setTimeout(emailReminderTick, 30 * 1000);
setInterval(emailReminderTick, 6 * 3600 * 1000);
// This does real work (auto-pay, auto-log, sends mail), so it must not be world-callable.
// A token is required; with none configured we fail closed in production rather than leaving a
// fresh install open to anyone who guesses the URL. Locally it stays open for testing.
app.get('/api/cron/email-reminders', async (req, res) => {
  const token = process.env.CRON_TOKEN;
  if (token) {
    const given = String(req.query.token || '');
    const a = Buffer.from(given), b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Bad token' });
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'CRON_TOKEN is not configured on this server' });
  }
  await emailReminderTick(); // full daily housekeeping: auto-pay, auto-log, meters, reminder emails, monthly report
  res.json({ ok: true });
});

// ---------- bank import ----------
// Client parses the CSV and sends normalized rows; server dedups by content hash.
app.post('/api/import/transactions', auth, canWrite, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'No transactions to import' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Too many rows at once (max 2000)' });
  let imported = 0, skipped = 0, errors = 0;
  const insHash = db.prepare('INSERT OR IGNORE INTO imported_tx (family_id, hash) VALUES (?,?)');
  const insExp = db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date) VALUES (?,?,?,?,?,?)');
  const insInc = db.prepare('INSERT INTO incomes (family_id, user_id, source, amount, date) VALUES (?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const r of rows) {
      const amount = Number(r.amount);
      if (!isDate(r.date) || !(amount > 0) || !['expense', 'income'].includes(r.type)) { errors++; continue; }
      const desc = String(r.description || '').slice(0, 200);
      const hash = crypto.createHash('sha1').update(`${r.date}|${r.type}|${amount.toFixed(2)}|${desc.toLowerCase()}`).digest('hex');
      if (!insHash.run(req.user.family_id, hash).changes) { skipped++; continue; }
      if (r.type === 'expense') {
        insExp.run(req.user.family_id, req.user.id, CATEGORY_SET.has(r.category) ? r.category : 'Other', amount, desc, r.date);
      } else {
        insInc.run(req.user.family_id, req.user.id, desc || 'Bank import', amount, r.date);
      }
      imported++;
    }
  });
  tx();
  res.json({ imported, skipped, errors });
});
const CATEGORY_SET = new Set(['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Credit', 'Subscriptions', 'Other']);

// ---------- dashboard stats ----------
app.get('/api/stats', auth, (req, res) => {
  autoPayBills(); autoLogCreditExpenses(); autoLogIncomes(); autoLogRecurringExpenses();
  const fid = req.user.family_id;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  // ?months=1|3|6|12 sets the KPI/category window (default 1 = current month); trend spans the same window
  const months = [1, 3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 1;
  const start = new Date(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const startMonth = start.toISOString().slice(0, 7); // inclusive lower bound YYYY-MM
  // optional ?user=<id> narrows the numbers to one member's expenses/income
  const uid = req.query.user && req.query.user !== 'all' && !isNaN(Number(req.query.user)) ? Number(req.query.user) : null;
  const uf = uid != null ? ' AND user_id = ?' : '';
  const ua = uid != null ? [uid] : [];
  const byCategory = db.prepare(`
    SELECT category, SUM(amount) AS total FROM expenses
    WHERE family_id = ? AND substr(date,1,7) >= ?${uf} GROUP BY category ORDER BY total DESC
  `).all(fid, startMonth, ...ua);
  const income = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM incomes WHERE family_id = ? AND substr(date,1,7) >= ?${uf}`).get(fid, startMonth, ...ua).total;
  const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE family_id = ? AND substr(date,1,7) >= ?${uf}`).get(fid, startMonth, ...ua).total;
  const trend = db.prepare(`
    SELECT substr(date,1,7) AS m, SUM(amount) AS total FROM expenses
    WHERE family_id = ? AND substr(date,1,7) >= ?${uf} GROUP BY m ORDER BY m
  `).all(fid, startMonth, ...ua);
  const incomeTrend = db.prepare(`
    SELECT substr(date,1,7) AS m, SUM(amount) AS total FROM incomes
    WHERE family_id = ? AND substr(date,1,7) >= ?${uf} GROUP BY m ORDER BY m
  `).all(fid, startMonth, ...ua);
  // the window of the same length immediately before this one, so a number can be compared to
  // something instead of floating on its own ("5.589 spent" vs "5.589 spent, 12% more than last month")
  const shifted = (back) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
  const prevStart = shifted(months * 2 - 1), prevEnd = shifted(months);
  const between = ` AND substr(date,1,7) >= ? AND substr(date,1,7) <= ?`;
  const prev = {
    income: db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM incomes WHERE family_id = ?${between}${uf}`).get(fid, prevStart, prevEnd, ...ua).total,
    spent: db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE family_id = ?${between}${uf}`).get(fid, prevStart, prevEnd, ...ua).total,
  };
  res.json({ month, months, startMonth, byCategory, income, spent, trend, incomeTrend, prev, prevStart, prevEnd });
});

// ---------- savings / economy account & goals ----------
app.get('/api/savings', auth, (req, res) => {
  const fid = req.user.family_id;
  const rows = db.prepare(`
    SELECT s.*, u.name AS user_name, g.title AS goal_title FROM savings s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN savings_goals g ON g.id = s.goal_id
    WHERE s.family_id = ? ORDER BY s.date DESC, s.id DESC
  `).all(fid);
  const balance = rows.reduce((t, r) => t + (r.kind === 'deposit' ? r.amount : -r.amount), 0);
  const byUser = {};
  for (const r of rows) { const k = r.user_name || '—'; byUser[k] = (byUser[k] || 0) + (r.kind === 'deposit' ? r.amount : -r.amount); }
  const goals = db.prepare(`
    SELECT g.*, u.name AS user_name,
      COALESCE((SELECT SUM(CASE WHEN s.kind = 'deposit' THEN s.amount ELSE -s.amount END) FROM savings s WHERE s.goal_id = g.id), 0) AS saved
    FROM savings_goals g LEFT JOIN users u ON u.id = g.user_id
    WHERE g.family_id = ? ORDER BY g.done, g.id DESC
  `).all(fid);
  res.json({ balance: Math.round(balance * 100) / 100, byUser, goals, entries: rows });
});
app.post('/api/savings', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!['deposit', 'withdrawal'].includes(b.kind)) return res.status(400).json({ error: 'Kind must be deposit or withdrawal' });
  if (!okAmount(b.amount)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!isDate(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (num(b.goal_id) != null && !db.prepare('SELECT id FROM savings_goals WHERE id = ? AND family_id = ?').get(num(b.goal_id), req.user.family_id)) {
    return res.status(400).json({ error: 'Goal not found' });
  }
  const info = db.prepare('INSERT INTO savings (family_id, user_id, kind, amount, date, note, goal_id) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.family_id, req.user.id, b.kind, Number(b.amount), b.date, str(b.note), num(b.goal_id));
  res.json(db.prepare('SELECT * FROM savings WHERE id = ?').get(info.lastInsertRowid));
});
app.delete('/api/savings/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM savings WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true });
});
app.post('/api/savings-goals', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!str(b.title)) return res.status(400).json({ error: 'Give the goal a name' });
  if (!(Number(b.target) > 0)) return res.status(400).json({ error: 'Target must be greater than 0' });
  if (num(b.user_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.user_id), req.user.family_id)) {
    return res.status(400).json({ error: 'Person must be a member of the family' });
  }
  const info = db.prepare('INSERT INTO savings_goals (family_id, title, target, user_id) VALUES (?,?,?,?)')
    .run(req.user.family_id, str(b.title), Number(b.target), num(b.user_id));
  res.json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(info.lastInsertRowid));
});
app.post('/api/savings-goals/:id/toggle', auth, canWrite, (req, res) => {
  const info = db.prepare('UPDATE savings_goals SET done = 1 - done WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/savings-goals/:id', auth, canWrite, (req, res) => {
  db.prepare('DELETE FROM savings_goals WHERE id = ? AND family_id = ?').run(req.params.id, req.user.family_id);
  res.json({ ok: true });
});

// ---------- CSV export ----------
app.get('/api/export/expenses.csv', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.date, e.category, e.amount, e.note, u.name AS added_by
    FROM expenses e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.family_id = ? ORDER BY e.date
  `).all(req.user.family_id);
  // CSV injection defence: a cell starting with = + - @ (or a control char) is run as a formula by
  // Excel/Sheets. A note like "=HYPERLINK(...)" would execute on open. Prefix those with a quote.
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = ['date,category,amount,note,added_by', ...rows.map((r) => [r.date, r.category, r.amount, r.note, r.added_by].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
  res.send(csv);
});

// SPA fallback
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Client mistakes (malformed JSON, a file too large) get told what they did wrong; anything else
// is ours, and its message could describe the database — "no such column: password_hash" is a free
// schema lesson for whoever provoked it. Those are logged and answered generically.
app.use((err, req, res, next) => {
  const clientFault = err.type === 'entity.parse.failed' || err.type === 'entity.too.large'
    || err instanceof multer.MulterError || err.status === 400 || err.statusCode === 400;
  if (clientFault) return res.status(400).json({ error: err.message || 'Bad request' });
  console.error('unhandled:', req.method, req.path, '-', err.message);
  res.status(500).json({ error: 'Something went wrong' });
});

// One-time repair, safe to keep: mortgage payments auto-logged BEFORE credits carried their
// property link were plain expenses (property_id NULL), so those months are missing from the
// property's cost history and its P&L overstates the profit. Attach them retroactively.
// Idempotent — once an expense has its property_id, it never matches again.
function backfillCreditPropertyLinks() {
  let fixed = 0;
  for (const c of db.prepare('SELECT * FROM credits WHERE property_id IS NOT NULL').all()) {
    const candidates = db.prepare(
      "SELECT * FROM expenses WHERE family_id = ? AND category = 'Credit' AND property_id IS NULL"
    ).all(c.family_id).filter((e) => String(e.note || '').startsWith(`Credit: ${c.name} `));
    for (const e of candidates) {
      db.transaction(() => {
        db.prepare('UPDATE expenses SET property_id = ? WHERE id = ?').run(c.property_id, e.id);
        if (!db.prepare('SELECT 1 FROM property_records WHERE expense_id = ?').get(e.id)) {
          db.prepare('INSERT INTO property_records (property_id, family_id, type, date, amount, note, user_id, expense_id) VALUES (?,?,?,?,?,?,?,?)')
            .run(c.property_id, c.family_id, 'other', e.date, e.amount, e.note, e.user_id, e.id);
        }
      })();
      fixed++;
    }
  }
  if (fixed) console.log(`backfilled ${fixed} credit payment(s) into property cost history`);
}
try { backfillCreditPropertyLinks(); } catch (err) { console.error('credit backfill:', err.message); }

app.listen(PORT, () => console.log(`Family Hub running on http://localhost:${PORT}`));
