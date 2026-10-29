/* The BNR reference rate: reading curs.bnr.ro, and knowing when what we have is out of date.
   Kept apart from server.js so the calendar can be tested at any hour of any day, and not only at
   the one the test suite happens to run at.

   BNR publishes one fixing per working day, a little after 13:00 Bucharest time. Saturdays,
   Sundays and the bank holidays have none, and the feed keeps answering with the last working
   day's: a Friday rate on a Sunday is the current rate, not a stale one. */

// The longest honest gap is Easter or Christmas: a Thursday fixing still in force the next
// Monday or Tuesday. A rate a week old means the feed has not been reached, not that BNR rested.
const FX_STALE_DAYS = 7;
// a fixing published at about 13:00; by half past it is there
const PUBLISHED_AT = 13 * 60 + 30;

// { date, rates: { EUR: 5.0812, … } } for the currencies asked for; throws on a feed with no date
function parseBnr(xml, codes) {
  const date = (String(xml).match(/<Cube date="(\d{4}-\d{2}-\d{2})"/) || [])[1];
  if (!date) throw new Error('no publication date in the BNR feed');
  const rates = {};
  for (const code of codes) {
    // a few currencies are quoted per 100 units; EUR and GBP are not, but the multiplier is honoured
    const m = xml.match(new RegExp(`<Rate currency="${code}"(?: multiplier="(\\d+)")?>([\\d.]+)</Rate>`));
    const r = m ? Number(m[2]) / (Number(m[1]) || 1) : NaN;
    if (Number.isFinite(r) && r > 0) rates[code] = r;
  }
  return { date, rates };
}

// the calendar day, the minute of the day and the weekday (0 = Sunday) on a Bucharest wall clock
function bucharest(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}
// SQLite's datetime('now') is UTC with a space and no zone
const sqliteTime = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');

/* Whether to ask BNR again, given the newest fixing kept and when it was last fetched (or null
   when there is none). Asked every hour: with nothing kept, every hour until there is; on a
   working day past the publication, while the fixing kept is an older day's; and otherwise twice
   a day. A failed fetch changes nothing kept, so it is simply tried again the next hour, rather
   than leaving a fresh install without a rate for half a day. */
function fxDue(last, now = new Date()) {
  if (!last || !last.date || !last.fetched_at) return true;
  const b = bucharest(now);
  if (b.weekday >= 1 && b.weekday <= 5 && b.minute >= PUBLISHED_AT && last.date < b.day) return true;
  const fetched = sqliteTime(last.fetched_at);
  return !Number.isFinite(fetched) || now.getTime() - fetched >= 12 * 3600 * 1000;
}

// a fixing older than FX_STALE_DAYS calendar days on the Bucharest clock
function fxStale(date, now = new Date()) {
  if (!date) return false;
  const days = (Date.parse(bucharest(now).day) - Date.parse(date)) / 86400000;
  return days > FX_STALE_DAYS;
}

// "EUR:4.97,GBP:5.8" → { EUR: 4.97, GBP: 5.8 }; anything that is not a positive number is dropped
function parseRates(s) {
  return Object.fromEntries(String(s || '').split(',').map((p) => p.split(':'))
    .filter(([c, r]) => c && c.trim() && Number(r) > 0).map(([c, r]) => [c.trim().toUpperCase(), Number(r)]));
}

module.exports = { parseBnr, fxDue, fxStale, parseRates, bucharest, FX_STALE_DAYS };
