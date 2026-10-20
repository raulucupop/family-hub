/* The dashboard's money game. A game that rewards the wrong thing is worse than none, so every
   figure is checked against the household's own rows: the level is the share of borrowed money
   paid back, a card purchase is not counted twice, a loan in euro is never added to lei, and
   another family's numbers never show up. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today } = require('./helpers');

// the first day of the month `offset` months from this one, as the server's UTC clock sees it
const monthDay = (offset, day = 10) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, day)).toISOString().slice(0, 10);
};

test('an empty household starts at the bottom with nothing to claim', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const g = (await api.get('/api/game')).body;
  assert.equal(g.debt.borrowed, 0);
  assert.equal(g.debt.paid_pct, null, 'no debt means no percentage, not 0% or 100%');
  assert.equal(g.debt.level, 0);
  assert.deepEqual(g.debt.credits, []);
  assert.equal(g.streak, 0);
  assert.equal('challenge' in g, false, 'there is no month’s challenge any more');
  const ids = g.badges.map((b) => b.id);
  assert.ok(!ids.includes('quarter') && !ids.includes('closed'), 'debt badges only for a household that borrowed');
  assert.ok(!ids.includes('goal') && !ids.includes('budget'), 'nothing to win without a goal or a budget');
  assert.ok(g.badges.every((b) => !b.done), 'nothing is earned by doing nothing');
});

test('the game counts the household’s own money, once, in its own currency', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  // a two-year credit that started a year ago: about half of it is paid back
  const credit = (await api.post('/api/credits', { name: 'Mașina', principal: 10000, interest_rate: 12, term_months: 24, start_date: monthDay(-12, 15) })).body;
  // money owed to a person, in lei and in euro; only the lei one belongs in a lei total
  const mihai = (await api.post('/api/loans', { person: 'Mihai', amount: 1000, date: monthDay(-2), due_date: monthDay(2), direction: 'in' })).body;
  await api.post('/api/loans', { person: 'Hans', amount: 500, date: monthDay(-2), direction: 'in', currency: 'EUR' });
  // three complete months ahead: 5000 in, 3000 out of the account
  for (const m of [-3, -2, -1]) {
    assert.equal((await api.post('/api/incomes', { source: 'Salariu', amount: 5000, date: monthDay(m) })).status, 200);
    assert.equal((await api.post('/api/expenses', { category: 'Groceries', amount: 3000, date: monthDay(m) })).status, 200);
  }
  // a card purchase last month: the account pays it later as the card bill, so it is not spending
  // twice, and counting it would wrongly break the streak
  await api.post('/api/expenses', { category: 'Restaurants', amount: 9000, date: monthDay(-1), on_card: 1 });
  await api.post('/api/savings', { kind: 'deposit', amount: 7000, date: monthDay(-1) });

  const g = (await api.get('/api/game')).body;
  const c = (await api.get('/api/credits')).body.find((x) => x.id === credit.id);

  await t.test('the level is the share paid back, with money owed to people weighing three times', () => {
    assert.equal(g.debt.borrowed, 11000, 'the credit and the lei loan; the euro loan stays out');
    assert.equal(g.debt.owed, Math.round((c.balance + 1000) * 100) / 100);
    assert.equal(g.debt.people_weight, 3);
    // 10 000 to the bank plus 3 × 1 000 to Mihai, of which only the bank part has been paid
    const pct = Math.round(((10000 - c.balance) / 13000) * 1000) / 10;
    assert.equal(g.debt.paid_pct, pct);
    const levels = g.debt.levels;
    assert.equal(levels.length, 52, 'fifty levels, the start and the top');
    assert.deepEqual([levels[1], levels[11], levels[21], levels[31], levels[41]], [0.5, 10, 30, 55, 80], 'where each rank begins');
    assert.ok(levels.slice(1).every((x, i) => x > levels[i]), 'each level is further than the last');
    assert.equal(g.debt.level, levels.filter((x) => pct >= x).length - 1);
    assert.equal(g.debt.next_pct, levels[g.debt.level + 1]);
    assert.ok(g.debt.to_next > 0, 'there is always a next amount to pay until the top');
    assert.ok(g.debt.level_progress >= 0 && g.debt.level_progress < 1);
    if (g.debt.to_next_people != null) assert.ok(Math.abs(g.debt.to_next_people - g.debt.to_next / 3) < 0.01, 'the same step, a third of the money');
    assert.equal(g.debt.free_date, c.payoff_date, 'the debt-free date is the Credits tab’s own');
    assert.equal(g.debt.loans_owed, 1000);
  });

  await t.test('the calculator gets what it needs for the open credit', () => {
    assert.equal(g.debt.credits.length, 1);
    const [k] = g.debt.credits;
    assert.equal(k.balance, c.balance);
    assert.ok(Math.abs(k.payment - c.monthly_payment) < 0.005, 'the instalment, before rounding to bani');
    assert.equal(k.rate, 0.01, '12% a year is 1% a month');
  });

  await t.test('three months ahead is a streak of three, the card purchase notwithstanding', () => {
    assert.equal(g.streak, 3);
    const badge = (id) => g.badges.find((b) => b.id === id);
    assert.equal(badge('plus').done, true);
    assert.equal(badge('streak3').done, true);
  });

  await t.test('the cushion is savings over a month of the bare necessities, not of everything', () => {
    assert.equal(g.savings.balance, 7000);
    assert.equal(g.savings.avg_spend, 3000, 'the average month of everything is still reported');
    // no bills and no list yet: a month of necessities is the credit's instalment alone
    assert.equal(g.savings.month, c.monthly_total);
    assert.equal(g.savings.cover, Math.round((7000 / c.monthly_total) * 10) / 10);
    const badge = (id) => g.badges.find((b) => b.id === id);
    assert.equal(badge('cushion1').done, true);
    assert.equal(badge('cushion6').done, 7000 / c.monthly_total >= 6);
  });

  await t.test('a date promised to a person becomes a monthly plan', () => {
    // Mihai was promised his 1 000 within three months: this one and the two after it
    const p = g.debt.people.find((x) => x.person === 'Mihai');
    assert.equal(p.plan.months_left, 3);
    assert.equal(p.plan.monthly, 333.33);
    assert.equal(p.plan.back_now, 0);
    assert.equal(g.debt.people.find((x) => x.person === 'Hans').plan, null, 'no date, no plan');
  });

  await t.test('the people owed are listed first, in their own currency, the most pressing first', () => {
    assert.deepEqual(g.debt.people.map((p) => [p.person, p.currency, p.balance]), [['Mihai', 'RON', 1000], ['Hans', 'EUR', 500]]);
    assert.deepEqual(g.badges.slice(0, 2).map((b) => [b.id, b.done]), [['people_one', false], ['people_free', false]]);
  });

  await t.test('a leu given back to a person moves the level three times as far', async () => {
    assert.equal((await api.post(`/api/loans/${mihai.id}/payments`, { amount: 300, date: today() })).status, 200);
    const after = (await api.get('/api/game')).body;
    const expected = Math.round(((10000 - c.balance + 3 * 300) / 13000) * 1000) / 10;
    assert.equal(after.debt.paid_pct, expected);
    assert.equal(after.debt.owed, Math.round((c.balance + 700) * 100) / 100, 'the money itself is counted once');
    const plan = after.debt.people.find((x) => x.person === 'Mihai').plan;
    assert.equal(plan.back_now, 300, 'this month’s repayment shows against the plan');
    assert.equal(plan.monthly, 333.33, 'the plan is set from what was owed on the first, so paying keeps its pace');
    // paying Mihai off entirely earns the first people badge
    await api.post(`/api/loans/${mihai.id}/payments`, { amount: 700, date: today() });
    const paid = (await api.get('/api/game')).body;
    assert.equal(paid.badges.find((b) => b.id === 'people_one').done, true);
    assert.equal(paid.badges.find((b) => b.id === 'people_free').done, false, 'Hans is still owed');
    assert.deepEqual(paid.debt.people.map((x) => x.person), ['Hans']);
  });

  await t.test('the tenant of the household’s flat sees none of it', async () => {
    const prop = (await api.post('/api/properties', { name: 'Garsoniera' })).body;
    const code = (await api.post(`/api/properties/${prop.id}/tenant/invite`)).body.invite_code;
    // the tenant gets a session of their own, so the owner's client keeps its own
    const res = await fetch(`http://127.0.0.1:${api.port}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Chiriaș', email: `chirias${api.port}@test.ro`, password: 'Parola12345', code }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const cookie = res.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    const seen = await fetch(`http://127.0.0.1:${api.port}/api/game`, { headers: { Cookie: cookie } });
    assert.equal(seen.status, 403, 'a tenant shares the family id, never its debts and savings');
  });
});

test('the game needs a session', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const r = await fetch(`http://127.0.0.1:${api.port}/api/game`);
  assert.equal(r.status, 401);
});

// the calculator runs in the browser; it is lifted out of the source the browser loads
const appSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
const simSrc = appSrc.slice(appSrc.indexOf('function gameSimulate('), appSrc.indexOf('\n}\n', appSrc.indexOf('function gameSimulate(')) + 2);
const gameSimulate = new Function(`${simSrc}; return gameSimulate;`)();

test('the debt-free calculator agrees with the Credits tab, and an extra only ever helps', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  // a thirty-year mortgage some way in, and a car credit that ends long before it: the car's last
  // instalment must not spill into the mortgage, or the household is told it is free years early
  const start = (back) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 15)).toISOString().slice(0, 10); };
  await api.post('/api/credits', { name: 'Casa', principal: 250000, interest_rate: 6.5, term_months: 360, start_date: start(40) });
  await api.post('/api/credits', { name: 'Mașina', principal: 60000, interest_rate: 9.9, term_months: 60, start_date: start(20) });
  const g = (await api.get('/api/game')).body;
  const cs = (await api.get('/api/credits')).body;
  for (const k of g.debt.credits) {
    const c = cs.find((x) => x.name === k.name);
    assert.equal(gameSimulate([k], 0).months, c.months_left, `${k.name}: no extra is the schedule as it stands`);
  }
  const base = gameSimulate(g.debt.credits, 0);
  assert.equal(base.months, Math.max(...cs.map((c) => c.months_left)), 'together, free when the last one ends');
  const more = gameSimulate(g.debt.credits, 500);
  assert.ok(more.months < base.months, 'paying more finishes sooner');
  assert.ok(more.interest < base.interest, 'and costs less interest');
  assert.deepEqual(gameSimulate([], 500), { months: 0, interest: 0, peopleMonths: 0 });
});

test('the extra goes to the dearest credit first', () => {
  const credits = [
    { balance: 5000, rate: 0.005, payment: 200 },
    { balance: 5000, rate: 0.015, payment: 200 },
  ];
  // the same 300 a month aimed at the 18% credit has to cost less than aimed at the 6% one, and
  // the order the credits are listed in must not matter
  const avalanche = gameSimulate(credits, 300);
  assert.equal(gameSimulate([...credits].reverse(), 300).interest, avalanche.interest);
  const lowOnly = gameSimulate([credits[0]], 300).interest + gameSimulate([credits[1]], 0).interest;
  assert.ok(avalanche.interest < lowOnly, `aimed at 18% (${avalanche.interest.toFixed(0)}) beats aimed at 6% (${lowOnly.toFixed(0)})`);
});

test('the extra pays people back before any credit', () => {
  const credits = [{ balance: 20000, rate: 0.01, payment: 500 }];
  const people = [{ balance: 900 }, { balance: 600 }];
  // without an extra nobody is paid back: there is no schedule for it
  assert.equal(gameSimulate(credits, 0, people).peopleMonths, null);
  // 500 a month clears 1 500 owed to people in three months, and only then turns to the bank
  const sim = gameSimulate(credits, 500, people);
  assert.equal(sim.peopleMonths, 3);
  const bankOnly = gameSimulate(credits, 500);
  assert.ok(sim.months > bankOnly.months, 'the credit waits its turn, which is the price of putting people first');
  assert.ok(sim.months < gameSimulate(credits, 0).months, 'and still ends sooner than with no extra at all');
});

test('a debt in euro counts at the BNR rate, and a date promised becomes a monthly plan', async (t) => {
  const api = await startServer({ FX_RATES: 'EUR:5' });
  t.after(() => api.stop());
  const eni = (await api.post('/api/loans', { person: 'Eni', amount: 3000, currency: 'EUR', date: monthDay(-1), due_date: monthDay(2, 28), direction: 'in' })).body;
  await api.post('/api/loans', { person: 'Coionii', amount: 12000, currency: 'EUR', date: monthDay(-1), due_date: monthDay(14, 28), direction: 'in' });
  const g = (await api.get('/api/game')).body;

  assert.equal(g.debt.borrowed, 75000, '15 000 € at 5 lei');
  assert.equal(g.debt.loans_owed, 75000);
  const [first, second] = g.debt.people;
  assert.equal(first.person, 'Eni', 'the nearer date first');
  assert.equal(first.balance_home, 15000);
  assert.deepEqual(first.plan, { months_left: 3, monthly: 1000, monthly_home: 5000, back_now: 0 }, 'this month and the two after it');
  assert.deepEqual(second.plan, { months_left: 15, monthly: 800, monthly_home: 4000, back_now: 0 });

  // paying Eni a thousand this month: the plan keeps its pace and shows what came back
  await api.post(`/api/loans/${eni.id}/payments`, { amount: 1000, date: today() });
  const after = (await api.get('/api/game')).body;
  assert.deepEqual(after.debt.people[0].plan, { months_left: 3, monthly: 1000, monthly_home: 5000, back_now: 1000 });
});

test('with no rate to be had, a euro debt is listed but never added to lei at par', async (t) => {
  const api = await startServer(); // the test server never reaches BNR
  t.after(() => api.stop());
  await api.post('/api/loans', { person: 'Eni', amount: 3000, currency: 'EUR', date: monthDay(-1), direction: 'in' });
  const g = (await api.get('/api/game')).body;
  assert.equal(g.debt.borrowed, 0);
  assert.equal(g.debt.people.length, 1);
  assert.equal(g.debt.people[0].balance_home, null);
});

test('the quarter and half badges are the plain share; only the level counts people three times', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/credits', { name: 'Casa', principal: 10000, interest_rate: 6, term_months: 120, start_date: today() });
  const ana = (await api.post('/api/loans', { person: 'Ana', amount: 2000, date: monthDay(-1), direction: 'in' })).body;
  await api.post(`/api/loans/${ana.id}/payments`, { amount: 2000, date: today() });
  const g = (await api.get('/api/game')).body;
  // 2 000 of 12 000 paid back is a sixth; counted three times it is 6 000 of 16 000
  assert.equal(g.debt.plain_pct, 16.7);
  assert.equal(g.debt.paid_pct, 37.5);
  assert.equal(g.debt.level, g.debt.levels.indexOf(37.5), 'the level moves with the weight');
  const badge = (id) => g.badges.find((b) => b.id === id);
  assert.equal(badge('quarter').done, false, 'a sixth of the money is not a quarter of it');
  assert.ok(Math.abs(badge('quarter').progress - 16.7 / 25) < 0.01);
});

test('the safety cushion is counted in months of the bare necessities', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const credit = (await api.post('/api/credits', { name: 'Casa', principal: 100000, interest_rate: 6, term_months: 120, start_date: today() })).body;
  await api.post('/api/bills', { name: 'Internet', category: 'internet', amount: 100, due_date: monthDay(1), recur_months: 1 });
  await api.post('/api/bills', { name: 'Tratament', category: 'other', amount: 300, due_date: monthDay(1), recur_days: 30 });
  await api.post('/api/bills', { name: 'Gaz', category: 'gas', amount: 90, due_date: monthDay(0) });
  // a big month of everything else must not make the cushion look smaller
  await api.post('/api/expenses', { category: 'Entertainment', amount: 20000, date: monthDay(-1) });
  await api.post('/api/savings', { kind: 'deposit', amount: 20000, date: monthDay(-1) });

  const put = await api.put('/api/essentials', { items: [{ label: 'Grădiniță Mara', amount: 2500 }, { label: 'Mâncare', amount: 2000 }] });
  assert.equal(put.status, 200, put.text);
  assert.deepEqual(put.body.map((i) => [i.label, i.amount]), [['Grădiniță Mara', 2500], ['Mâncare', 2000]]);

  const g = (await api.get('/api/game')).body;
  const bills = 100 + (300 * 30.4375) / 30 + 90 / 3;
  assert.equal(g.savings.parts.credits, credit.monthly_total);
  assert.equal(g.savings.parts.bills, Math.round(bills * 100) / 100);
  const month = credit.monthly_total + bills + 4500;
  assert.equal(g.savings.month, Math.round(month * 100) / 100);
  assert.equal(g.savings.cover, Math.round((20000 / month) * 10) / 10);

  await t.test('the list is replaced whole, and a bad row is refused', async () => {
    assert.equal((await api.put('/api/essentials', { items: [{ label: '', amount: 10 }] })).status, 400);
    assert.equal((await api.put('/api/essentials', { items: [{ label: 'Mâncare', amount: -1 }] })).status, 400);
    assert.equal((await api.put('/api/essentials', { nope: 1 })).status, 400);
    assert.deepEqual((await api.put('/api/essentials', { items: [{ label: 'Mâncare', amount: 2200 }] })).body.map((i) => i.label), ['Mâncare']);
    assert.deepEqual((await api.get('/api/game')).body.savings.parts.items.map((i) => [i.label, i.amount]), [['Mâncare', 2200]]);
  });
});

test('the BNR feed is read for euro and pound, honouring a multiplier', async (t) => {
  // the same shape curs.bnr.ro serves, trimmed
  const xml = `<?xml version="1.0" encoding="utf-8"?><DataSet xmlns="http://www.bnr.ro/xsd"><Body><OrigCurrency>RON</OrigCurrency>
    <Cube date="2026-10-19"><Rate currency="EUR">5.3272</Rate><Rate currency="GBP" multiplier="1">6.3336</Rate><Rate currency="HUF" multiplier="100">1.4677</Rate></Cube></Body></DataSet>`;
  const feed = require('node:http').createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(xml); });
  await new Promise((r) => feed.listen(0, '127.0.0.1', r));
  const api = await startServer({ FX_URL: `http://127.0.0.1:${feed.address().port}/nbrfxrates.xml` });
  t.after(() => Promise.all([api.stop(), new Promise((r) => feed.close(r))]));
  await api.post('/api/loans', { person: 'Eni', amount: 1000, currency: 'EUR', date: monthDay(-1), direction: 'in' });
  let g;
  for (let i = 0; i < 40; i++) {
    g = (await api.get('/api/game')).body;
    if (g.debt.borrowed > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(g.debt.borrowed, 5327.2, '1 000 € at the published 5,3272');
  assert.equal(g.debt.people[0].rate, 5.3272);
});

test('each calculator moves only its own money', () => {
  const credits = [{ balance: 20000, rate: 0.01, payment: 500 }];
  // Eni is promised within 4 months, so 250 a month; Mihai has no date
  const dated = [{ balance: 1000, pay: 250 }];
  const undated = [{ balance: 600, pay: 0 }];

  // free of credits: people never touch the credit's money, whatever they are owed
  assert.equal(gameSimulate(credits, 500, [...dated, ...undated], 'credits').months, gameSimulate(credits, 500).months);
  // owing nobody: the dates alone finish the dated debt on time, and nothing finishes the undated one
  assert.equal(gameSimulate([], 0, dated, 'people').peopleMonths, 4);
  assert.equal(gameSimulate([], 0, [...dated, ...undated], 'people').peopleMonths, null);
  // an extra aimed at people finishes both, and leaves the credit exactly as it was
  const p = gameSimulate(credits, 500, [...dated, ...undated], 'people');
  assert.equal(p.peopleMonths, 3, '1 600 owed at 250 by the date plus 500 extra: 750, 750, and the last 100');
  assert.equal(p.months, gameSimulate(credits, 0).months, 'the credit keeps its own schedule');
  // free of everything: people first, then the credit, and sooner than the credit alone
  const all = gameSimulate(credits, 500, [...dated, ...undated], 'all');
  assert.equal(all.peopleMonths, 3);
  assert.ok(all.months < gameSimulate(credits, 0).months);
  assert.ok(all.months >= gameSimulate(credits, 500).months, 'paying people first is the price of putting them first');
});
