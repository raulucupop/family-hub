/* The nightly copy on the NAS is only worth having if it restores. These run the script the way
   the NAS does — a child process whose stdout is the file — and open what comes out. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'nas-backup.js');

// read a USTAR archive back into { name: Buffer }
function untar(buf) {
  const out = {};
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(h.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8);
    out[name] = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nasbackup-'));
  const db = new DatabaseSync(path.join(dir, 'familyhub.db'));
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE expenses (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO expenses (note) VALUES ('E.ON')");
  // left open on purpose: the row above may still sit in the -wal file, the case a plain copy gets wrong
  fs.mkdirSync(path.join(dir, 'uploads'));
  fs.writeFileSync(path.join(dir, 'uploads', 'factura.pdf'), '%PDF-1.4 pretend invoice');
  return { dir, db };
}

for (const forceNode of ['0', '1']) {
  test(`the archive holds a database that opens and every upload (FORCE_NODE_SQLITE=${forceNode})`, () => {
    const { dir, db } = makeDataDir();
    try {
      const gz = execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, DATA_DIR: dir, FORCE_NODE_SQLITE: forceNode }, maxBuffer: 64 << 20 });
      const files = untar(zlib.gunzipSync(gz));
      assert.deepStrictEqual(Object.keys(files).sort(), ['familyhub.db', 'uploads/factura.pdf']);
      assert.strictEqual(files['uploads/factura.pdf'].toString(), '%PDF-1.4 pretend invoice');

      const restored = path.join(dir, 'restored.db');
      fs.writeFileSync(restored, files['familyhub.db']);
      const r = new DatabaseSync(restored);
      assert.deepStrictEqual(r.prepare('SELECT note FROM expenses').all().map((x) => x.note), ['E.ON']);
      r.close();

      // the snapshot it built on the way is not left lying next to the live database
      assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.startsWith('nas-backup-')), []);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('no database means a failure the NAS can see, not an empty archive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nasbackup-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DATA_DIR: dir } });
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stdout.length, 0);
    assert.match(r.stderr.toString(), /no database/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
