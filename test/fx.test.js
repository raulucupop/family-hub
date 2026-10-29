/* The BNR calendar, without a server: when a rate is due again, and when it is too old to trust
   quietly. Times are UTC instants; Bucharest is UTC+3 in summer and UTC+2 in winter. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBnr, fxDue, fxStale, parseRates, bucharest } = require('../lib/fx');

const at = (iso) => new Date(iso);
// a fetch `hoursAgo` before `now`, as SQLite's datetime('now') writes it
const fetchedBefore = (now, hoursAgo) => new Date(now.getTime() - hoursAgo * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

test('the Bucharest clock, across the change to winter time', () => {
  assert.deepEqual(bucharest(at('2026-10-24T10:30:00Z')), { day: '2026-10-24', minute: 13 * 60 + 30, weekday: 6 });
  assert.deepEqual(bucharest(at('2026-10-26T11:30:00Z')), { day: '2026-10-26', minute: 13 * 60 + 30, weekday: 1 });
  assert.equal(bucharest(at('2026-10-29T22:30:00Z')).day, '2026-10-30', 'half past midnight in Bucharest is already tomorrow');
});

test('with no rate kept, BNR is asked every time', () => {
  assert.equal(fxDue(null, at('2026-10-31T12:00:00Z')), true);
  assert.equal(fxDue({ date: null, fetched_at: null }), true);
});

test('a weekend keeps Friday’s fixing; Monday after one o’clock wants the new one', () => {
  const fri = '2026-10-23';
  const sat = at('2026-10-24T13:00:00Z'); // 16:00 in Bucharest
  assert.equal(fxDue({ date: fri, fetched_at: fetchedBefore(sat, 2) }, sat), false, 'no fixing on a Saturday');
  const sun = at('2026-10-25T13:00:00Z');
  assert.equal(fxDue({ date: fri, fetched_at: fetchedBefore(sun, 2) }, sun), false);
  const monMorning = at('2026-10-26T08:00:00Z'); // 10:00
  assert.equal(fxDue({ date: fri, fetched_at: fetchedBefore(monMorning, 2) }, monMorning), false, 'not published yet');
  const monAfter = at('2026-10-26T11:45:00Z'); // 13:45
  assert.equal(fxDue({ date: fri, fetched_at: fetchedBefore(monAfter, 1) }, monAfter), true);
  assert.equal(fxDue({ date: '2026-10-26', fetched_at: fetchedBefore(monAfter, 0.2) }, monAfter), false, 'today’s is already here');
});

test('twice a day regardless, so a failure or a holiday is never the last word', () => {
  const sun = at('2026-10-25T13:00:00Z');
  assert.equal(fxDue({ date: '2026-10-23', fetched_at: fetchedBefore(sun, 12) }, sun), true);
  assert.equal(fxDue({ date: '2026-10-23', fetched_at: fetchedBefore(sun, 11.9) }, sun), false);
  assert.equal(fxDue({ date: '2026-10-23', fetched_at: 'garbage' }, sun), true, 'an unreadable time is treated as long ago');
});

test('a holiday gap is not stale, a week without BNR is', () => {
  // Easter 2027: Good Friday 30 April, Easter Monday 3 May; Thursday's fixing is in force until Tuesday
  assert.equal(fxStale('2027-04-29', at('2027-05-04T08:00:00Z')), false);
  // Christmas and New Year
  assert.equal(fxStale('2026-12-23', at('2026-12-28T08:00:00Z')), false);
  assert.equal(fxStale('2026-10-21', at('2026-10-28T20:00:00Z')), false, 'seven days is still the edge');
  assert.equal(fxStale('2026-10-21', at('2026-10-29T08:00:00Z')), true, 'eight is not');
  assert.equal(fxStale(null), false, 'a fixed or fallback rate has no date to be old by');
});

test('the feed: date required, multiplier honoured, nonsense dropped', () => {
  const cube = (rates) => `<DataSet><Body><Cube date="2026-10-19">${rates}</Cube></Body></DataSet>`;
  assert.deepEqual(parseBnr(cube('<Rate currency="EUR">5.0812</Rate><Rate currency="HUF" multiplier="100">1.4677</Rate>'), ['EUR', 'HUF', 'GBP']),
    { date: '2026-10-19', rates: { EUR: 5.0812, HUF: 0.014677 } }, 'GBP missing is simply absent');
  assert.deepEqual(parseBnr(cube('<Rate currency="EUR">0</Rate><Rate currency="GBP">5..8</Rate>'), ['EUR', 'GBP']).rates, {});
  assert.throws(() => parseBnr('<html>Banca Națională a României</html>', ['EUR']), /no publication date/);
});

test('FX_RATES and FX_FALLBACK read only positive numbers', () => {
  assert.deepEqual(parseRates(' eur:4.97,GBP:5.8,USD:0,CHF:x,:3,'), { EUR: 4.97, GBP: 5.8 });
  assert.deepEqual(parseRates(undefined), {});
});
