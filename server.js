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

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const COOKIE = 'fh_token';
function signToken(user) {
  return jwt.sign({ uid: user.id, fid: user.family_id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}
function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}
function auth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, family_id, name, email, role, tenant_property_id FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    // tenants only ever see their own charges — never the family's data
    if (user.role === 'tenant' && req.path !== '/api/me' && !req.path.startsWith('/api/tenant')) {
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
function inviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
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
app.post('/api/auth/register', (req, res) => {
  const { familyName, name, email, password, inviteCode: code, tenantCode } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const emailNorm = String(email).trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
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
  const info = db.prepare('INSERT INTO users (family_id, name, email, password_hash, role, tenant_property_id) VALUES (?,?,?,?,?,?)')
    .run(familyId, String(name).trim(), emailNorm, hash, role, tenantPropertyId);
  const user = db.prepare('SELECT id, family_id, name, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !user.password_hash || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
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
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.password_hash) {
    if (!process.env.MAIL_FROM) return res.status(500).json({ error: 'Email is not configured on this server — ask the admin to reset your password' });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,datetime('now','+1 hour'))")
      .run(user.id, crypto.createHash('sha256').update(token).digest('hex'));
    const base = `${req.protocol}://${req.get('host')}`;
    try {
      await sendMail([user.email], 'Family Hub — password reset',
        `Hello ${user.name},\n\nSomeone (hopefully you) asked to reset your Family Hub password.\nOpen this link to choose a new one — it works for 1 hour:\n\n${base}/#reset=${token}\n\nIf this wasn't you, just ignore this email and nothing changes.\n`);
    } catch (err) {
      console.error('password reset email:', err.message);
      return res.status(500).json({ error: 'Could not send the email — try again in a few minutes' });
    }
  }
  // same answer whether the email exists or not
  res.json({ ok: true });
});
app.post('/api/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')").get(hash);
  if (!row) return res.status(400).json({ error: 'This reset link is invalid or expired — request a new one' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  const user = db.prepare('SELECT id, family_id, name, email, role FROM users WHERE id = ?').get(row.user_id);
  setAuthCookie(res, signToken(user));
  res.json({ user });
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
  const members = db.prepare("SELECT id, name, email, role, created_at FROM users WHERE family_id = ? AND role != 'tenant' ORDER BY created_at").all(req.user.family_id);
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
      `Hello,\n\n${req.user.name} invited you to join "${family.name}" on Family Hub — a shared place for the household's budget, bills, cars and property deadlines.\n\nTo join:\n1. Open ${base}\n2. Choose "Register"\n3. Enter this invite code: ${family.invite_code}\n\nSee you there!\n`);
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

crud({
  route: 'expenses', table: 'expenses',
  fields: ['user_id', 'category', 'amount', 'note', 'date'],
  orderBy: 'date DESC, id DESC',
  validate: (b) => {
    if (!b.category) return 'Category is required';
    if (!(Number(b.amount) > 0)) return 'Amount must be greater than 0';
    if (!isDate(b.date)) return 'Date must be YYYY-MM-DD';
    return null;
  },
});
crud({
  route: 'incomes', table: 'incomes',
  fields: ['user_id', 'source', 'amount', 'date'],
  orderBy: 'date DESC, id DESC',
  validate: (b) => {
    if (!b.source) return 'Source is required';
    if (!(Number(b.amount) > 0)) return 'Amount must be greater than 0';
    if (!isDate(b.date)) return 'Date must be YYYY-MM-DD';
    return null;
  },
});
crud({
  route: 'vehicles', table: 'vehicles',
  fields: ['name', 'plate', 'rca_expiry', 'casco_expiry', 'vignette_expiry', 'itp_expiry', 'road_tax_due', 'notes'],
  orderBy: 'name',
  validate: (b) => (!b.name ? 'Vehicle name is required' : null),
});
crud({
  route: 'properties', table: 'properties',
  fields: ['name', 'address', 'insurance_expiry', 'property_tax_due', 'mortgage_lender', 'mortgage_payment', 'mortgage_due_day', 'owner_id', 'rent_amount', 'rent_due_day', 'notes'],
  orderBy: 'name',
  validate: (b, req) => {
    if (!b.name) return 'Property name is required';
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

  return {
    monthly_payment: Math.round(payment * 100) / 100,
    base_total_interest: Math.round(baseTotalInterest * 100) / 100,
    total_interest: Math.round(totalInterest * 100) / 100,
    interest_saved: Math.round(Math.max(0, baseTotalInterest - totalInterest) * 100) / 100,
    prepaid_total: Math.round(prepaidTotal * 100) / 100,
    balance: Math.round(balanceNow * 100) / 100,
    months_left: Math.max(0, months - elapsed),
    payoff_date: addMonths(credit.start_date, months),
  };
}
function validateCredit(b, fid) {
  if (!b.name) return 'Credit name is required';
  if (!(Number(b.principal) > 0)) return 'Principal must be greater than 0';
  if (!(Number(b.interest_rate) >= 0)) return 'Dobanda (interest %) must be 0 or more';
  if (!(Number(b.term_months) >= 1)) return 'Term must be at least 1 month';
  if (!isDate(b.start_date)) return 'Start date must be YYYY-MM-DD';
  if (num(b.user_id) != null && !db.prepare('SELECT id FROM users WHERE id = ? AND family_id = ?').get(num(b.user_id), fid)) {
    return 'Holder must be a member of the family';
  }
  if (num(b.property_id) != null && !db.prepare('SELECT id FROM properties WHERE id = ? AND family_id = ?').get(num(b.property_id), fid)) {
    return 'Linked property not found';
  }
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
    INSERT INTO credits (family_id, name, lender, principal, interest_rate, term_months, start_date, user_id, property_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.family_id, str(b.name), str(b.lender), Number(b.principal), Number(b.interest_rate),
    Math.round(Number(b.term_months)), b.start_date, num(b.user_id), num(b.property_id), str(b.notes));
  const row = db.prepare(`${CREDIT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid);
  res.json({ ...row, ...creditStats(row, []) });
});
app.put('/api/credits/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM credits WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  const err = validateCredit(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE credits SET name=?, lender=?, principal=?, interest_rate=?, term_months=?, start_date=?, user_id=?, property_id=?, notes=? WHERE id=?')
    .run(str(b.name), str(b.lender), Number(b.principal), Number(b.interest_rate), Math.round(Number(b.term_months)), b.start_date,
      num(b.user_id), num(b.property_id), str(b.notes), row.id);
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
  if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'Amount must be greater than 0' });
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
app.get('/api/bills', auth, (req, res) => {
  const bills = db.prepare('SELECT * FROM bills WHERE family_id = ? ORDER BY due_date').all(req.user.family_id);
  res.json(bills);
});
app.post('/api/bills', auth, canWrite, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !isDate(b.due_date)) return res.status(400).json({ error: 'Name, category and due date are required' });
  const info = db.prepare(`
    INSERT INTO bills (family_id, name, provider, category, amount, due_date, recur_months, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.user.family_id, str(b.name), str(b.provider), str(b.category), num(b.amount), b.due_date, Number(b.recur_months) || 0, str(b.notes));
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid));
});
app.put('/api/bills/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM bills WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  if (!b.name || !b.category || !isDate(b.due_date)) return res.status(400).json({ error: 'Name, category and due date are required' });
  db.prepare(`
    UPDATE bills SET name=?, provider=?, category=?, amount=?, due_date=?, recur_months=?, status=?, notes=? WHERE id=?
  `).run(str(b.name), str(b.provider), str(b.category), num(b.amount), b.due_date, Number(b.recur_months) || 0,
    b.status === 'paid' ? 'paid' : 'unpaid', str(b.notes), row.id);
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(row.id));
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
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Enter the amount paid' });
  const today = new Date().toISOString().slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO bill_payments (bill_id, family_id, amount, paid_at, paid_by) VALUES (?,?,?,?,?)')
      .run(bill.id, bill.family_id, amount, today, req.user.id);
    const catMap = { electricity: 'Utilities', gas: 'Utilities', water: 'Utilities', internet: 'Utilities', mobile: 'Utilities', property_tax: 'Taxes', other: 'Other' };
    db.prepare('INSERT INTO expenses (family_id, user_id, category, amount, note, date) VALUES (?,?,?,?,?,?)')
      .run(bill.family_id, req.user.id, catMap[bill.category] || 'Utilities', amount, `Bill: ${bill.name}`, today);
    if (bill.recur_months > 0) {
      db.prepare('UPDATE bills SET due_date = ?, status = ?, amount = ? WHERE id = ?')
        .run(addMonths(bill.due_date, bill.recur_months), 'unpaid', bill.amount, bill.id);
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
    cb(ok ? null : new Error('Only PDF or image files are allowed'), ok);
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
app.get('/api/documents', auth, (req, res) => {
  res.json(db.prepare(`${DOC_SELECT} WHERE d.family_id = ? ORDER BY d.expiry_date IS NULL, d.expiry_date, d.name`).all(req.user.family_id));
});
app.post('/api/documents', auth, canWrite, (req, res) => {
  const b = req.body || {};
  const err = validateDocument(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare('INSERT INTO documents (family_id, name, number, user_id, vehicle_id, property_id, expiry_date, notes) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.family_id, str(b.name), str(b.number), num(b.user_id), num(b.vehicle_id), num(b.property_id), b.expiry_date || null, str(b.notes));
  res.json(db.prepare(`${DOC_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid));
});
app.put('/api/documents/:id', auth, canWrite, (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  const err = validateDocument(b, req.user.family_id);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE documents SET name=?, number=?, user_id=?, vehicle_id=?, property_id=?, expiry_date=?, notes=? WHERE id=?')
    .run(str(b.name), str(b.number), num(b.user_id), num(b.vehicle_id), num(b.property_id), b.expiry_date || null, str(b.notes), row.id);
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
function subRecords(route, table, parentTable, parentKey, types) {
  app.get(`/api/${route}/:pid/records`, auth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE ${parentKey} = ? AND family_id = ? ORDER BY date DESC, id DESC`)
      .all(req.params.pid, req.user.family_id);
    res.json(rows);
  });
  app.post(`/api/${route}/:pid/records`, auth, canWrite, (req, res) => {
    const parent = db.prepare(`SELECT id FROM ${parentTable} WHERE id = ? AND family_id = ?`).get(req.params.pid, req.user.family_id);
    if (!parent) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    if (!types.includes(b.type)) return res.status(400).json({ error: 'Invalid record type' });
    if (!isDate(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    const cols = table === 'vehicle_records'
      ? db.prepare(`INSERT INTO ${table} (${parentKey}, family_id, type, date, amount, odometer, note) VALUES (?,?,?,?,?,?,?)`)
          .run(parent.id, req.user.family_id, b.type, b.date, num(b.amount), num(b.odometer), str(b.note))
      : db.prepare(`INSERT INTO ${table} (${parentKey}, family_id, type, date, amount, note) VALUES (?,?,?,?,?,?)`)
          .run(parent.id, req.user.family_id, b.type, b.date, num(b.amount), str(b.note));
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(cols.lastInsertRowid));
  });
  app.delete(`/api/${route}/:pid/records/:rid`, auth, canWrite, (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND family_id = ?`).run(req.params.rid, req.user.family_id);
    res.json({ ok: true });
  });
}
subRecords('vehicles', 'vehicle_records', 'vehicles', 'vehicle_id', ['service', 'tires', 'fuel', 'other']);
subRecords('properties', 'property_records', 'properties', 'property_id', ['maintenance', 'renovation', 'utility', 'rent', 'other_income', 'other']);

// ---------- tenants & shared charges ----------
// Rent is generated once per month automatically when the property has rent_amount set and a tenant.
function ensureRentCharge(prop) {
  if (!(Number(prop.rent_amount) > 0)) return;
  if (!db.prepare("SELECT id FROM users WHERE role = 'tenant' AND tenant_property_id = ?").get(prop.id)) return;
  const period = new Date().toISOString().slice(0, 7);
  if (db.prepare("SELECT id FROM tenant_charges WHERE property_id = ? AND type = 'rent' AND period = ?").get(prop.id, period)) return;
  const day = Math.min(Math.max(Math.round(Number(prop.rent_due_day)) || 1, 1), 28);
  db.prepare('INSERT INTO tenant_charges (family_id, property_id, type, title, amount, due_date, period) VALUES (?,?,?,?,?,?,?)')
    .run(prop.family_id, prop.id, 'rent', `Rent ${period}`, Number(prop.rent_amount), `${period}-${String(day).padStart(2, '0')}`, period);
}
function familyProperty(req) {
  return db.prepare('SELECT * FROM properties WHERE id = ? AND family_id = ?').get(req.params.id, req.user.family_id);
}

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

// owner side: charges shared with the tenant
app.get('/api/properties/:id/charges', auth, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  ensureRentCharge(prop);
  res.json(db.prepare("SELECT * FROM tenant_charges WHERE property_id = ? ORDER BY (status = 'paid'), due_date DESC, id DESC").all(prop.id));
});
app.post('/api/properties/:id/charges', auth, canWrite, (req, res) => {
  const prop = familyProperty(req);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!['rent', 'invoice'].includes(b.type)) return res.status(400).json({ error: 'Type must be rent or invoice' });
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!isDate(b.due_date)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  const info = db.prepare('INSERT INTO tenant_charges (family_id, property_id, type, title, amount, due_date, note) VALUES (?,?,?,?,?,?,?)')
    .run(prop.family_id, prop.id, b.type, str(b.title), Number(b.amount), b.due_date, str(b.note));
  res.json(db.prepare('SELECT * FROM tenant_charges WHERE id = ?').get(info.lastInsertRowid));
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

// tenant side: the only data a tenant account can reach
app.get('/api/tenant/charges', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.user.tenant_property_id);
  if (!prop) return res.status(404).json({ error: 'Your rental is no longer registered — contact the owner' });
  ensureRentCharge(prop);
  const charges = db.prepare("SELECT id, type, title, amount, due_date, status, marked_paid_at, confirmed_at, note FROM tenant_charges WHERE property_id = ? ORDER BY (status = 'paid'), due_date DESC, id DESC").all(prop.id);
  res.json({ property: { name: prop.name, address: prop.address }, charges });
});
app.post('/api/tenant/charges/:cid/pay', auth, (req, res) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ error: 'Tenant accounts only' });
  const info = db.prepare("UPDATE tenant_charges SET status = 'pending', marked_paid_at = ? WHERE id = ? AND property_id = ? AND status = 'unpaid'")
    .run(new Date().toISOString().slice(0, 10), req.params.cid, req.user.tenant_property_id);
  if (!info.changes) return res.status(404).json({ error: 'Charge not found or already marked' });
  res.json({ ok: true });
});

// ---------- reminders (aggregated deadlines) ----------
function collectReminders(fid, horizon) {
  const items = [];
  const push = (kind, label, entity, date, id, extra) => {
    if (!date) return;
    items.push({ kind, label, entity, date, ref_id: id, ...extra });
  };
  for (const b of db.prepare("SELECT * FROM bills WHERE family_id = ? AND status = 'unpaid'").all(fid)) {
    push('bill', b.name, b.provider || b.category, b.due_date, b.id, { amount: b.amount });
  }
  for (const v of db.prepare('SELECT * FROM vehicles WHERE family_id = ?').all(fid)) {
    push('rca', 'RCA insurance', v.name, v.rca_expiry, v.id);
    push('casco', 'Casco insurance', v.name, v.casco_expiry, v.id);
    push('vignette', 'Rovinieta (vignette)', v.name, v.vignette_expiry, v.id);
    push('itp', 'ITP inspection', v.name, v.itp_expiry, v.id);
    push('road_tax', 'Vehicle tax', v.name, v.road_tax_due, v.id);
  }
  for (const p of db.prepare('SELECT * FROM properties WHERE family_id = ?').all(fid)) {
    push('property_insurance', 'Property insurance (PAD)', p.name, p.insurance_expiry, p.id);
    push('property_tax', 'Property tax', p.name, p.property_tax_due, p.id);
  }
  for (const d of db.prepare(`${DOC_SELECT} WHERE d.family_id = ? AND d.expiry_date IS NOT NULL`).all(fid)) {
    push('document', `Act: ${d.name}`, d.person_name || d.vehicle_name || d.property_name || 'Family', d.expiry_date, d.id);
  }
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(Date.now() + horizon * 86400000).toISOString().slice(0, 10);
  return items
    .filter((i) => i.date <= limit)
    .map((i) => ({ ...i, days_left: Math.ceil((new Date(i.date) - new Date(today)) / 86400000) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
app.get('/api/reminders', auth, (req, res) => {
  const horizon = Math.min(Number(req.query.days) || 60, 365);
  res.json(collectReminders(req.user.family_id, horizon));
});

// ---------- site notifications ----------
const THRESHOLDS = [30, 14, 7, 1, 0];
function generateNotifications(fid) {
  const ins = db.prepare('INSERT OR IGNORE INTO notifications (family_id, key, title, body) VALUES (?,?,?,?)');
  for (const r of collectReminders(fid, 31)) {
    if (r.days_left < 0) {
      ins.run(fid, `${r.kind}:${r.ref_id}:${r.date}:overdue`,
        `Overdue: ${r.label}`, `${r.entity || ''} — was due ${r.date}${r.amount ? `, ${r.amount}` : ''}`.trim());
      continue;
    }
    for (const t of THRESHOLDS) {
      if (r.days_left <= t) {
        ins.run(fid, `${r.kind}:${r.ref_id}:${r.date}:${t}`,
          t === 0 ? `Due today: ${r.label}` : `${r.label} — ${r.days_left} day${r.days_left === 1 ? '' : 's'} left`,
          `${r.entity || ''} — due ${r.date}${r.amount ? `, ${r.amount}` : ''}`.trim());
        break; // only the tightest threshold crossed right now
      }
    }
  }
}
app.get('/api/notifications', auth, (req, res) => {
  generateNotifications(req.user.family_id);
  const rows = db.prepare(`
    SELECT n.id, n.title, n.body, n.created_at,
           CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS read
    FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.family_id = ?
    ORDER BY n.id DESC LIMIT 100
  `).all(req.user.id, req.user.family_id);
  res.json({ items: rows, unread: rows.filter((x) => !x.read).length });
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
async function sendMail(to, subject, text) {
  const info = await getMailTransport().sendMail({ from: process.env.MAIL_FROM, to: to.join(', '), subject, text });
  if (process.env.MAIL_DEBUG === '1') console.log('MAIL_DEBUG:', info.message);
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
        if (it.days_left <= 7) key = `adm:${fam.id}:bill:${it.ref_id}:${it.date}:7`;
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
        const to = db.prepare("SELECT email FROM users WHERE family_id = ? AND role IN ('admin','adult') AND email IS NOT NULL").all(fam.id).map((u) => u.email);
        if (to.length) {
          const lines = due.map((i) => `- ${i.label}${i.entity ? ` (${i.entity})` : ''}: due ${i.date}, ${i.days_left === 0 ? 'today' : `in ${i.days_left} day${i.days_left === 1 ? '' : 's'}`}${i.amount ? ` — ${Number(i.amount).toFixed(2)} ${cur}` : ''}`);
          try {
            await sendMail(to, `Family Hub — ${due.length} deadline${due.length === 1 ? '' : 's'} coming up`,
              `Hello,\n\nThese items in ${fam.name}'s Family Hub need attention soon:\n\n${lines.join('\n')}\n\nOpen Family Hub for details and to mark them done.\n`);
            sent++;
          } catch (err) { errors++; releaseKeys(claimed); console.error('email reminders (family):', err.message); }
        }
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
      const tenants = db.prepare("SELECT email FROM users WHERE role = 'tenant' AND tenant_property_id = ? AND email IS NOT NULL").all(prop.id).map((u) => u.email);
      if (!tenants.length) { releaseKeys(claimed); continue; }
      const total = unpaid.reduce((s, c) => s + c.amount, 0);
      const lines = unpaid.map((c) => `- ${c.title}: ${Number(c.amount).toFixed(2)} ${cur}, due ${c.due_date}`);
      try {
        await sendMail(tenants, `Payments for ${prop.name} — due soon`,
          `Hello,\n\nA friendly reminder about your upcoming payments for ${prop.name}:\n\n${lines.join('\n')}\n\nTotal to pay: ${total.toFixed(2)} ${cur}\n\nAfter you pay, open your tenant portal and press "Mark as paid" so the owner can confirm it.\n`);
        sent++;
      } catch (err) { errors++; releaseKeys(claimed); console.error('email reminders (tenant):', err.message); }
    }
  }
  return { sent, errors };
}
// runs shortly after every start (visits wake the app) and every 6 hours while it stays alive;
// a cron hitting /api/cron/email-reminders guarantees a daily check even with zero visits
async function emailReminderTick() {
  try { await runEmailReminders(); } catch (err) { console.error('email reminders:', err.message); }
}
setTimeout(emailReminderTick, 30 * 1000);
setInterval(emailReminderTick, 6 * 3600 * 1000);
app.get('/api/cron/email-reminders', async (req, res) => {
  if (process.env.CRON_TOKEN && req.query.token !== process.env.CRON_TOKEN) return res.status(403).json({ error: 'Bad token' });
  res.json(await runEmailReminders());
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
const CATEGORY_SET = new Set(['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Other']);

// ---------- dashboard stats ----------
app.get('/api/stats', auth, (req, res) => {
  const fid = req.user.family_id;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const byCategory = db.prepare(`
    SELECT category, SUM(amount) AS total FROM expenses
    WHERE family_id = ? AND substr(date,1,7) = ? GROUP BY category ORDER BY total DESC
  `).all(fid, month);
  const income = db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM incomes WHERE family_id = ? AND substr(date,1,7) = ?').get(fid, month).total;
  const spent = db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE family_id = ? AND substr(date,1,7) = ?').get(fid, month).total;
  const trend = db.prepare(`
    SELECT substr(date,1,7) AS m, SUM(amount) AS total FROM expenses
    WHERE family_id = ? AND date >= date('now','start of month','-5 months')
    GROUP BY m ORDER BY m
  `).all(fid);
  const incomeTrend = db.prepare(`
    SELECT substr(date,1,7) AS m, SUM(amount) AS total FROM incomes
    WHERE family_id = ? AND date >= date('now','start of month','-5 months')
    GROUP BY m ORDER BY m
  `).all(fid);
  res.json({ month, byCategory, income, spent, trend, incomeTrend });
});

// ---------- CSV export ----------
app.get('/api/export/expenses.csv', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.date, e.category, e.amount, e.note, u.name AS added_by
    FROM expenses e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.family_id = ? ORDER BY e.date
  `).all(req.user.family_id);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['date,category,amount,note,added_by', ...rows.map((r) => [r.date, r.category, r.amount, r.note, r.added_by].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
  res.send(csv);
});

// SPA fallback
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => console.log(`Family Hub running on http://localhost:${PORT}`));
