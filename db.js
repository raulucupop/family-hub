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
  avatar TEXT,                       -- stored filename of a profile picture
  theme TEXT NOT NULL DEFAULT 'light', -- 'light' | 'dark'
  lang TEXT NOT NULL DEFAULT 'en',     -- 'en' | 'ro'
  birthday TEXT,                       -- YYYY-MM-DD
  phone TEXT,
  token_version INTEGER NOT NULL DEFAULT 0, -- bumped on password change; older tokens stop working
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
  slot TEXT,                         -- links the doc to an entity deadline (e.g. 'insurance_expiry','rca_expiry') so it isn't a duplicate reminder
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
  date TEXT NOT NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL, -- optional link; also mirrored into property_records
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL      -- optional link; also mirrored into vehicle_records
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
  commission REAL NOT NULL DEFAULT 0, -- fixed monthly admin commission added to each payment
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,       -- holder; NULL = whole family
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  auto_expense_period TEXT, -- YYYY-MM of the last month whose payment was auto-logged as an expense
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
  recur_days INTEGER NOT NULL DEFAULT 0,   -- day-based cycle (e.g. 30); takes precedence over recur_months
  expense_category TEXT,  -- expense category to log under; NULL = derive it from the bill category
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
  auto_pay INTEGER NOT NULL DEFAULT 0, -- subscription paid automatically: on/after due date it's counted as paid
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,       -- responsible person; NULL = whole family
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,  -- optional link; also mirrored into vehicle_records
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
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- responsible person; NULL = whole family
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
  note TEXT,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  insurance_expiry TEXT,  -- PAD (mandatory home insurance)
  insurance2_expiry TEXT, -- additional / facultative home insurance
  property_tax_due TEXT,  -- local property tax deadline
  mortgage_lender TEXT,
  mortgage_payment REAL,
  mortgage_due_day INTEGER, -- day of month
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = whole family
  rent_amount REAL,            -- monthly rent charged to the tenant
  rent_due_day INTEGER,        -- day of month rent is due (1-28)
  tenant_invite_code TEXT,     -- code a tenant uses to register
  payment_link TEXT,           -- e.g. revolut.me link the tenant pays to (amount gets appended)
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
  attachment TEXT, -- invoice scan the owner attaches; visible to the tenant
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenant_charges_property ON tenant_charges(property_id);

-- meter reading requests (gas/electricity/water): owner asks, tenant answers with a value and/or photo
CREATE TABLE IF NOT EXISTS meter_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  utility TEXT NOT NULL CHECK (utility IN ('electricity','gas','water')),
  period TEXT,               -- YYYY-MM for scheduled requests (one per month per utility)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  reading TEXT,              -- value the tenant typed
  photo TEXT,                -- uploaded meter photo filename
  provided_at TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meter_requests_property ON meter_requests(property_id);

-- maintenance the tenant reports (something broke): description, optional photo, owner marks it done
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- the tenant who reported it
  title TEXT NOT NULL,
  note TEXT,
  photo TEXT,                -- uploaded filename
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance_requests(property_id);

CREATE TABLE IF NOT EXISTS property_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('maintenance','renovation','utility','rent','other_income','other')),
  date TEXT NOT NULL,
  amount REAL,
  note TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- who the spend is attributed to
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL -- linked budget expense (cost records)
);

-- family savings / economy account: members deposit or withdraw funds
CREATE TABLE IF NOT EXISTS savings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  goal_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_savings_family ON savings(family_id);

-- recurring incomes (salaries): auto-logged into incomes once per month on/after 'day'
CREATE TABLE IF NOT EXISTS recurring_incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  amount REAL NOT NULL,
  day INTEGER NOT NULL DEFAULT 1,   -- day of month (1-28)
  active INTEGER NOT NULL DEFAULT 1,
  last_period TEXT                  -- YYYY-MM of the last auto-logged month
);

-- recurring expenses: the fixed costs that are neither a bill with a due date nor a credit
-- (school fees, insurance instalments…). Logged automatically each month like recurring income.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  note TEXT,
  amount REAL NOT NULL,
  day INTEGER NOT NULL DEFAULT 1,   -- day of month (1-28)
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_period TEXT                  -- YYYY-MM of the last auto-logged month
);

-- savings goals: deposits/withdrawals can be tagged with a goal to track progress
CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target REAL NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- owner; NULL = family goal
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- web push subscriptions (one row per device)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- shared family lists: buy/travel wishlists, groceries, personal targets
CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  list TEXT NOT NULL CHECK (list IN ('buy','travel','grocery','targets')),
  title TEXT NOT NULL,
  note TEXT,
  amount REAL,                -- estimated price (buy wishlist)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who added it / whose target
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_list_items_family ON list_items(family_id);

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
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- responsible person; NULL = whole family
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, key)
);

