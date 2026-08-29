/* A column added to the wrong table does not fail loudly. SQLite lets a column type be several
   words, so a missing comma turns "last_period TEXT" and the line under it into ONE column with a
   nonsense type — the app keeps working, the schema is quietly wrong, and only a fresh install
   differs from a migrated one. That is exactly what happened once. This checks the shape instead
   of trusting that a passing suite means the schema is right. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { spawnSync } = require('node:child_process');

// boot the real db.js in a child, so requiring it cannot collide with anything else in the suite
function freshSchema() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-schema-'));
  const r = spawnSync(process.execPath, ['-e', 'require("./db.js")'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `db.js failed to build a fresh database:\n${r.stderr}`);
  const db = new DatabaseSync(path.join(dir, 'familyhub.db'));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
  const cols = {};
  for (const t of tables) cols[t] = db.prepare(`PRAGMA table_info(${t})`).all();
  db.close();
  return { tables, cols };
}

test('a fresh database has the schema the code expects', async (t) => {
  const { tables, cols } = freshSchema();

  await t.test('no column type is a swallowed neighbour', () => {
    // every type this app uses is one word. A multi-word one means a comma went missing and the
    // line below got eaten into the type.
    const bad = [];
    for (const [table, list] of Object.entries(cols)) {
      for (const c of list) {
        if (/\s|--/.test(c.type)) bad.push(`${table}.${c.name} has type ${JSON.stringify(c.type)}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  await t.test('the flag for card-paid costs is on expenses, not on income', () => {
    const has = (table, col) => cols[table].some((c) => c.name === col);
    assert.ok(has('expenses', 'on_card'));
    assert.ok(has('recurring_expenses', 'on_card'));
    assert.ok(!has('recurring_incomes', 'on_card'), 'income is not paid by card');
    assert.ok(!has('incomes', 'on_card'));
  });

  await t.test('every table this app talks to exists', () => {
    const expected = [
      'families', 'users', 'expenses', 'incomes', 'recurring_expenses', 'recurring_incomes',
      'bills', 'budgets', 'credits', 'credit_payments', 'savings', 'savings_goals',
      'personal_loans', 'personal_loan_payments', 'todos', 'chores', 'documents', 'warranties',
      'vehicles', 'vehicle_records', 'properties', 'property_records', 'tenant_charges',
      'meter_requests', 'maintenance_requests', 'watched_sites', 'watched_items', 'notifications',
    ];
    const missing = expected.filter((t2) => !tables.includes(t2));
    assert.deepEqual(missing, []);
  });

  await t.test('the columns every money total reads are really there', () => {
    const has = (table, col) => cols[table].some((c) => c.name === col);
    assert.ok(has('tenant_charges', 'currency'), 'a charge without its currency is printed in the wrong one');
    assert.ok(has('properties', 'rent_currency'));
    assert.ok(has('personal_loans', 'currency'));
    assert.ok(has('warranties', 'expires_at'));
  });
});
