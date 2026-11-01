#!/usr/bin/env node
/* Builds the Home Assistant script that sends states to Family Hub's "Control casă" page, with the
   tabs and sections of one of your Home Assistant dashboards copied into it. The page then shows
   the same tabs, the same headings and the same entities in the same order.

     node scripts/ha-dashboard-layout.js dashboard.json > family-hub-script.yaml
     node scripts/ha-dashboard-layout.js dashboard.json --skip Familie --skip Sistem > …   # leave tabs out

   dashboard.json is the dashboard's config: either the file Home Assistant keeps in
   config/.storage/lovelace.<dashboard_id>, or just its { "views": [...] }. Paste the output in
   Settings → Automations & scenes → Scripts → the "Family Hub - trimite stările" script → Edit in
   YAML. Run it again whenever the dashboard changes.

   Only the structure travels: tab titles, section headings, entity ids and names given on cards.
   Custom cards that draw something of their own (floor plans, energy flow, charts) and cameras are
   left out, because the site cannot draw them; their entities still appear when a card names them. */
const fs = require('node:fs');

const ENT = /^[a-z_]+\.[a-z0-9_]+$/;
// cards that are a picture or a live view, not a list of entities
const SKIP = new Set(['custom:advanced-camera-card', 'custom:aurora-camere-live-card', 'picture-entity', 'picture-glance',
  'custom:weather-radar-card', 'logbook', 'custom:plotly-graph', 'iframe', 'map']);

function entitiesOf(card, out) {
  if (!card || typeof card !== 'object' || SKIP.has(card.type)) return;
  const add = (e, n) => { if (typeof e === 'string' && ENT.test(e) && !e.startsWith('camera.')) out.push({ e, n: typeof n === 'string' ? n : null }); };
  if (card.entity) add(card.entity, card.name);
  if (Array.isArray(card.entities)) for (const x of card.entities) typeof x === 'string' ? add(x) : add(x?.entity, x?.name);
  if (Array.isArray(card.cards)) for (const c of card.cards) entitiesOf(c, out);
  if (card.card) entitiesOf(card.card, out);
}

function layoutOf(config, skip = []) {
  const views = [];
  const skipped = new Set(skip.map((t) => t.toLowerCase()));
  for (const v of config.views || []) {
    if (skipped.has(String(v.title || '').toLowerCase()) || skipped.has(String(v.path || '').toLowerCase())) continue;
    const sections = [];
    // a sections view: each section is a grid of cards, and a heading card starts a new group.
    // A classic view (cards, no sections) is read as one section.
    const groups = v.sections || [{ cards: v.cards || [] }];
    for (const g of groups) {
      let cur = null;
      for (const c of g.cards || []) {
        if (c.type === 'heading') { cur = { h: c.heading || '', items: [] }; sections.push(cur); continue; }
        if (!cur) { cur = { h: c.title || '', items: [] }; sections.push(cur); }
        entitiesOf(c, cur.items);
      }
    }
    const s = sections
      .map((sec) => ({ h: sec.h, items: sec.items.filter((it, i, all) => all.findIndex((x) => x.e === it.e) === i) }))
      .filter((sec) => sec.items.length);
    if (s.length) views.push({ t: v.title || v.path || '—', s });
  }
  return views;
}

// the state of every entity the layout names, plus every one with the "Family Hub" label; `ctl`
// marks the labelled ones, the only ones the site lets anybody press
const PAYLOAD = `{% set ctl = label_entities('family_hub') %}
{% set confirm = label_entities('family_hub_confirmare') %}
{% set ns = namespace(ids=[], items=[]) %}
{% for v in layout | default([]) %}{% for sec in v.s %}{% for it in sec['items'] %}{% set ns.ids = ns.ids + [it.e] %}{% endfor %}{% endfor %}{% endfor %}
{% for e in (ns.ids + ctl) | unique | sort %}
{% set s = states[e] %}
{% if s is not none %}
{% set a = s.attributes %}
{% set d = e.split('.')[0] %}
{% if d == 'weather' %}{% set t = a.temperature %}{% else %}{% set t = a.current_temperature %}{% endif %}
{% if d == 'climate' %}{% set g = a.temperature %}{% else %}{% set g = none %}{% endif %}
{% set ns.items = ns.items + [{
  'id': e, 'name': s.name, 'state': s.state,
  'area': area_name(e) or '',
  'unit': a.unit_of_measurement | default(none),
  'dc': a.device_class | default(none),
  'title': a.media_title | default(none),
  'brightness': ((a.brightness / 2.55) | round(0)) if a.brightness is number else none,
  'temp': t | default(none),
  'target': g | default(none),
  'position': a.current_position | default(none),
  'ctl': e in ctl,
  'confirm': e in confirm }] %}
{% endif %}
{% endfor %}
{{ {'layout': layout | default([]), 'entities': ns.items} | to_json }}`;

function scriptYaml(layout) {
  const indent = (txt, n) => txt.split('\n').map((l) => ' '.repeat(n) + l).join('\n');
  return `alias: Family Hub - trimite stările
description: Trimite către Family Hub starea entităților din dashboard și a celor cu eticheta Family Hub.
mode: queued
max: 3
variables:
  layout: ${JSON.stringify(layout)}
sequence:
  - action: rest_command.family_hub_states
    data:
      payload: >-
${indent(PAYLOAD, 8)}
`;
}

module.exports = { layoutOf, scriptYaml, PAYLOAD };

if (require.main === module) {
  const args = process.argv.slice(2);
  const skip = [];
  for (let i = args.indexOf('--skip'); i !== -1; i = args.indexOf('--skip')) skip.push(...args.splice(i, 2).slice(1));
  const file = args[0];
  if (!file) { console.error('usage: node scripts/ha-dashboard-layout.js dashboard.json [--skip <tab title or path>]…'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = raw.data?.config || raw.config || raw;
  const layout = layoutOf(config, skip);
  const n = new Set(layout.flatMap((v) => v.s.flatMap((s) => s.items.map((i) => i.e)))).size;
  console.error(`${layout.length} tabs, ${n} entities`);
  process.stdout.write(scriptYaml(layout));
}
