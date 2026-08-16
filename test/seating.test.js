/* A seating plan is handed to the venue, so the ways it can quietly be wrong all cost money on the
   day: a table holding more people than it has chairs, someone still at a table after they said they
   were not coming, or an invitation vanishing because a table was deleted. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const guest = (api, title, adults, kids = 0, seats = 0) =>
  api.post('/api/lists', { list: 'baptism', title, adults, kids, seats, rsvp: 'yes' });
const seating = async (api) => (await api.get('/api/seating')).body;
const tableNamed = (s, name) => s.tables.find((t) => t.name === name);

test('the room is described by its tables, and counted against who is coming', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  // the layout the venue gave: 2x5, 3x6, 1x10, 1x17
  await api.post('/api/seating/tables', { count: 2, capacity: 5 });
  await api.post('/api/seating/tables', { count: 3, capacity: 6 });
  await api.post('/api/seating/tables', { count: 1, capacity: 10 });
  await api.post('/api/seating/tables', { count: 1, capacity: 17 });

  const s = await seating(api);
  assert.equal(s.tables.length, 7);
  assert.equal(s.totals.capacity, 55);
  assert.deepEqual(s.tables.map((x) => x.capacity), [5, 5, 6, 6, 6, 10, 17]);
  assert.deepEqual(s.tables.map((x) => x.name), ['1', '2', '3', '4', '5', '6', '7'],
    'unnamed tables are numbered by position, which is how people refer to them');
});

test('numbering counts up from the highest used, so a deletion never makes two tables share a name', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 5, capacity: 6 });   // 1 2 3 4 5
  const s0 = await seating(api);
  // delete one from the MIDDLE: that is the case that used to collide, because counting what was
  // left gave 4, and 4 + 1 is a name still painted on a table nobody removed
  await api.del(`/api/seating/tables/${s0.tables.find((x) => x.name === '3').id}`);
  await api.post('/api/seating/tables', { count: 1, capacity: 10 });

  const names = (await seating(api)).tables.map((x) => x.name);
  assert.deepEqual(names, ['1', '2', '4', '5', '6'],
    'counting the tables instead named the new one 5, beside the 5 still on the wall');
  assert.equal(new Set(names).size, names.length);

  await t.test('the number of a table that is gone can be handed out again', async () => {
    // nothing in the room carries that number any more, so filling the gap is right
    const before = (await seating(api)).tables.map((x) => x.name);
    assert.ok(!before.includes('3'));
    await api.post('/api/seating/tables', { count: 1, capacity: 6, name: '3' });
    const after = (await seating(api)).tables.map((x) => x.name);
    assert.ok(after.includes('3'));
    assert.equal(new Set(after).size, after.length);
  });

  await t.test('and it steps over a number a custom name happens to occupy', async () => {
    const cur = await seating(api);
    await api.put(`/api/seating/tables/${cur.tables[0].id}`, { name: '7' });
    await api.post('/api/seating/tables', { count: 2, capacity: 6 });
    const after = (await seating(api)).tables.map((x) => x.name);
    assert.equal(new Set(after).size, after.length, after.join(','));
    assert.ok(after.includes('8') && after.includes('9'), after.join(','));
  });

  await t.test('a custom name is left alone by later numbering', async () => {
    const cur = await seating(api);
    await api.put(`/api/seating/tables/${cur.tables[1].id}`, { name: 'Masa mirilor' });
    await api.post('/api/seating/tables', { count: 1, capacity: 6 });
    const after = (await seating(api)).tables.map((x) => x.name);
    assert.ok(after.includes('Masa mirilor'), 'a name someone chose is not renumbered away');
    assert.equal(new Set(after).size, after.length, after.join(','));
  });
});

test('tables can be renamed and resized, but not into a name already in use', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 2, capacity: 6 });
  const s0 = await seating(api);
  const [one, two] = s0.tables;

  await t.test('renaming keeps everything else about the table', async () => {
    const g = (await guest(api, 'Familia Pop', 4)).body;
    await api.post('/api/seating/assign', { item_id: g.id, table_id: one.id });
    const s = (await api.put(`/api/seating/tables/${one.id}`, { name: 'Masa mirilor' })).body;
    const t1 = s.tables.find((x) => x.id === one.id);
    assert.equal(t1.name, 'Masa mirilor');
    assert.equal(t1.capacity, 6);
    assert.deepEqual(t1.guests.map((x) => x.title), ['Familia Pop'], 'the guests do not move because the sign did');
  });

  await t.test('the seat count can be corrected too', async () => {
    const s = (await api.put(`/api/seating/tables/${one.id}`, { capacity: 8 })).body;
    assert.equal(s.tables.find((x) => x.id === one.id).capacity, 8);
    assert.equal(s.tables.find((x) => x.id === one.id).name, 'Masa mirilor', 'and the name survives a resize');
    assert.equal(s.totals.capacity, 14);
  });

  await t.test('a duplicate name is refused', async () => {
    const r = await api.put(`/api/seating/tables/${two.id}`, { name: 'Masa mirilor' });
    assert.equal(r.status, 400, r.text);
    assert.match(r.body.error, /already a table called Masa mirilor/);
    assert.equal((await seating(api)).tables.find((x) => x.id === two.id).name, '2', 'and nothing changed');
  });

  await t.test('renaming a table to what it is already called is not a clash with itself', async () => {
    const r = await api.put(`/api/seating/tables/${two.id}`, { name: '2', capacity: 9 });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.tables.find((x) => x.id === two.id).capacity, 9);
  });

  await t.test('an empty name leaves the old one rather than blanking the table', async () => {
    const r = await api.put(`/api/seating/tables/${two.id}`, { name: '   ' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.tables.find((x) => x.id === two.id).name, '2');
  });
});

test('a party is seated whole, and a table cannot be overfilled', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 1, capacity: 5 });
  const tid = (await seating(api)).tables[0].id;
  const popescu = (await guest(api, 'Familia Popescu', 2, 1, 1)).body;   // 4 chairs
  const nasii = (await guest(api, 'Nașii', 2)).body;                     // 2 chairs

  await t.test('an invitation takes as many chairs as it brings people', async () => {
    const s = await seating(api);
    assert.equal(s.unseated.find((g) => g.id === popescu.id).size, 4, 'adults + children + seat-only');
    assert.equal(s.totals.confirmed, 6);
  });

  await t.test('seating one moves it out of the pool', async () => {
    const s = (await api.post('/api/seating/assign', { item_id: popescu.id, table_id: tid })).body;
    assert.equal(tableNamed(s, '1').taken, 4);
    assert.equal(tableNamed(s, '1').free, 1);
    assert.equal(s.unseated.length, 1);
  });

  await t.test('the one that does not fit is refused, with the numbers', async () => {
    const r = await api.post('/api/seating/assign', { item_id: nasii.id, table_id: tid });
    assert.equal(r.status, 400, r.text);
    assert.match(r.body.error, /seats 5, 4 taken, this invitation needs 2/);
    assert.equal(r.body.capacity, 5);
    assert.equal(r.body.taken, 4);
    assert.equal(r.body.needs, 2);
  });

  await t.test('and the refusal changed nothing', async () => {
    const s = await seating(api);
    assert.equal(tableNamed(s, '1').taken, 4);
    assert.equal(s.unseated.length, 1);
    assert.equal(s.unseated[0].id, nasii.id);
  });

  await t.test('moving a guest already at the table is not a new arrival', async () => {
    const r = await api.post('/api/seating/assign', { item_id: popescu.id, table_id: tid });
    assert.equal(r.status, 200, 'reassigning to the same table must not double-count them');
    assert.equal(tableNamed(r.body, '1').taken, 4);
  });

  await t.test('sending someone back to the pool frees their chairs', async () => {
    const s = (await api.post('/api/seating/assign', { item_id: popescu.id, table_id: null })).body;
    assert.equal(tableNamed(s, '1').taken, 0);
    assert.equal(s.unseated.length, 2);
  });
});

test('a table reports what is sitting at it, not just how many chairs are gone', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 1, capacity: 10 });
  const tid = (await seating(api)).tables[0].id;
  const a = (await guest(api, 'Familia Popescu', 2, 3, 1)).body;  // 2 adults, 3 children, 1 seat-only
  const b = (await guest(api, 'Nașii', 2, 0, 0)).body;
  await api.post('/api/seating/assign', { item_id: a.id, table_id: tid });
  await api.post('/api/seating/assign', { item_id: b.id, table_id: tid });

  const s = await seating(api);
  assert.deepEqual(s.tables[0].heads, { adults: 4, kids: 3, seats: 1 });
  assert.equal(s.tables[0].taken, 8, 'and the breakdown still adds up to the chairs used');
  assert.equal(s.tables[0].heads.adults + s.tables[0].heads.kids + s.tables[0].heads.seats, s.tables[0].taken);

  await t.test('the room total is broken out the same way', async () => {
    await guest(api, 'Verii', 1, 1, 0);   // left unseated
    const s2 = await seating(api);
    assert.deepEqual(s2.totals.heads, { adults: 5, kids: 4, seats: 1 });
    assert.equal(s2.totals.confirmed, 10);
  });

  await t.test('an empty table reports zeroes rather than nothing', async () => {
    await api.post('/api/seating/tables', { count: 1, capacity: 6 });
    const empty = (await seating(api)).tables.find((x) => x.taken === 0);
    assert.deepEqual(empty.heads, { adults: 0, kids: 0, seats: 0 });
  });

  await t.test('moving someone away moves their make-up with them', async () => {
    const s3 = (await api.post('/api/seating/assign', { item_id: a.id, table_id: null })).body;
    assert.deepEqual(s3.tables.find((x) => x.id === tid).heads, { adults: 2, kids: 0, seats: 0 });
  });
});

test('taking back a yes takes back the chair', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 1, capacity: 10 });
  const tid = (await seating(api)).tables[0].id;
  const g = (await guest(api, 'Familia Ionescu', 3)).body;
  await api.post('/api/seating/assign', { item_id: g.id, table_id: tid });
  assert.equal((await seating(api)).tables[0].taken, 3);

  await t.test('answering "declined" empties their seats', async () => {
    await api.post(`/api/lists/${g.id}/rsvp`, { rsvp: 'no' });
    const s = await seating(api);
    assert.equal(s.tables[0].taken, 0, 'a plan that still seats them would be handed to the venue');
    assert.equal(s.totals.confirmed, 0);
    assert.deepEqual(s.unseated, []);
  });

  await t.test('and saying yes again does not silently restore the old table', async () => {
    await api.post(`/api/lists/${g.id}/rsvp`, { rsvp: 'yes' });
    const s = await seating(api);
    assert.equal(s.unseated.length, 1, 'they are coming again, but where they sit is a fresh decision');
    assert.equal(s.tables[0].taken, 0);
  });

  await t.test('an unconfirmed guest cannot be given a chair at all', async () => {
    const maybe = (await api.post('/api/lists', { list: 'baptism', title: 'Poate', adults: 2 })).body;
    const r = await api.post('/api/seating/assign', { item_id: maybe.id, table_id: tid });
    assert.equal(r.status, 400, r.text);
    assert.match(r.body.error, /confirmed/i);
  });
});

test('a head count that grows past the table shows as over capacity, it is not rejected', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 1, capacity: 5 });
  const tid = (await seating(api)).tables[0].id;
  const g = (await guest(api, 'Familia Marin', 4)).body;
  await api.post('/api/seating/assign', { item_id: g.id, table_id: tid });

  // two more of them said yes after the plan was drawn — the truth is that six are coming
  const r = await api.post(`/api/lists/${g.id}/heads`, { adults: 6 });
  assert.equal(r.status, 200, 'the number of people coming is not the seating plan\'s to veto');
  const s = await seating(api);
  assert.equal(s.tables[0].taken, 6);
  assert.equal(s.tables[0].over, true, 'so it has to be visible rather than silently fine');
  assert.equal(s.tables[0].free, -1);
});

test('deleting a table returns its guests instead of losing them', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  await api.post('/api/seating/tables', { count: 2, capacity: 6 });
  const s0 = await seating(api);
  const g = (await guest(api, 'Familia Dobre', 2)).body;
  await api.post('/api/seating/assign', { item_id: g.id, table_id: s0.tables[0].id });

  const s = (await api.del(`/api/seating/tables/${s0.tables[0].id}`)).body;
  assert.equal(s.tables.length, 1);
  assert.equal(s.unseated.length, 1, 'the invitation survives the table');
  assert.equal(s.unseated[0].id, g.id);
  assert.equal((await api.get('/api/lists')).body.filter((i) => i.id === g.id).length, 1);
});

test('tables are validated, and belong to one family only', async (t) => {
  const api = await startServer();
  const other = await startServer();
  t.after(() => Promise.all([api.stop(), other.stop()]));
  assert.equal((await api.post('/api/seating/tables', { capacity: 0 })).status, 400);
  assert.equal((await api.post('/api/seating/tables', { capacity: -3 })).status, 400);
  assert.equal((await api.post('/api/seating/tables', { capacity: 6, count: 0 })).status, 400);
  assert.equal((await api.post('/api/seating/tables', { capacity: 6, count: 99 })).status, 400);

  await api.post('/api/seating/tables', { count: 1, capacity: 6 });
  const mine = await seating(api);
  const g = (await guest(api, 'Ai mei', 2)).body;

  assert.deepEqual((await other.get('/api/seating')).body.tables, []);
  assert.equal((await other.post('/api/seating/assign', { item_id: g.id, table_id: mine.tables[0].id })).status, 404);
  assert.equal((await other.del(`/api/seating/tables/${mine.tables[0].id}`)).status, 200);
  assert.equal((await seating(api)).tables.length, 1, 'the outsider deleted nothing of mine');
});
