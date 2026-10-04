#!/usr/bin/env node
/* The NAS at home runs this over SSH every night and saves what it prints:
     ssh -i <key> user@host > familyhub-YYYY-MM-DD.tar.gz
   stdout is one gzipped tar holding a consistent snapshot of the database (familyhub.db) and every
   uploaded file (uploads/…) — the database alone cannot restore a scan, it only describes it.

   It is meant to be the forced command of one SSH key in ~/.ssh/authorized_keys, so that key can
   do nothing but this: no shell, no sftp, no port forwarding. It takes no arguments on purpose —
   there is nothing a caller can steer.

   Standalone rather than requiring db.js: that file runs migrations on open, and a backup must
   never be the thing that changes the database it is copying. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { tarEntries } = require('../lib/tar');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'familyhub.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function openReadOnly(file) {
  if (process.env.FORCE_NODE_SQLITE !== '1') {
    try { return new (require('better-sqlite3'))(file, { readonly: true, fileMustExist: true }); }
    catch (err) { if (err.code !== 'MODULE_NOT_FOUND' && !/binding|ELF|GLIBC/i.test(err.message)) throw err; }
  }
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(file, { readOnly: true });
}

function main() {
  if (!fs.existsSync(DB_FILE)) throw new Error(`no database at ${DB_FILE}`);
  // The snapshot is written next to the live database, not to /tmp: on a shared host /tmp is
  // readable by every other account, and this file is the whole household.
  const tmp = path.join(DATA_DIR, `nas-backup-${crypto.randomBytes(6).toString('hex')}.db`);
  try {
    const db = openReadOnly(DB_FILE);
    // VACUUM INTO, not a file copy: in WAL mode the .db on disk can be missing what is still in
    // the -wal file, and a copy taken mid-checkpoint is torn. This is one consistent read.
    db.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    db.close();
    const uploads = fs.existsSync(UPLOAD_DIR)
      ? fs.readdirSync(UPLOAD_DIR).filter((f) => { try { return fs.statSync(path.join(UPLOAD_DIR, f)).isFile(); } catch { return false; } })
      : [];
    const tar = tarEntries([['familyhub.db', tmp], ...uploads.map((f) => [`uploads/${f}`, path.join(UPLOAD_DIR, f)])]);
    // stdout.write, not writeSync(1): over an SSH pipe a large synchronous write can come back
    // half-done with EAGAIN; the stream drains the rest before the process exits
    process.stdout.write(zlib.gzipSync(tar));
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

try { main(); }
catch (err) { process.stderr.write(`nas-backup: ${err.message}\n`); process.exit(1); }
