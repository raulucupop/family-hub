#!/usr/bin/env node
/* cPanel pipes a delivered email into this script's stdin; it posts the raw message to Family Hub
   and exits. Deliberately tiny and dependency-free: it runs outside the app, under Exim, with no
   supervision — anything clever in here fails silently at 3am and bounces somebody's invoice.
   All the parsing happens on the app side, where it is tested.

   Exit codes matter to Exim: 0 accepts the message, anything else bounces it back to the sender.
   A Family Hub that is down should not bounce an invoice to E.ON, so delivery problems exit 0 and
   leave a line in the log instead. */
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');

// Set by the forwarder line in cPanel:  INBOUND_URL=https://lafamiliapop.ro/api/mail/inbound/<token>
const URL_STR = process.env.INBOUND_URL || '';
const LOG = process.env.INBOUND_LOG || '/home/lafamiliapop/mail-pipe.log';

const log = (msg) => {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch { /* nothing to do */ }
};

if (!URL_STR) { log('INBOUND_URL is not set — message dropped'); process.exit(0); }

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const raw = Buffer.concat(chunks);
  // 12 MB matches the limit on the receiving end; a bigger message is a mistake, not an invoice
  if (raw.length > 12 * 1024 * 1024) { log(`message too large (${raw.length} bytes) — dropped`); process.exit(0); }

  let u;
  try { u = new URL(URL_STR); } catch { log('INBOUND_URL is not a URL — message dropped'); process.exit(0); }
  const lib = u.protocol === 'http:' ? http : https;

  const req = lib.request(u, {
    method: 'POST',
    headers: { 'Content-Type': 'message/rfc822', 'Content-Length': raw.length },
    timeout: 30000,
  }, (res) => {
    const body = [];
    res.on('data', (c) => body.push(c));
    res.on('end', () => {
      log(`${res.statusCode} ${Buffer.concat(body).toString('utf8').slice(0, 200)}`);
      process.exit(0);
    });
  });
  req.on('timeout', () => { req.destroy(); log('timed out'); process.exit(0); });
  req.on('error', (e) => { log(`failed: ${e.message}`); process.exit(0); });
  req.end(raw);
});