-- one-hour password reset links; only the token's hash is stored
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- which email reminders were already sent (key per item + threshold), so nobody gets spammed
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
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
if (!creditCols.includes('commission')) db.exec('ALTER TABLE credits ADD COLUMN commission REAL NOT NULL DEFAULT 0');
if (!creditCols.includes('auto_expense_period')) db.exec('ALTER TABLE credits ADD COLUMN auto_expense_period TEXT');

const billCols = db.prepare('PRAGMA table_info(bills)').all().map((c) => c.name);
if (!billCols.includes('auto_pay')) db.exec('ALTER TABLE bills ADD COLUMN auto_pay INTEGER NOT NULL DEFAULT 0');
if (!billCols.includes('owner_id')) db.exec('ALTER TABLE bills ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
if (!billCols.includes('property_id')) db.exec('ALTER TABLE bills ADD COLUMN property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL');
if (!billCols.includes('vehicle_id')) db.exec('ALTER TABLE bills ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL');
if (!billCols.includes('recur_days')) db.exec('ALTER TABLE bills ADD COLUMN recur_days INTEGER NOT NULL DEFAULT 0');
if (!billCols.includes('expense_category')) db.exec('ALTER TABLE bills ADD COLUMN expense_category TEXT');

const vehCols = db.prepare('PRAGMA table_info(vehicles)').all().map((c) => c.name);
if (!vehCols.includes('owner_id')) db.exec('ALTER TABLE vehicles ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');

const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('avatar')) db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
// bumped whenever the password changes; tokens carrying an older value stop being accepted,
// so changing your password actually signs the other devices out
if (!userCols.includes('token_version')) db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
if (!userCols.includes('theme')) db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");

const notifCols = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name);
if (!notifCols.includes('owner_id')) db.exec('ALTER TABLE notifications ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');

const propCols2 = db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name);
if (!propCols2.includes('insurance2_expiry')) db.exec('ALTER TABLE properties ADD COLUMN insurance2_expiry TEXT');

const docCols = db.prepare('PRAGMA table_info(documents)').all().map((c) => c.name);
if (!docCols.includes('slot')) db.exec('ALTER TABLE documents ADD COLUMN slot TEXT');

const prCols2 = db.prepare('PRAGMA table_info(property_records)').all().map((c) => c.name);
if (!prCols2.includes('user_id')) db.exec('ALTER TABLE property_records ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
if (!prCols2.includes('expense_id')) db.exec('ALTER TABLE property_records ADD COLUMN expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL');

const vrCols = db.prepare('PRAGMA table_info(vehicle_records)').all().map((c) => c.name);
if (!vrCols.includes('expense_id')) db.exec('ALTER TABLE vehicle_records ADD COLUMN expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL');

const savCols = db.prepare('PRAGMA table_info(savings)').all().map((c) => c.name);
if (!savCols.includes('goal_id')) db.exec('ALTER TABLE savings ADD COLUMN goal_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL');

const tcCols = db.prepare('PRAGMA table_info(tenant_charges)').all().map((c) => c.name);
if (!tcCols.includes('attachment')) db.exec('ALTER TABLE tenant_charges ADD COLUMN attachment TEXT');

const propCols3 = db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name);
if (!propCols3.includes('reading_day')) db.exec('ALTER TABLE properties ADD COLUMN reading_day INTEGER');
if (!propCols3.includes('reading_utilities')) db.exec('ALTER TABLE properties ADD COLUMN reading_utilities TEXT');
if (!propCols3.includes('payment_link')) db.exec('ALTER TABLE properties ADD COLUMN payment_link TEXT');

const famCols = db.prepare('PRAGMA table_info(families)').all().map((c) => c.name);
if (!famCols.includes('cal_token')) db.exec('ALTER TABLE families ADD COLUMN cal_token TEXT');

const expCols = db.prepare('PRAGMA table_info(expenses)').all().map((c) => c.name);
if (!expCols.includes('property_id')) db.exec('ALTER TABLE expenses ADD COLUMN property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL');
if (!expCols.includes('vehicle_id')) db.exec('ALTER TABLE expenses ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL');

if (!userCols.includes('lang')) db.exec("ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'");
if (!userCols.includes('birthday')) db.exec('ALTER TABLE users ADD COLUMN birthday TEXT');
if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
// notification preferences: muted alert groups (CSV; empty = everything on) and quiet hours
// (0-23, both null = off) during which push notifications are held back
if (!userCols.includes('notif_muted')) db.exec("ALTER TABLE users ADD COLUMN notif_muted TEXT NOT NULL DEFAULT ''");
if (!userCols.includes('quiet_start')) db.exec('ALTER TABLE users ADD COLUMN quiet_start INTEGER');
if (!userCols.includes('quiet_end')) db.exec('ALTER TABLE users ADD COLUMN quiet_end INTEGER');

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
