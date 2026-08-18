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
  amount REAL NOT NULL,       -- what the bank actually charged
  date TEXT NOT NULL,
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  months INTEGER,             -- instalments this payment bought, as the bank counted them
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL -- the expense row this payment logged
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
  rent_due_day INTEGER,        -- day of month rent is due (1-31; clamped to the last day in shorter months)
  lease_start TEXT,            -- tenancy: when the contract started
  lease_end TEXT,              -- ...and when it runs out
  notice_days INTEGER,         -- how many days before lease_end notice has to be given
  deposit_amount REAL,         -- the deposit being held, which has to come back out at the end
  deposit_returned_at TEXT,    -- NULL while it is still held
  tenant_invite_code TEXT,     -- code a tenant uses to register
  payment_link TEXT,           -- e.g. revolut.me link the tenant pays to (amount gets appended)
  managed INTEGER NOT NULL DEFAULT 0, -- 1 = we administer it but don't own it: its costs and rent
                                      -- stay on the property and never enter the family's own books
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
  resolved_at TEXT,
  reopened_at TEXT,   -- set when the tenant reopens a ticket the owner had marked done
  reopen_note TEXT    -- what the tenant says is still wrong, so the owner knows why it came back
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
  day INTEGER NOT NULL DEFAULT 1,   -- day of month (1-31; clamped to the last day in shorter months)
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
  day INTEGER NOT NULL DEFAULT 1,   -- day of month (1-31; clamped to the last day in shorter months)
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
  list TEXT NOT NULL CHECK (list IN ('buy','travel','grocery','targets','baptism')),
  title TEXT NOT NULL,        -- the thing, or (guest lists) the invited family's name
  note TEXT,
  amount REAL,                -- estimated price (buy wishlist), or the gift received (guest list)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who added it / whose target
  done INTEGER NOT NULL DEFAULT 0,
  adults INTEGER,             -- guest list: how many adults that invitation covers
  kids INTEGER,               -- ...and how many children
  seats INTEGER,              -- ...and how many come for a seat only, no menu (the venue bills these apart)
  rsvp TEXT,                  -- NULL = no answer yet, 'yes' = coming, 'no' = declined
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_list_items_family ON list_items(family_id);

-- Recurring household chores. Unlike list_items (a thing you tick once and it's gone), a chore
-- comes back: "feed the dogs" is done for today, not done forever. So the chore row holds only the
-- definition, and every completion is its own row keyed by the period it belongs to — which means
-- the tick resets by itself when the period rolls over, and you keep a history of who did what.
CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  weekday INTEGER,            -- weekly only: 0 = Monday … 6 = Sunday; NULL means any day that week
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = anyone in the family
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chores_family ON chores(family_id);

-- one row per chore per period. The period column is the date for a daily chore and the Monday of
-- the week for a weekly one, so UNIQUE does the "already ticked" check rather than SELECT-then-INSERT.
CREATE TABLE IF NOT EXISTS chore_done (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who actually ticked it
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chore_id, period)
);
CREATE INDEX IF NOT EXISTS idx_chore_done_family ON chore_done(family_id, period);

-- bank import: remembers what was already imported so re-uploading a statement is safe
CREATE TABLE IF NOT EXISTS imported_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, hash)
);

-- Tables at an event, and which invitation sits at which. The unit that moves is the invitation,
-- not the person: "Familia Popescu" is 2 adults + 1 child and they sit together, so a party occupies
-- adults + kids + seats chairs at one table. capacity is what the venue gave you per table.
CREATE TABLE IF NOT EXISTS event_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,   -- display order, so the plan matches the room
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_tables_family ON event_tables(family_id, sort);

-- money lent to somebody outside the family. Deliberately not a credit: there is no interest, no
-- schedule and no amortisation to compute, just an amount handed over and whatever comes back. It is
-- also not an expense — the money is expected back, so counting it as spending would misstate the
-- household twice, once on the way out and again on the way in.
CREATE TABLE IF NOT EXISTS personal_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  person TEXT NOT NULL,        -- who is holding the money
  amount REAL NOT NULL,        -- what was handed over
  currency TEXT,        -- the loan's own; NULL means it predates this column and is household currency
  date TEXT NOT NULL,
  due_date TEXT,               -- when it was promised back; NULL = no date was agreed
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who in the family lent it
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_personal_loans_family ON personal_loans(family_id);

