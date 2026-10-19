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
  assert.equal(g.challenge, null, 'no figures to set a target from');
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
    assert.equal(levels.length, 26, 'twenty-five levels above the start');
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

  await t.test('the cushion is savings over a month of account spending', () => {
    assert.equal(g.savings.balance, 7000);
    assert.equal(g.savings.avg_spend, 3000);
    assert.equal(g.savings.cover, 2.3);
    const badge = (id) => g.badges.find((b) => b.id === id);
    assert.equal(badge('cushion1').done, true);
    assert.equal(badge('cushion3').done, false);
    assert.ok(Math.abs(badge('cushion3').progress - 7000 / 9000) < 1e-9, 'how close the next one is');
  });

  await t.test('somebody still owed money has the month’s challenge, whatever month it is', () => {
    assert.equal(g.challenge.month, today().slice(0, 7));
    assert.equal(g.challenge.kind, 'people');
    assert.equal(g.challenge.person, 'Mihai', 'named as where to start: the most pressing person owed in lei');
    assert.equal(g.challenge.target, 500, 'a tenth of a month’s income');
    assert.equal(g.challenge.progress, 0);
    assert.equal(g.challenge.done, false);
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
    assert.equal(after.challenge.progress, 300, 'this month’s repayment counts toward the challenge');
    assert.equal(after.challenge.balance, 700);
    // paying Mihai off entirely settles the challenge and earns the first people badge
    await api.post(`/api/loans/${mihai.id}/payments`, { amount: 700, date: today() });
    const paid = (await api.get('/api/game')).body;
    assert.equal(paid.badges.find((b) => b.id === 'people_one').done, true);
    assert.equal(paid.badges.find((b) => b.id === 'people_free').done, false, 'Hans is still owed');
    assert.equal(paid.challenge.kind, 'people', 'the last of it paid this month: the challenge stays, won, until the month is out');
    assert.equal(paid.challenge.done, true);
    assert.equal(paid.challenge.progress, 1000, 'every leu given back this month, to anyone, counts');
    assert.equal(paid.challenge.balance, 0);
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
