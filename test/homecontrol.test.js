/* Remote control of the house. The design these tests hold in place: Home Assistant polls us by
   token and we never hold a key to it, the controls on the page are only the ones the house chose to
   send, and a button press travels as an action name from a fixed list plus one number, never as a
   Home Assistant service call. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

const path = (url) => new URL(url).pathname;
const HOUSE = [
  { id: 'light.living', name: 'Living', state: 'on', area: 'Living', brightness: 60 },
  { id: 'cover.jaluzea_camera_1', name: 'Jaluzea Camera 1', state: 'closed', position: 0 },
  { id: 'climate.ac_living', name: 'AC Living', state: 'off', temp: 21.5, target: 22 },
  { id: 'switch.poarta', name: 'Poartă', state: 'off', confirm: true },
  { id: 'sensor.temperatura_afara', name: 'Afară', state: '7.4', unit: '°C' },
];

async function linked(t) {
  const api = await startServer();
  t.after(() => api.stop());
  const setup = (await api.post('/api/home/token')).body;
  await api.post(path(setup.states_url), { entities: HOUSE });
  return { api, setup };
}

test('off until an admin turns it on', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  assert.deepEqual((await api.get('/api/home')).body, { configured: false, entities: [] });
  assert.equal((await api.post('/api/home/command', { entity_id: 'light.living', action: 'turn_on' })).status, 404);
  const setup = (await api.post('/api/home/token')).body;
  assert.match(setup.commands_url, /\/home\/[0-9a-f]{40}\/commands$/);
  assert.match(setup.states_url, /\/home\/[0-9a-f]{40}\/states$/);
  assert.equal((await api.get('/home/0000000000000000000000000000000000000000/commands')).status, 404);
});

test('the page shows what the house sent, and nothing it did not', async (t) => {
  const api = await startServer();
  t.after(() => api.stop());
  const setup = (await api.post('/api/home/token')).body;
  await api.post(path(setup.states_url), {
    entities: [
      ...HOUSE,
      { id: 'light.living', name: 'duplicate', state: 'off' },
      { id: 'shell_command.wipe', name: 'not a control', state: 'idle' },
      { id: 'light.x; drop', name: 'bad id', state: 'on' },
      { id: 'light.extra', name: 'x'.repeat(500), state: 'on', token: 'secret', attributes: { a: 1 } },
    ],
  });
  const home = (await api.get('/api/home')).body;
  assert.equal(home.configured, true);
  assert.equal(home.online, true);
  const ids = home.entities.map((e) => e.id);
  assert.deepEqual(ids, ['light.living', 'cover.jaluzea_camera_1', 'climate.ac_living', 'switch.poarta', 'sensor.temperatura_afara', 'light.extra']);
  assert.equal(home.entities[0].name, 'Living', 'the first copy of an id wins');
  const extra = home.entities.at(-1);
  assert.equal(extra.name.length, 60);
  assert.ok(!('token' in extra) && !('attributes' in extra), 'fields the page does not draw are dropped');
  assert.equal(home.entities.find((e) => e.id === 'switch.poarta').confirm, true);
});

test('a press reaches the house once, as an action name and a number', async (t) => {
  const { api, setup } = await linked(t);
  const before = (await api.get(path(setup.commands_url))).body;
  assert.deepEqual(before.commands, []);

  assert.equal((await api.post('/api/home/command', { entity_id: 'light.living', action: 'brightness', value: 35 })).status, 200);
  assert.deepEqual((await api.get('/api/home')).body.pending, ['light.living'], 'the page knows it is on its way');

  const poll = (await api.get(path(setup.commands_url))).body;
  assert.equal(poll.commands.length, 1);
  assert.deepEqual({ ...poll.commands[0], id: 0 }, { id: 0, entity_id: 'light.living', action: 'brightness', value: 35 });
  assert.ok(poll.seq > before.seq, 'seq moves, which is what wakes the automation in the house');

  const again = (await api.get(path(setup.commands_url))).body;
  assert.deepEqual(again.commands, [], 'a command is handed out once, never twice');
  assert.equal(again.seq, poll.seq, 'and seq stays put, so the house does not wake for nothing');

  await api.post(path(setup.states_url), { entities: HOUSE });
  assert.deepEqual((await api.get('/api/home')).body.pending, [], 'fresh states from the house close the press');
});

test('only allowed actions on controls the house sent', async (t) => {
  const { api } = await linked(t);
  const bad = [
    [{ entity_id: 'lock.front_door', action: 'unlock' }, 'a control the house did not send'],
    [{ entity_id: 'light.living', action: 'turn_on', service: 'shell_command.wipe' }, null],
    [{ entity_id: 'light.living', action: 'delete' }, 'an action outside the list'],
    [{ entity_id: 'light.living', action: '__proto__' }, 'an inherited key'],
    [{ entity_id: 'sensor.temperatura_afara', action: 'turn_on' }, 'a sensor is read-only'],
    [{ entity_id: 'climate.ac_living', action: 'temperature', value: 80 }, 'a value out of range'],
    [{ entity_id: 'climate.ac_living', action: 'temperature', value: 'warm' }, 'a value that is not a number'],
    [{ entity_id: 'cover.jaluzea_camera_1', action: 'position' }, 'a missing value'],
  ];
  for (const [body, why] of bad) {
    const r = await api.post('/api/home/command', body);
    if (why) assert.equal(r.status, 400, `should refuse ${why}`);
    else assert.equal(r.status, 200, 'extra fields are ignored, not passed along');
  }
  const sent = (await api.get('/api/home')).body.pending;
  assert.deepEqual(sent, ['light.living']);
});

test('a new press replaces one the house has not picked up', async (t) => {
  const { api, setup } = await linked(t);
  await api.post('/api/home/command', { entity_id: 'cover.jaluzea_camera_1', action: 'open' });
  await api.post('/api/home/command', { entity_id: 'cover.jaluzea_camera_1', action: 'close' });
  const poll = (await api.get(path(setup.commands_url))).body;
  assert.deepEqual(poll.commands.map((c) => c.action), ['close']);
});

test('the house is asked for states while somebody watches', async (t) => {
  const { api, setup } = await linked(t);
  const first = (await api.get(path(setup.commands_url))).body.req;
  await api.get('/api/home'); // somebody opens the page
  await new Promise((r) => setTimeout(r, 5200));
  const second = (await api.get(path(setup.commands_url))).body.req;
  assert.ok(second > first, 'a viewer on the page should get live states');
  const third = (await api.get(path(setup.commands_url))).body.req;
  assert.equal(third, second, 'but not on every poll');
});

test('a new address cuts the old one off, and drops what was queued', async (t) => {
  const { api, setup } = await linked(t);
  await api.post('/api/home/command', { entity_id: 'switch.poarta', action: 'turn_on' });
  const next = (await api.post('/api/home/token')).body;
  assert.equal((await api.get(path(setup.commands_url))).status, 404);
  assert.equal((await api.post(path(setup.states_url), { entities: [] })).status, 404);
  assert.deepEqual((await api.get(path(next.commands_url))).body.commands, [], 'a gate press must not survive into the new address');
});

test('turning it off forgets the house', async (t) => {
  const { api, setup } = await linked(t);
  assert.equal((await api.del('/api/home')).status, 200);
  assert.equal((await api.get('/api/home')).body.configured, false);
  assert.equal((await api.get(path(setup.commands_url))).status, 404);
});

test('still no Home Assistant credential stored here', async (t) => {
  const { api } = await linked(t);
  const text = JSON.stringify([(await api.get('/api/me')).body, (await api.get('/api/home')).body]);
  assert.ok(!/ha_url|ha_password|long_lived|hassio|nabu|bearer/i.test(text), 'the app must not hold a key to the house');
});