-- repayments against a loan. Rows rather than a running balance, so somebody paying back in
-- instalments leaves a history, and deleting one entered by mistake restores the debt.
CREATE TABLE IF NOT EXISTS personal_loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES personal_loans(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_personal_loan_payments_loan ON personal_loan_payments(loan_id);

-- one-off jobs: the things done once that then stay done. A chore is a definition plus a completion
-- per period, which is exactly what makes it come back; a todo has no period at all, so it carries
-- its own done flag and the moment it was ticked.
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = anyone in the family
  note TEXT,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todos_family ON todos(family_id, done);

-- Pages watched for changes. A commune publishes an auction with two weeks' notice and nothing
-- tells you; this is the thing that tells you. Two kinds, because they need different treatment:
-- 'feed' reads an RSS/Atom feed, which is what a site publishes *for* this purpose and gives a
-- stable id per announcement; 'page' diffs the readable text of an ordinary page, for sites with
-- no feed. Prefer feed wherever one exists — HTML diffing reports rotating banners as news.
CREATE TABLE IF NOT EXISTS watched_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'feed' CHECK (kind IN ('feed','page')),
  keywords TEXT,                       -- comma separated; a match is flagged, it does not filter
  active INTEGER NOT NULL DEFAULT 1,
  -- 'page' kind only: the readable text as last seen, so the next check can say what was ADDED
  -- rather than only that something moved
  snapshot TEXT,
  seeded INTEGER NOT NULL DEFAULT 0,   -- the first check records what is there and stays quiet
  last_checked_at TEXT,
  last_change_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_watched_sites_family ON watched_sites(family_id, active);

-- One row per announcement ever seen. UNIQUE(site_id, guid) is what makes "what is new" a fact
-- rather than a guess: the insert either lands or does nothing, so a re-check of the same feed
-- cannot re-announce anything, and a crash mid-run cannot lose an item either.
CREATE TABLE IF NOT EXISTS watched_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES watched_sites(id) ON DELETE CASCADE,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  summary TEXT,
  published_at TEXT,
  hit INTEGER NOT NULL DEFAULT 0,      -- matched one of the keywords
  -- 0 for the baseline recorded on the first check: real notices, but not news to anybody, so
  -- they are listed and never alerted. Without this the bell filled with the whole archive.
  announced INTEGER NOT NULL DEFAULT 1,
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_watched_items_family ON watched_items(family_id, seen_at);

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
-- Quieting an alert without doing the task yet. Keyed on the ITEM (kind:ref:date) rather than the
-- alert row, so it survives the alert being regenerated at a tighter threshold — and so renewing
-- the thing (which moves the date, hence the key) brings it back on its own.
CREATE TABLE IF NOT EXISTS alert_snoozes (
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  until TEXT NOT NULL,
  PRIMARY KEY (user_id, item_key)
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
// the pieces an alert is built from, so its text can be rendered in each reader's own language
// (the stored title/body stay English and still drive the "did the message move on" check)
if (!notifCols.includes('params')) db.exec('ALTER TABLE notifications ADD COLUMN params TEXT');

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

// The guest list needs head counts, an RSVP and a gift — and 'baptism' has to satisfy the `list`
// CHECK constraint, which SQLite bakes into the table definition and no ALTER can widen. So the
// table is rebuilt: new shape, rows copied across, old one dropped. Guarded on a column that only
// the new shape has, so it runs exactly once.
const liCols = db.prepare('PRAGMA table_info(list_items)').all().map((c) => c.name);
if (!liCols.includes('adults')) {
  db.pragma('foreign_keys = OFF'); // ...so the copy is not judged mid-flight
  db.transaction(() => {
    db.exec(`
      CREATE TABLE list_items_rebuild (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        list TEXT NOT NULL CHECK (list IN ('buy','travel','grocery','targets','baptism')),
        title TEXT NOT NULL,
        note TEXT,
        amount REAL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        done INTEGER NOT NULL DEFAULT 0,
        adults INTEGER,
        kids INTEGER,
        rsvp TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO list_items_rebuild (id, family_id, list, title, note, amount, user_id, done, created_at)
        SELECT id, family_id, list, title, note, amount, user_id, done, created_at FROM list_items;
      DROP TABLE list_items;
      ALTER TABLE list_items_rebuild RENAME TO list_items;
      CREATE INDEX IF NOT EXISTS idx_list_items_family ON list_items(family_id);
    `);
  })();
  db.pragma('foreign_keys = ON');
}

// Some guests come to the party but take no menu — they only need a chair, which the venue bills
// apart from the meals. Re-read the columns rather than reusing `liCols`: the rebuild above may
// have just replaced the table, and that older shape has no `seats`.
if (!db.prepare('PRAGMA table_info(list_items)').all().some((c) => c.name === 'seats')) {
  db.exec('ALTER TABLE list_items ADD COLUMN seats INTEGER');
}
// Which table an invitation sits at. Declared as a reference for documentation, but the deletion of
// a table clears this column explicitly in the endpoint rather than leaning on ON DELETE SET NULL —
// a column added by ALTER TABLE is an awkward place to rely on cascade behaviour, and "delete the
// table, the guests go back to the pool" is worth being able to read in the code that does it.
// Money lent abroad or to somebody who deals in euro is not household currency. Rows written
// before this existed are household currency, which is what NULL means here.
if (!db.prepare('PRAGMA table_info(personal_loans)').all().some((c) => c.name === 'currency')) {
  db.exec('ALTER TABLE personal_loans ADD COLUMN currency TEXT');
}
if (!db.prepare('PRAGMA table_info(watched_items)').all().some((c) => c.name === 'announced')) {
  db.exec('ALTER TABLE watched_items ADD COLUMN announced INTEGER NOT NULL DEFAULT 1');
}
if (!db.prepare('PRAGMA table_info(list_items)').all().some((c) => c.name === 'table_id')) {
  db.exec('ALTER TABLE list_items ADD COLUMN table_id INTEGER REFERENCES event_tables(id) ON DELETE SET NULL');
}

// an anticipated payment made at the bank counter knocks a known number of instalments off the
// schedule; recording that alongside the sum keeps the history honest about what was bought
const cpCols = db.prepare('PRAGMA table_info(credit_payments)').all().map((c) => c.name);
if (!cpCols.includes('months')) db.exec('ALTER TABLE credit_payments ADD COLUMN months INTEGER');
// An advance payment is money that left the account, so it belongs in the expense list like the
// monthly instalment already does. Holding the id lets the expense be removed again if the payment
// is deleted, and stops a second one being written for a payment that already has one.
if (!cpCols.includes('expense_id')) db.exec('ALTER TABLE credit_payments ADD COLUMN expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL');

const maintCols = db.prepare('PRAGMA table_info(maintenance_requests)').all().map((c) => c.name);
if (!maintCols.includes('reopened_at')) db.exec('ALTER TABLE maintenance_requests ADD COLUMN reopened_at TEXT');
if (!maintCols.includes('reopen_note')) db.exec('ALTER TABLE maintenance_requests ADD COLUMN reopen_note TEXT');

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

// The tenancy itself, which the app tracked the money for but never the contract. All three carry
// money: a lease runs out, notice has to be given a fixed number of days before that, and the
// deposit is a sum being held that has to come back out at the end.
const propCols4 = db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name);
if (!propCols4.includes('lease_start')) db.exec('ALTER TABLE properties ADD COLUMN lease_start TEXT');
if (!propCols4.includes('lease_end')) db.exec('ALTER TABLE properties ADD COLUMN lease_end TEXT');
if (!propCols4.includes('notice_days')) db.exec('ALTER TABLE properties ADD COLUMN notice_days INTEGER');
if (!propCols4.includes('deposit_amount')) db.exec('ALTER TABLE properties ADD COLUMN deposit_amount REAL');
if (!propCols4.includes('deposit_returned_at')) db.exec('ALTER TABLE properties ADD COLUMN deposit_returned_at TEXT');

const propCols = db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name);
if (!propCols.includes('owner_id')) db.exec('ALTER TABLE properties ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
if (!propCols.includes('rent_amount')) db.exec('ALTER TABLE properties ADD COLUMN rent_amount REAL');
if (!propCols.includes('rent_due_day')) db.exec('ALTER TABLE properties ADD COLUMN rent_due_day INTEGER');
if (!propCols.includes('tenant_invite_code')) db.exec('ALTER TABLE properties ADD COLUMN tenant_invite_code TEXT');
if (!propCols.includes('managed')) db.exec('ALTER TABLE properties ADD COLUMN managed INTEGER NOT NULL DEFAULT 0');

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
