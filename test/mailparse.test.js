/* The parser is written against the mail these suppliers actually send — the wording below is
   copied from real invoices, not invented. Invoice text is the one thing in this app that cannot be
   guessed at, and a misread amount posted silently would be worse than no feature, which is why
   everything it produces is only ever a draft. */
const test = require('node:test');
const assert = require('node:assert');
const { parseInvoiceEmail } = require('../lib/invoice-parser');

const parse = (mail, todayISO) => parseInvoiceEmail(mail, new Date(todayISO || '2026-08-30T00:00:00Z'));

test('an Orange invoice, as Orange writes it', () => {
  const r = parse({
    from: 'Orange Romania <noreply@notifications.orange.ro>',
    subject: 'Factura ta Orange a fost emisa',
    text: `POP RAUL IOAN , te anuntam ca factura ta Orange a fost emisa pe 7 August si o poti plati pana pe 21 August .
      Valoarea totala de plata este: 230.82 lei
      Cod client 0661747071 Numar factura JAT029859653 Referinta 0232284236
      Factura curenta (RON): 230.82 Servicii 230.82 Rata produse 0.0 Sold precedent (RON): 0.0`,
  });
  assert.equal(r.provider, 'orange');
  assert.equal(r.category, 'mobile');
  assert.equal(r.amount, 230.82, 'Orange writes the decimal with a dot');
  assert.equal(r.due_date, '2026-08-21', '"pana pe 21 August" — the year is not in the mail');
  assert.equal(r.invoice_no, 'JAT029859653');
});

test('an E.ON invoice, as E.ON writes it', () => {
  const r = parse({
    from: 'E.ON Myline <noreply.myline@eon-romania.ro>',
    subject: 'Factura ta E.ON a fost emisă',
    text: `Cod încasare: 21050900007
      Număr factură: 10834704992
      Rest de plată: 57,22 lei
      Efectuează plata până la scadență pentru a evita penalitățile sau întreruperea furnizării.`,
  });
  assert.equal(r.provider, 'eon');
  assert.equal(r.category, 'gas');
  assert.equal(r.amount, 57.22, 'E.ON writes the decimal with a comma');
  assert.equal(r.invoice_no, '10834704992');
});

test('a Retim invoice: known by its sender, with nothing in the body to read an amount from', () => {
  // the real mail: "Informare emitere factura" from facturare@retim.ro, a PDF and no text
  const r = parse({ from: 'RETIM SA <facturare@retim.ro>', subject: 'Informare emitere factura', text: '' });
  assert.equal(r.provider, 'retim');
  assert.equal(r.label, 'Retim');
  assert.equal(r.amount, null, 'no number is invented when the mail has none');
});

test('a Vodafone invoice is known by its sender', () => {
  // only the sender is taken from the real thing; the body wording is not known yet, so this checks
  // recognition and the generic amount rule, not Vodafone's own phrasing
  const r = parse({ from: 'Vodafone Romania <factura@vodafone.ro>', subject: 'Factura', text: 'Total de plată: 64,50 lei' });
  assert.equal(r.provider, 'vodafone');
  assert.equal(r.category, 'mobile');
  assert.equal(r.amount, 64.5);
});

test('the amount label decides, not the first number near "lei"', () => {
  // E.ON shows the invoice total AND what is left to pay; only the second one is owed now
  const r = parse({
    from: 'noreply.myline@eon-romania.ro', subject: 'Factura',
    text: 'Total factură: 412,90 lei. Sold precedent: 355,68 lei. Rest de plată: 57,22 lei.',
  });
  assert.equal(r.amount, 57.22, 'paying the invoice total would overpay by the old balance');
});

test('both thousands conventions land on the same money', () => {
  const a = parse({ from: 'x@y.ro', subject: 's', text: 'Total de plată: 1.234,56 lei' });
  const b = parse({ from: 'x@y.ro', subject: 's', text: 'Total de plată: 1,234.56 lei' });
  assert.equal(a.amount, 1234.56);
  assert.equal(b.amount, 1234.56);

  const grouped = parse({ from: 'x@y.ro', subject: 's', text: 'Total de plată: 1.234 lei' });
  assert.equal(grouped.amount, 1234, 'a lone separator with three digits after it is grouping, not a decimal');
});

