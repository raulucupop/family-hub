/* Money lent to a person, and the jobs that are done once. Both are new shapes rather than variants
   of something existing, and both have one way of going quietly wrong: a balance that stops matching
   the repayments behind it, and a task that reappears after it was finished. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, today, plusDays } = require('./helpers');

test('a loan to a person is tracked by what has come back', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const loan = (await api.post('/api/loans', {
    person: 'Andrei', amount: 2000, date: today(), due_date: plusDays(60), note: 'pentru mașină',
  })).body;
  assert.equal(loan.balance, 2000);
  assert.equal(loan.repaid, 0);
  assert.equal(loan.settled, false);

  await t.test('a part payment moves the balance, not the original amount', async () => {
    const after = (await api.post(`/api/loans/${loan.id}/payments`, { amount: 750, date: today() })).body;
    assert.equal(after.amount, 2000, 'what was lent does not change because some came back');
    assert.equal(after.repaid, 750);
    assert.equal(after.balance, 1250);
    assert.equal(after.settled, false);
  });

  await t.test('paying the rest settles it', async () => {
    const after = (await api.post(`/api/loans/${loan.id}/payments`, { amount: 1250, date: today() })).body;
    assert.equal(after.balance, 0);
    assert.equal(after.settled, true);
  });

  await t.test('nobody can hand back more than they took', async () => {
    const r = await api.post(`/api/loans/${loan.id}/payments`, { amount: 10, date: today() });
    assert.equal(r.status, 400, r.text);
    assert.equal((await api.get('/api/loans')).body[0].repaid, 2000, 'the rejected payment left nothing behind');
  });

  await t.test('deleting a repayment entered by mistake puts the debt back', async () => {
    const pays = (await api.get(`/api/loans/${loan.id}/payments`)).body;
    await api.del(`/api/loans/${loan.id}/payments/${pays[0].id}`);
    const back = (await api.get('/api/loans')).body[0];
    assert.equal(back.repaid + back.balance, 2000, 'repaid and outstanding always add up to the loan');
    assert.equal(back.settled, false);
  });

  await t.test('deleting the loan takes its repayments with it', async () => {
    await api.del(`/api/loans/${loan.id}`);
    assert.deepEqual((await api.get('/api/loans')).body, []);
    assert.equal((await api.get(`/api/loans/${loan.id}/payments`)).status, 404);
  });
});


test('a loan can be in a currency the household does not report in', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());

  const ron = (await api.post('/api/loans', { person: 'Andrei', amount: 2000, date: today() })).body;
  const eur = (await api.post('/api/loans', { person: 'Hans', amount: 500, date: today(), currency: 'EUR' })).body;

  await t.test('an omitted currency is the household one, written down rather than assumed', () => {
    assert.equal(ron.currency, 'RON', 'the household currency can change later; the loan did not');
    assert.equal(eur.currency, 'EUR');
  });

  await t.test('the currency survives a repayment and a reload', async () => {
    await api.post(`/api/loans/${eur.id}/payments`, { amount: 200, date: today() });
    const row = (await api.get('/api/loans')).body.find((l) => l.id === eur.id);
    assert.equal(row.currency, 'EUR');
    assert.equal(row.balance, 300);
    assert.equal(row.repaid, 200, 'a repayment is in the money that was lent');
  });

  await t.test('changing the household currency does not restate a loan', async () => {
    await api.patch('/api/family', { currency: 'GBP' });
    const rows = (await api.get('/api/loans')).body;
    assert.equal(rows.find((l) => l.id === ron.id).currency, 'RON', '2.000 lei lent is 2.000 lei owed');
    assert.equal(rows.find((l) => l.id === eur.id).currency, 'EUR');
  });

  await t.test('only the three known currencies are accepted', async () => {
    assert.equal((await api.post('/api/loans', { person: 'X', amount: 1, date: today(), currency: 'USD' })).status, 400);
    assert.equal((await api.post('/api/loans', { person: 'X', amount: 1, date: today(), currency: 'nope' })).status, 400);
  });

  await t.test('editing a loan without naming a currency keeps the one it had', async () => {
    const r = await api.put(`/api/loans/${eur.id}`, { person: 'Hans', amount: 500, date: today() });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.currency, 'EUR', 'an edit that says nothing about currency must not silently convert it');
  });
});
test('a loan has to describe a real transfer', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const bad = async (body, why) => {
    const r = await api.post('/api/loans', body);
    assert.equal(r.status, 400, `${why} — got ${r.status} ${r.text}`);
  };
  await bad({ amount: 100, date: today() }, 'no person');
  await bad({ person: 'Andrei', amount: 0, date: today() }, 'zero is not a loan');
  await bad({ person: 'Andrei', amount: -50, date: today() }, 'negative is not a loan');
  await bad({ person: 'Andrei', amount: 100 }, 'no date');
  await bad({ person: 'Andrei', amount: 100, date: today(), due_date: plusDays(-5) }, 'due back before it was lent');
});

test('lending money is not spending it', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const before = (await api.get('/api/stats?months=1')).body.spent;
  await api.post('/api/loans', { person: 'Andrei', amount: 2000, date: today() });
  assert.equal((await api.get('/api/stats?months=1')).body.spent, before,
    'the money is expected back — counting it as spending would misstate the month');
  assert.equal((await api.get('/api/expenses')).body.filter((e) => e.amount === 2000).length, 0);
});

test('rent can be agreed in euro while the household reports in lei', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const prop = (await api.post('/api/properties', {
    name: 'Apartament', rent_amount: 400, rent_currency: 'EUR', rent_due_day: 5,
  })).body;

  await t.test('the lease currency is stored on the property', async () => {
    const row = (await api.get('/api/properties')).body.find((x) => x.id === prop.id);
    assert.equal(row.rent_currency, 'EUR');
  });

  await t.test('a charge raised on the tenant inherits it', async () => {
    const c = (await api.post(`/api/properties/${prop.id}/charges`, {
      type: 'rent', title: 'Chirie august', amount: 400, due_date: today(),
    })).body;
    assert.equal(c.currency, 'EUR', 'the invoice is for what the lease says, not what the household reports in');
  });

  await t.test('and a utility bill against the same lease can still be in lei', async () => {
    const c = (await api.post(`/api/properties/${prop.id}/charges`, {
      type: 'invoice', title: 'Apă', amount: 85, due_date: today(), currency: 'RON',
    })).body;
    assert.equal(c.currency, 'RON', 'utilities billed in lei against a euro lease is the normal case');
  });

  await t.test('the two are never added into one number', async () => {
    const charges = (await api.get(`/api/properties/${prop.id}/charges`)).body;
    const byCurrency = {};
    for (const c of charges) byCurrency[c.currency] = (byCurrency[c.currency] || 0) + c.amount;
    assert.deepEqual(byCurrency, { EUR: 400, RON: 85 }, 'adding these needs a rate the app has no source for');
  });

  await t.test('changing the household currency does not restate an invoice already raised', async () => {
    await api.patch('/api/family', { currency: 'GBP' });
    const charges = (await api.get(`/api/properties/${prop.id}/charges`)).body;
    assert.equal(charges.find((c) => c.title === 'Chirie august').currency, 'EUR',
      'the tenant is holding a document that says 400 euro');
  });

  await t.test('an unknown currency is refused on the lease and on a charge', async () => {
    const lease = await api.put(`/api/properties/${prop.id}`, { name: 'Apartament', rent_currency: 'USD' });
    assert.equal(lease.status, 400, lease.text);
    const charge = await api.post(`/api/properties/${prop.id}/charges`, {
      type: 'invoice', title: 'X', amount: 5, due_date: today(), currency: 'USD',
    });
    assert.equal(charge.status, 400, charge.text);
  });

  await t.test('a lease with no currency named is the household one, and follows it no further', async () => {
    const plain = (await api.post('/api/properties', { name: 'Casa', rent_amount: 1500 })).body;
    const c = (await api.post(`/api/properties/${plain.id}/charges`, {
      type: 'rent', title: 'Chirie', amount: 1500, due_date: today(),
    })).body;
    assert.equal(c.currency, 'GBP', 'the household currency at the moment the charge was raised');
  });
});

test('a todo is done once and stays done', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const todo = (await api.post('/api/todos', { title: 'Schimbat yala' })).body;
  assert.equal(todo.done, 0);

  await t.test('ticking it records who and when', async () => {
    await api.post(`/api/todos/${todo.id}/toggle`);
    const row = (await api.get('/api/todos')).body.find((x) => x.id === todo.id);
    assert.equal(row.done, 1);
    assert.equal(row.done_by_name, 'Raul');
    assert.ok(row.done_at, 'a finished task knows when it was finished');
  });

  await t.test('and it does not come back tomorrow the way a chore does', async () => {
    const later = (await api.get(`/api/todos?date=${plusDays(1)}`)).body.find((x) => x.id === todo.id);
    assert.equal(later.done, 1);
  });

  await t.test('unticking clears the claim that it was finished', async () => {
    await api.post(`/api/todos/${todo.id}/toggle`);
    const row = (await api.get('/api/todos')).body.find((x) => x.id === todo.id);
    assert.equal(row.done, 0);
    assert.equal(row.done_at, null, 'a task that is not done was not done at any time');
    assert.equal(row.done_by_name, null);
  });
});

test('the todo list reads as a plan: open first, soonest first, undated last', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/todos', { title: 'Fără termen' });
  await api.post('/api/todos', { title: 'Săptămâna viitoare', due_date: plusDays(7) });
  await api.post('/api/todos', { title: 'Mâine', due_date: plusDays(1) });
  const doneOne = (await api.post('/api/todos', { title: 'Gata deja', due_date: plusDays(2) })).body;
  await api.post(`/api/todos/${doneOne.id}/toggle`);

  const titles = (await api.get('/api/todos')).body.map((x) => x.title);
  assert.deepEqual(titles, ['Mâine', 'Săptămâna viitoare', 'Fără termen', 'Gata deja']);
});

test('a todo needs a name and an honest date', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.equal((await api.post('/api/todos', { title: '   ' })).status, 400);
  assert.equal((await api.post('/api/todos', { title: 'Ceva', due_date: 'cândva' })).status, 400);
  assert.equal((await api.post('/api/todos', { title: 'Ceva', user_id: 9999 })).status, 400);
});

test('neither loans nor todos leak between families', async (t) => {
  const api = await startServer();
  const other = await startServer();
  t.after(() => Promise.all([api.stop(), other.stop()]));
  const loan = (await api.post('/api/loans', { person: 'Andrei', amount: 100, date: today() })).body;
  const todo = (await api.post('/api/todos', { title: 'Privat' })).body;

  assert.deepEqual((await other.get('/api/loans')).body, []);
  assert.deepEqual((await other.get('/api/todos')).body, []);
  assert.equal((await other.post(`/api/loans/${loan.id}/payments`, { amount: 10, date: today() })).status, 404);
  assert.equal((await other.post(`/api/todos/${todo.id}/toggle`)).status, 404);
  assert.equal((await api.get('/api/todos')).body[0].done, 0, 'the outsider changed nothing');
});

// The tenant portal is the only screen the tenant ever sees. It was printing a 400 euro rent as
// "400,00 RON" because the query that feeds it listed its columns by hand and nobody added the new
// one — so the amount arrived stripped of what it was denominated in and fell back to the
// household currency. A charge without its currency is not a smaller bug than a wrong total.
test('a tenant is told what currency each charge is in', async (t) => {
  const owner = await startServer();
  t.after(() => owner.stop());
  const prop = (await owner.post('/api/properties', {
    name: 'Apartament', rent_amount: 400, rent_currency: 'EUR', rent_due_day: 5,
  })).body;
  await owner.post(`/api/properties/${prop.id}/charges`, {
    type: 'rent', title: 'Chirie august', amount: 400, due_date: today(),
  });
  await owner.post(`/api/properties/${prop.id}/charges`, {
    type: 'invoice', title: 'Apa', amount: 85, due_date: today(), currency: 'RON',
  });
  const invite = (await owner.post(`/api/properties/${prop.id}/tenant/invite`)).body.invite_code;

  // registering the tenant replaces this client's session, which is what we want from here on
  const reg = await owner.post('/api/auth/register', {
    name: 'Chirias', email: `chirias${owner.port}@test.ro`, password: 'Parola12345', inviteCode: invite,
  });
  assert.equal(reg.status, 200, reg.text);

  const seen = (await owner.get('/api/tenant/charges')).body.charges;
  const rent = seen.find((c) => c.title === 'Chirie august');
  const water = seen.find((c) => c.title === 'Apa');
  assert.equal(rent.currency, 'EUR', 'the tenant has to see the currency on their own invoice line');
  assert.equal(water.currency, 'RON');

  await t.test('and the two are never handed over pre-added', async () => {
    const unpaid = seen.filter((c) => c.status === 'unpaid');
    const byCurrency = {};
    for (const c of unpaid) byCurrency[c.currency] = (byCurrency[c.currency] || 0) + c.amount;
    assert.ok(Object.keys(byCurrency).length > 1, 'this fixture is meant to be mixed');
    assert.equal(byCurrency.RON, 85);
  });
});

// Search shows an amount next to each hit. It read that amount out of the row and then formatted it
// in household currency regardless, so a euro loan and a euro charge both came back labelled RON.
test('search results carry the currency of the row they came from', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/loans', {
    person: 'Andrei', amount: 250, date: today(), currency: 'EUR', note: 'imprumut vacanta',
  });
  const prop = (await api.post('/api/properties', {
    name: 'Garsoniera', rent_amount: 300, rent_currency: 'EUR', rent_due_day: 1,
  })).body;
  await api.post(`/api/properties/${prop.id}/charges`, {
    type: 'invoice', title: 'Reparatie centrala', amount: 700, due_date: today(), currency: 'EUR',
  });

  const loanHit = (await api.get('/api/search?q=Andrei')).body.results.find((r) => r.kind === 'loan');
  assert.equal(loanHit.currency, 'EUR', 'otherwise the hit reads 250,00 RON');
  const chargeHit = (await api.get('/api/search?q=centrala')).body.results.find((r) => r.kind === 'charge');
  assert.equal(chargeHit.currency, 'EUR');
});
