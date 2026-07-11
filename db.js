const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// better-sqlite3 when its native binding loads; otherwise Node's built-in SQLite
// (shared hosts with an old glibc and no compiler can't run the prebuilt binding).
// FORCE_NODE_SQLITE=1 forces the fallback, e.g. for testing it locally.
function openDatabase(file) {
  if (process.env.FORCE_NODE_SQLITE !== '1') {
    try {
      const Database = require('better-sqlite3');
      const d = new Database(file);
      d.pragma('journal_mode = WAL');
      d.pragma('foreign_keys = ON');
      return d;
    } catch { /* fall through to node:sqlite */ }
  }
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  return {
    exec: (sql) => raw.exec(sql),
    pragma: (p) => raw.exec(`PRAGMA ${p}`),
    prepare: (sql) => raw.prepare(sql),
    transaction: (fn) => (...args) => {
      raw.exec('BEGIN');
      try { const result = fn(...args); raw.exec('COMMIT'); return result; }
      catch (err) { try { raw.exec('ROLLBACK'); } catch {} throw err; }
    },
  };
}

const db = openDatabase(path.join(DATA_DIR, 'familyhub.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RON',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,      -- NULL for admin-added children without a login
  password_hash TEXT,     -- NULL for members who can't sign in
  role TEXT NOT NULL CHECK (role IN ('admin','adult','child','tenant')),
  tenant_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL, -- tenants only: the rented property
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- acte: documents linked to a person, vehicle, property, or the family in general
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                -- 'Carte de identitate', 'Pasaport', 'Talon auto'...
  number TEXT,                       -- series / number
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  expiry_date TEXT,                  -- optional; feeds reminders & alerts
  attachment TEXT,                   -- stored filename of uploaded scan
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_family ON documents(family_id);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_family_date ON expenses(family_id, date);

CREATE TABLE IF NOT EXISTS incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incomes_family_date ON incomes(family_id, date);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM
  amount REAL NOT NULL,
  UNIQUE(family_id, category, month)
);

-- credits (loans): payment is derived from principal + dobanda + term;
-- anticipated payments shorten the schedule and the interest saved is computed against the original plan
CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lender TEXT,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL, -- dobanda, % per year
  term_months INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,       -- holder; NULL = whole family
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS credit_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_id INTEGER NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_payments_credit ON credit_payments(credit_id);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT,
  category TEXT NOT NULL, -- electricity, gas, internet, mobile, water, property_tax, other
  amount REAL,
  due_date TEXT NOT NULL,
  recur_months INTEGER NOT NULL DEFAULT 0, -- 0 = one-off, 1 = monthly, 12 = yearly...
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
  attachment TEXT, -- stored filename of uploaded invoice
  notes TEXT
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  paid_at TEXT NOT NULL,
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plate TEXT,
  rca_expiry TEXT,        -- mandatory insurance (RCA)
  casco_expiry TEXT,      -- optional insurance (Casco)
  vignette_expiry TEXT,   -- Rovinieta
  itp_expiry TEXT,        -- technical inspection (ITP)
  road_tax_due TEXT,      -- local vehicle tax
  notes TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('service','tires','fuel','other')),
  date TEXT NOT NULL,
  amount REAL,
  odometer INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  insurance_expiry TEXT,  -- PAD / facultative property insurance
  property_tax_due TEXT,  -- local property tax deadline
  mortgage_lender TEXT,
  mortgage_payment REAL,
  mortgage_due_day INTEGER, -- day of month
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = whole family
  rent_amount REAL,            -- monthly rent charged to the tenant
  rent_due_day INTEGER,        -- day of month rent is due (1-28)
  tenant_invite_code TEXT,     -- code a tenant uses to register
  notes TEXT
);

-- charges shared with a property's tenant: monthly rent (auto-generated) and invoices shared by the owner.
-- tenant marks paid -> 'pending' until the owner confirms -> 'paid'
CREATE TABLE IF NOT EXISTS tenant_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('rent','invoice')),
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  period TEXT, -- YYYY-MM, used to generate each month's rent exactly once
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','pending','paid')),
  marked_paid_at TEXT,
  confirmed_at TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenant_charges_property ON tenant_charges(property_id);

CREATE TABLE IF NOT EXISTS property_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('maintenance','renovation','utility','rent','other_income','other')),
  date TEXT NOT NULL,
  amount REAL,
  note TEXT
);

-- bank import: remembers what was already imported so re-uploading a statement is safe
CREATE TABLE IF NOT EXISTS imported_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, hash)
);

-- site notifications, generated when a deadline crosses a threshold (30/14/7/1/0 days)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, key)
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, user_id)
);
`);

// ---- lightweight migrations for databases created before these columns existed ----
const creditCols = db.prepare('PRAGMA table_info(credits)').all().map((c) => c.name);
if (!creditCols.includes('user_id')) db.exec('ALTER TABLE credits ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
if (!creditCols.includes('property_id')) db.exec('ALTER TABLE credits ADD COLUMN property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL');

const propCols = db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name);
if (!propCols.includes('owner_id')) db.exec('ALTER TABLE properties ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
if (!propCols.includes('rent_amount')) db.exec('ALTER TABLE properties ADD COLUMN rent_amount REAL');
if (!propCols.includes('rent_due_day')) db.exec('ALTER TABLE properties ADD COLUMN rent_due_day INTEGER');
if (!propCols.includes('tenant_invite_code')) db.exec('ALTER TABLE properties ADD COLUMN tenant_invite_code TEXT');

// users: older schemas lack the 'tenant' role or force NOT NULL email/password
// (children added by the admin have neither) — rebuild once, keeping ids
const usersSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() || {}).sql || '';
const usersInfo = db.prepare('PRAGMA table_info(users)').all();
const emailNotNull = (usersInfo.find((c) => c.name === 'email') || {}).notnull === 1;
const hasTenantPropCol = usersInfo.some((c) => c.name === 'tenant_property_id');
if (usersSql && (!usersSql.includes("'tenant'") || emailNotNull)) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    PRAGMA legacy_alter_table=ON;
    BEGIN;
    ALTER TABLE users RENAME TO users_old;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin','adult','child','tenant')),
      tenant_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (id, family_id, name, email, password_hash, role, tenant_property_id, created_at)
      SELECT id, family_id, name, email, password_hash, role, ${hasTenantPropCol ? 'tenant_property_id' : 'NULL'}, created_at FROM users_old;
    DROP TABLE users_old;
    COMMIT;
    PRAGMA legacy_alter_table=OFF;
    PRAGMA foreign_keys=ON;
  `);
}

// property_records: older CHECK constraint lacks the income types ('rent', 'other_income') — rebuild once
const prSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='property_records'").get() || {}).sql || '';
if (prSql && !prSql.includes("'rent'")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN;
    ALTER TABLE property_records RENAME TO property_records_old;
    CREATE TABLE property_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('maintenance','renovation','utility','rent','other_income','other')),
      date TEXT NOT NULL,
      amount REAL,
      note TEXT
    );
    INSERT INTO property_records SELECT id, property_id, family_id, type, date, amount, note FROM property_records_old;
    DROP TABLE property_records_old;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}

module.exports = db;
