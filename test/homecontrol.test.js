/* Remote control of the house. The design these tests hold in place: Home Assistant polls us by
   token and we never hold a key to it, the controls on the page are only the ones the house chose to
   send, and a button press travels as an action name from a fixed list plus one number, never as a
   Home Assistant service call. */
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

const path = (url) => new URL(url).pathname;
const HOUSE = [
  { id: 'light.living', name: 'Living', state: 'on', area: 'Living', brightness: 60, ctl: true },
  { id: 'cover.jaluzea_camera_1', name: 'Jaluzea Camera 1', state: 'closed', position: 0, ctl: true },
  { id: 'climate.ac_living', name: 'AC Living', state: 'off', temp: 21.5, target: 22, ctl: true },
  { id: 'switch.poarta', name: 'Poartă', state: 'off', confirm: true, ctl: true },
  { id: 'light.pod', name: 'Pod', state: 'off' }, // shown, but not labelled for control in the house
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
      { id: 'shell_command.wipe', name: 'not a control', state: 'idle', ctl: true },
      { id: 'light.x; drop', name: 'bad id', state: 'on' },
      { id: 'light.extra', name: 'x'.repeat(500), state: 'on', token: 'secret', attributes: { a: 1 } },
    ],
  });
  const home = (await api.get('/api/home')).body;
  assert.equal(home.configured, true);
  assert.equal(home.online, true);
  const ids = home.entities.map((e) => e.id);
  assert.deepEqual(ids, ['light.living', 'cover.jaluzea_camera_1', 'climate.ac_living', 'switch.poarta', 'light.pod', 'sensor.temperatura_afara', 'shell_command.wipe', 'light.extra']);
  assert.equal(home.entities.find((e) => e.id === 'shell_command.wipe').ctl, false, 'a domain with no actions is never pressable, whatever the house says');
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
    [{ entity_id: 'light.pod', action: 'turn_on' }, 'a light the house shows but did not label for control'],
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

test('the dashboard structure comes with the states, cleaned', async (t) => {
  const { api, setup } = await linked(t);
  assert.equal((await api.get('/api/home')).body.layout, null, 'no layout sent: the page groups by area');
  await api.post(path(setup.states_url), {
    entities: HOUSE,
    layout: [
      { t: 'Acasă', p: 'x', s: [{ h: 'Lumini', items: [{ e: 'light.living', n: 'Lustră' }, { e: 'bad id' }, { e: 'light.pod', extra: 1 }] }, { h: 'gol', items: [] }] },
      { t: 'Gol', s: [] },
      'not a view',
    ],
  });
  const { layout } = (await api.get('/api/home')).body;
  assert.deepEqual(layout, [{ t: 'Acasă', s: [{ h: 'Lumini', items: [{ e: 'light.living', n: 'Lustră' }, { e: 'light.pod', n: null }] }] }]);
});

test('the full-dashboard button takes an https address only, from an admin', async (t) => {
  const { api } = await linked(t);
  assert.equal((await api.put('/api/home/dashboard-url', { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await api.put('/api/home/dashboard-url', { url: 'http://x.ui.nabu.casa/dashboard-test' })).status, 400);
  const ok = await api.put('/api/home/dashboard-url', { url: 'https://abc.ui.nabu.casa/dashboard-test/default_view' });
  assert.equal(ok.status, 200);
  assert.equal((await api.get('/api/home')).body.dash_url, 'https://abc.ui.nabu.casa/dashboard-test/default_view');
  await api.put('/api/home/dashboard-url', { url: '' });
  assert.equal((await api.get('/api/home')).body.dash_url, null);
});

test('a dashboard becomes tabs, headed sections and entities, without the pictures', () => {
  const { layoutOf, scriptYaml } = require('../scripts/ha-dashboard-layout');
  const layout = layoutOf({ views: [
    { title: 'Acasă', type: 'sections', sections: [
      { type: 'grid', cards: [
        { type: 'heading', heading: 'Lumini' },
        { type: 'tile', entity: 'light.living', name: 'Lustră' },
        { type: 'entities', entities: ['light.pod', { entity: 'light.living' }, { entity: 'camera.fata' }] },
        { type: 'custom:advanced-camera-card', entity: 'switch.should_not_appear' },
        { type: 'heading', heading: 'Doar desen' },
        { type: 'custom:aurora-plan-card' },
      ] },
    ] },
    { title: 'Clasic', cards: [{ type: 'vertical-stack', title: 'Stivă', cards: [{ type: 'tile', entity: 'cover.jaluzea' }] }] },
    { title: 'Gol', sections: [{ cards: [{ type: 'markdown', content: 'x' }] }] },
  ] });
  assert.deepEqual(layout, [
    { t: 'Acasă', s: [{ h: 'Lumini', items: [{ e: 'light.living', n: 'Lustră' }, { e: 'light.pod', n: null }] }] },
    { t: 'Clasic', s: [{ h: 'Stivă', items: [{ e: 'cover.jaluzea', n: null }] }] },
  ]);
  assert.deepEqual(layoutOf({ views: [{ title: 'Familie', cards: [{ type: 'tile', entity: 'device_tracker.x' }] }, { title: 'Clasic', cards: [{ type: 'tile', entity: 'light.a' }] }] }, ['familie']).map((v) => v.t), ['Clasic'],
    'a tab can be left out, so what it shows never leaves the house');
  const yaml = scriptYaml(layout);
  assert.match(yaml, /^alias: Family Hub - trimite stările/);
  assert.ok(yaml.includes('"light.pod"'), 'the layout is carried inside the script');
});
