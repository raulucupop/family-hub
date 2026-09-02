/* Reading an invoice out of the mail a supplier sends.
   Kept out of server.js so it can be exercised directly against real supplier wording — the one
   part of this app whose input is written by somebody else and changes without warning. */
// ---------- invoices forwarded by email ----------
// Written against the real mail these suppliers send, because invoice wording is not guessable:
//   Orange  "Valoarea totala de plata este: 230.82 lei" ... "o poti plati pana pe 21 August"
//   E.ON    "Rest de plată: 57,22 lei" ... "Număr factură: 10834704992"
// Romanian invoices use BOTH decimal conventions — Orange writes 230.82, E.ON writes 57,22 —
// and thousands separators collide with each: "1.234,56" and "1,234.56" are the same money.
// So the separator is decided per number by which symbol comes last, not by a global setting.
const PROVIDERS = [
  { key: 'eon', label: 'E.ON', category: 'gas', from: /eon-romania\.ro$|@eon\./i, subject: /e\.?on/i },
  { key: 'orange', label: 'Orange', category: 'mobile', from: /orange\.ro$/i, subject: /orange/i },
  { key: 'hidroelectrica', label: 'Hidroelectrica', category: 'electricity', from: /hidroelectrica\.ro$/i, subject: /hidroelectrica/i },
  { key: 'digi', label: 'Digi', category: 'internet', from: /digi(-?ro)?\.ro$|rcs-rds\.ro$/i, subject: /digi|rcs/i },
];

// "1.234,56" -> 1234.56 and "1,234.56" -> 1234.56. Whichever separator appears last is the
// decimal one; anything before it is grouping. A lone separator with exactly two digits after
// it is a decimal, otherwise it is grouping ("1.234" is one thousand two hundred, not 1.234).
function roNumber(raw) {
  let t = String(raw).replace(/[^0-9.,]/g, '');
  if (!t) return null;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  let dec = -1;
  if (lastDot >= 0 && lastComma >= 0) dec = Math.max(lastDot, lastComma);
  else {
    const only = Math.max(lastDot, lastComma);
    if (only >= 0 && t.length - only - 1 === 2) dec = only;
  }
  const whole = dec >= 0 ? t.slice(0, dec) : t;
  const frac = dec >= 0 ? t.slice(dec + 1) : '';
  const n = Number(whole.replace(/[.,]/g, '') + (frac ? '.' + frac : ''));
  return Number.isFinite(n) ? n : null;
}

const RO_MONTHS = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
// "21 August" carries no year: suppliers write the month they are billing for. Read it as the
// next such date rather than this calendar year, or a December invoice read in January lands
// eleven months in the past and never shows up as due.
function roDate(dayStr, monthStr, today = new Date()) {
  const d = Number(dayStr);
  const m = RO_MONTHS.indexOf(String(monthStr).toLowerCase());
  if (!(d >= 1 && d <= 31) || m < 0) return null;
  const y = today.getUTCFullYear();
  let cand = new Date(Date.UTC(y, m, d));
  const cutoff = new Date(today.getTime() - 60 * 86400000);
  if (cand < cutoff) cand = new Date(Date.UTC(y + 1, m, d));
  return cand.toISOString().slice(0, 10);
}

// Amount patterns, most specific first: a total labelled as such beats a number that merely sits
// near the word "lei". "Rest de plată" is what E.ON actually wants now, which is not the same as
// the invoice total when there is an older balance.
const AMOUNT_RULES = [
  /rest\s+de\s+plat[aă]\s*:?\s*([0-9][0-9.,]*)\s*(?:lei|ron)/i,
  /valoarea\s+total[aă]\s+de\s+plat[aă]\s+este\s*:?\s*([0-9][0-9.,]*)\s*(?:lei|ron)/i,
  /total\s+de\s+plat[aă]\s*:?\s*([0-9][0-9.,]*)\s*(?:lei|ron)?/i,
  /sum[aă]\s+de\s+plat[aă]\s*:?\s*([0-9][0-9.,]*)\s*(?:lei|ron)?/i,
  /factur[aă]\s+curent[aă][^0-9]{0,20}([0-9][0-9.,]*)/i,
  /de\s+plat[aă]\s*:?\s*([0-9][0-9.,]*)\s*(?:lei|ron)/i,
  /([0-9][0-9.,]*)\s*lei\b/i,
];
const DUE_RULES = [
  /scadent[aă]\s*:?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/i,
  /(?:pl[aă]ti|plata|achita\w*)\s+p[aâ]n[aă]\s+(?:pe|la)\s+(\d{1,2})\s+([a-zăâîșşţț]+)/i,
  /scadent[aă][^0-9]{0,20}(\d{1,2})\s+([a-zăâîșşţț]+)/i,
  /p[aâ]n[aă]\s+(?:pe|la)\s+(\d{1,2})\s+([a-zăâîșşţț]+)/i,
];

// `text` is the readable body: the plain-text part when there is one, otherwise the HTML with its
// tags taken out. Nothing here trusts the sender — every result is a suggestion on a draft.
function parseInvoiceEmail({ from = '', subject = '', text = '' }, today = new Date()) {
  const hay = String(text).replace(/\s+/g, ' ');
  const prov = PROVIDERS.find((p) => p.from.test(String(from))) ||
    PROVIDERS.find((p) => p.subject.test(String(subject)) || p.subject.test(hay));

  let amount = null;
  for (const re of AMOUNT_RULES) {
    const m = re.exec(hay);
    if (m) { amount = roNumber(m[1]); if (amount != null && amount > 0) break; amount = null; }
  }
  let due = null;
  for (const re of DUE_RULES) {
    const m = re.exec(hay);
    if (!m) continue;
    due = m[3] ? [m[3], String(m[2]).padStart(2, '0'), String(m[1]).padStart(2, '0')].join('-')
      : roDate(m[1], m[2], today);
    if (due) break;
  }
  const inv = /(?:num[aă]r\s+factur[aă]|factura\s+(?:nr|num[aă]r))\s*:?\s*([A-Z0-9-]{4,})/i.exec(hay);

  return {
    provider: prov ? prov.key : null,
    label: prov ? prov.label : (String(subject).trim().slice(0, 60) || 'Factură'),
    category: prov ? prov.category : 'other',
    amount,
    due_date: due,
    invoice_no: inv ? inv[1] : null,
    snippet: hay.slice(0, 400),
  };
}

module.exports = { parseInvoiceEmail, roNumber, roDate, PROVIDERS };