test('a month name with no year is read forward, never eleven months into the past', () => {
  // a December invoice opened in January must not be dated last December
  const r = parse({
    from: 'noreply@notifications.orange.ro', subject: 'Factura',
    text: 'o poti plati pana pe 28 decembrie',
  }, '2027-01-15T00:00:00Z');
  assert.equal(r.due_date, '2027-12-28');

  const near = parse({
    from: 'noreply@notifications.orange.ro', subject: 'Factura',
    text: 'o poti plati pana pe 5 august',
  }, '2026-08-30T00:00:00Z');
  assert.equal(near.due_date, '2026-08-05', 'a date a few days past is this month, not next year');
});

test('an explicit dd.mm.yyyy scadență wins over a bare month name', () => {
  const r = parse({
    from: 'facturi@hidroelectrica.ro', subject: 'Factura Hidroelectrica',
    text: 'Data scadentă: 15.09.2026. Total de plată: 89,40 lei. Plătiți până pe 20 septembrie.',
  });
  assert.equal(r.provider, 'hidroelectrica');
  assert.equal(r.category, 'electricity');
  assert.equal(r.due_date, '2026-09-15');
  assert.equal(r.amount, 89.4);
});

test('an unknown sender still produces something a person can finish', () => {
  const r = parse({
    from: 'facturare@ceva-nou.ro', subject: 'Factura ta pe august',
    text: 'Suma de plată: 210,00 lei',
  });
  assert.equal(r.provider, null, 'not pretending to recognise a supplier it does not know');
  assert.equal(r.category, 'other');
  assert.equal(r.amount, 210);
  assert.equal(r.label, 'Factura ta pe august', 'the subject is the best name available');
});

test('a mail with no money in it does not invent an amount', () => {
  const r = parse({
    from: 'noreply.myline@eon-romania.ro',
    subject: 'Îți mulțumim pentru plata facturii E.ON',
    text: 'Am primit plata ta. Îți mulțumim!',
  });
  assert.equal(r.amount, null, 'a blank the person fills in beats a number that is wrong');
  assert.equal(r.due_date, null);
});

test('a Vodafone invoice, as Vodafone writes it', () => {
  // the HTML mail from MyVodafone, tags taken out: "(TVA inclus)" sits between label and number,
  // and the dates are ISO, with the issue date printed just before the due date
  const r = parse({
    from: 'MyVodafone.no-reply@vodafone.ro',
    subject: 'Factura ta Vodafone a fost emisa',
    text: `Buna, Factura ta Vodafone a fost emisa. Total de plata: (TVA inclus) 29.82 lei Plateste acum
      DATELE FACTURII Cod client: 100000001 Numar factura: VDF100000001 Data emiterii: 2026-10-14
      De platit pana la: 2026-11-13 Am anexat si factura PDF`,
  }, '2026-10-18T00:00:00Z');
  assert.equal(r.provider, 'vodafone');
  assert.equal(r.amount, 29.82);
  assert.equal(r.due_date, '2026-11-13', 'the due date, not the issue date printed above it');
  assert.equal(r.invoice_no, 'VDF100000001');
});

test('a Hidroelectrica invoice, as Hidroelectrica writes it', () => {
  // the mail carries no due date — that one is only in the PDF
  const r = parse({
    from: 'Hidroelectrica <crm@hidroelectrica.ro>',
    subject: 'Factura Hidroelectrica FX-00000000001 a fost generata',
    text: `Stimate Client, Vă informăm că s-a emis factura pentru serviciile de furnizare energie electrică
      de către S.P.E.E.H Hidroelectrica S.A. Factura cuprinde următoarele informații:
      Cod client: 1000000000 Număr factură: FX-00000000001 Valoare factură curentă: 241,47 lei
      Total de plată: 241,47 lei`,
  }, '2026-10-16T00:00:00Z');
  assert.equal(r.provider, 'hidroelectrica', 'known by the address inside the angle brackets');
  assert.equal(r.amount, 241.47);
  assert.equal(r.due_date, null);
  assert.equal(r.invoice_no, 'FX-00000000001');
});

test('a Retim invoice with the amount in the body', () => {
  // since 2026 the body says what the invoice is worth; the due date is still only in the PDF
  const r = parse({
    from: 'RETIM SA <facturare@retim.ro>',
    subject: 'Informare emitere factura',
    text: `INFORMARE emitere factura Stimate client, Va informam ca v-am emis o factura, pe care o regasiti
      atasata acestui email. COD CLIENT 100000 NUMAR FACTURA 20000001 VALOARE FACTURA 67,45 lei Platiti factura`,
  }, '2026-10-16T00:00:00Z');
  assert.equal(r.provider, 'retim');
  assert.equal(r.amount, 67.45);
  assert.equal(r.invoice_no, '20000001');
});
