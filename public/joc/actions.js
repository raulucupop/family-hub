// Butonul de acțiune (Spațiu), mini-jocurile și controlul direct al personajului (joystick / WASD).
const KID_BURST = {
  tv: ['Dă tare desenele', 'Mai tare!'], toys: ['Aruncă jucăriile', 'Ploaie de jucării!'],
  bigbed: ['Sari în pat!', 'Boing! Boing!'], tub: ['Stropește tot', 'Splash!'],
  drawers: ['Golește sertarele', 'Ce-avem aici?'], sofa: ['Țopăie pe canapea', 'Hop! Hop!'],
};
const STORY = ['A fost odată...', 'un ursuleț somnoros...', 'care căsca întruna.', 'Și-a pus pijamaua...', 'a stins lumina...', 'și a adormit. Sfârșit.'];
const LULLABY = ['Nani, nani...', 'puiul mic...', 'închide ochișorii...', 'somn ușor, somn lin...'];

function sfx(name) { if (G && G.onSfx) G.onSfx(name); }
function float(x, y, text, color = '#ffcf6e') {
  // Cifrele apărute deodată în același loc se așază una peste alta, nu suprapuse.
  const lift = G.floats.filter(f => f.t > 1 && Math.abs(f.x - x) < 50 && Math.abs(f.y - y) < 50).length * 24;
  G.floats.push({ x, y, text, color, t: 1.4, lift });
}

// ---------- Mișcare directă, cu pereți ----------
function walkable(x, y, kid) {
  for (const id in ROOMS) {
    const r = ROOMS[id];
    if (x > r.x + 12 && x < r.x + r.w - 12 && y > r.y + 12 && y < r.y + r.h - 12) return true;
  }
  for (const d of DOORS) {
    if (kid && G.fx.lock > 0 && (d.a === 'kids' || d.b === 'kids')) continue;
    if (d.v ? Math.abs(x - d.x) <= 16 && Math.abs(y - d.y) <= 20 : Math.abs(y - d.y) <= 16 && Math.abs(x - d.x) <= 20) return true;
  }
  return false;
}

// Întoarce true dacă jucătorul e condus direct în cadrul ăsta (atunci nu mai urmează drumul).
function directMove(dt) {
  const p = G.player, inp = G.input;
  const len = Math.hypot(inp.x, inp.y);
  if (len < 0.15) return false;
  if (p.role === 'kid' && p.mode !== 'free') return false;
  if (p.fx.daze > 0 || p.fx.freeze > 0) return true;
  if (p.hidden) unhide(p);
  p.path = []; p.follow = null;
  const sp = speedOf(p) * Math.min(1, len) * dt;
  const dx = inp.x / len * sp, dy = inp.y / len * sp, kid = p.role === 'kid';
  const free = !walkable(p.x, p.y, kid); // dacă a rămas cumva într-un perete, îl lăsăm să iasă
  const at = (x, y) => (free || walkable(x, y, kid)) ? ((p.x = x), (p.y = y), true) : false;
  at(p.x + dx, p.y + dy) || at(p.x + dx, p.y) || at(p.x, p.y + dy);
  clampToMap(p);
  return true;
}

// ---------- Ce poate face jucătorul acum ----------
function nearestBedKid(p) {
  return G.kids.filter(k => k.mode === 'bed' && dist(k, p) < 80).sort((a, b) => b.awake - a.awake)[0];
}

function availableAction() {
  const p = G && G.player;
  if (!p || G.over) return null;
  if (G.mode === 'parent') {
    if (p.fx.daze > 0) return null;
    if (G.hold) return { id: 'hold', label: 'Ține-l bine!', hot: true, progress: G.hold.t / 1.6 };
    if (G.story) return { id: 'storyTap', label: G.story.crib ? 'Leagănă acum!' : 'Citește acum!', hot: true };
    if (p.carrying) return null;
    if (G.mess.some(m => dist(m, p) < 55)) return { id: 'clean', label: 'Strânge jucăriile' };
    const k = nearestBedKid(p);
    if (k) return { id: 'story', label: k.crib ? `Cântă-i lui ${k.name}` : `Poveste pentru ${k.name}` };
    const tv = SPOTS.find(s => s.id === 'tv');
    if (G.fx.screens <= 0 && dist(p, tv) < 80) return { id: 'tv', label: 'Stinge televizorul', disabled: G.cd.tv > 0 };
    return null;
  }
  if (p.mode === 'carried') return { id: 'wriggle', label: `Zbate-te! ${Math.floor(p.wriggle)}/${p.wriggleNeed}`, hot: true, progress: p.wriggle / p.wriggleNeed };
  if (p.mode === 'bed' && !p.still) {
    return p.fx.pretend > 0 ? { id: 'pretend', label: 'Te prefaci că dormi...', disabled: true }
      : { id: 'pretend', label: 'Prefă-te că dormi', disabled: G.cd.pretend > 0 };
  }
  if (p.mode !== 'free') return null;
  if (p.hidden) return { id: 'unhide', label: 'Ieși din ascunzătoare' };
  const h = HIDES.find(h => dist(h, p) < 48);
  if (h) return { id: 'hide', label: `Ascunde-te ${h.label}` };
  const s = SPOTS.find(s => spotActive(s) && dist(s, p) < 48);
  if (s) return { id: 'burst', label: KID_BURST[s.id][0], spot: s, disabled: G.cd.burst > 0 };
  return null;
}

function doAction() {
  const a = availableAction();
  if (!a || a.disabled) return null;
  const p = G.player;
  switch (a.id) {
    case 'clean':
      G.mess = G.mess.filter(m => dist(m, p) >= 65);
      float(p.x, p.y, 'Curat!', '#8fe3c5'); sfx('clean'); break;
    case 'tv':
      G.fx.screens = Math.max(G.fx.screens, 10); G.cd.tv = 18;
      say(p, 'Gata cu desenele.'); sfx('click');
      G.kids.forEach(k => { if (k.mode === 'free' && dist(k, SPOTS[0]) < 90) say(k, 'Heeei!'); });
      break;
    case 'story': {
      const k = nearestBedKid(p);
      G.story = { kid: k, t: 0, line: 0, crib: !!k.crib, cool: 0 };
      say(p, (k.crib ? LULLABY : STORY)[0], 2.4); sfx('click'); break;
    }
    case 'storyTap': storyTap(); break;
    case 'hold': {
      const k = p.carrying; G.hold = null;
      if (k) { k.awake = clamp(k.awake - 4); say(p, 'Gata, gata...'); float(k.x, k.y, 'Ținut bine!', '#8fe3c5'); sfx('perfect'); }
      break;
    }
    case 'wriggle': wriggle(p); break;
    case 'pretend':
      p.fx.pretend = 8; G.cd.pretend = 18;
      say(p, 'Zzz... (de mentă)'); sfx('click'); break;
    case 'hide': {
      const h = HIDES.find(h => dist(h, p) < 48);
      p.hidden = h; p.x = h.x; p.y = h.y; p.path = [];
      say(p, 'Șșșt!'); G.chaos += 5; sfx('hide'); break;
    }
    case 'unhide': unhide(p); say(p, 'Cucu!'); break;
    case 'burst': burst(p, a.spot); break;
  }
  return a.id;
}

// ---------- Mini-jocuri ----------
// Cursorul poveștii oscilează 0..1; mijlocul (0,5) e ținta.
function storyCursor() { return G.story ? (Math.sin(G.story.t * 3.2) + 1) / 2 : 0.5; }

function storyTap() {
  const s = G.story;
  if (s.cool > 0) return;
  s.cool = 0.3;
  const k = s.kid, p = G.player, off = Math.abs(storyCursor() - 0.5);
  if (off < 0.07) {
    k.awake = clamp(k.awake - 7); s.line++;
    say(p, (s.crib ? LULLABY : STORY)[s.line % (s.crib ? LULLABY : STORY).length], 2.4);
    float(k.x, k.y, 'Perfect! −7', '#8fe3c5'); sfx('perfect');
  } else if (off < 0.16) {
    k.awake = clamp(k.awake - 3); float(k.x, k.y, 'Bine −3', '#ffcf6e'); sfx('good');
  } else {
    k.awake = clamp(k.awake + 4); float(k.x, k.y, 'Hi-hi! +4', '#ff8a7a'); sfx('miss');
    say(k, pick(['Nu așa se termină!', 'Hi-hi!', 'Altă poveste!']));
  }
  if (k.awake <= 0) { fallAsleep(k, false); G.story = null; }
}

function wriggle(p) {
  p.wriggle += 1; sfx('tap');
  if (p.wriggle < p.wriggleNeed) return;
  const par = G.parents.find(q => q.carrying === p);
  if (par) { release(par); par.fx.daze = 1.2; say(par, 'Au! Mi-a alunecat!'); }
  p.wriggle = 0; p.wriggleNeed += 3; G.chaos += 15;
  float(p.x, p.y, 'Liber! +15', '#ff8a7a'); sfx('escape');
}

function unhide(p) { p.hidden = null; p.fx.invis = 0; }

function burst(k, s) {
  G.cd.burst = 4;
  k.awake = clamp(k.awake + 6); k.hop = 0.6;
  G.chaos += 20; float(k.x, k.y, '+20 haos', '#ff8a7a'); sfx('chaos');
  say(k, KID_BURST[s.id][1]);
  if (s.id !== 'tv') addMess(k);
  for (const o of G.kids) if (o !== k && o.mode === 'asleep' && roomAt(o.x, o.y) === s.room && Math.random() < 0.5) wake(o, 35, 'Ce gălăgie!');
  for (const p of G.parents) if (!p.player && p.fx.daze <= 0 && dist(p, k) < 230) { p.task = null; p.think = 0; }
}

// ---------- Pe fiecare cadru ----------
function tickActions(dt) {
  for (const c in G.cd) G.cd[c] = Math.max(0, G.cd[c] - dt);
  G.floats.forEach(f => { f.t -= dt; });
  G.floats = G.floats.filter(f => f.t > 0);
  G.shake = Math.max(0, G.shake - dt);
  for (const k of G.kids) if (k.hop > 0) k.hop = Math.max(0, k.hop - dt);
  const p = G.player;
  if (G.mode === 'kid') {
    if (p.mode === 'carried') p.wriggle = Math.max(0, p.wriggle - 1.6 * dt); else p.wriggle = 0;
    if (p.hidden) {
      if (p.mode !== 'free') unhide(p);
      else {
        p.fx.invis = Math.max(p.fx.invis, 0.2);
        const finder = G.parents.find(q => q.fx.daze <= 0 && !q.carrying && dist(q, p) < 34);
        if (finder) { unhide(p); say(finder, 'Te-am găsit!'); pickUp(finder, p); sfx('found'); }
      }
    }
    return;
  }
  // Părinte: povestea se oprește dacă pleci; copilul din brațe se mai zbate.
  if (G.story) {
    const s = G.story; s.t += dt; s.cool -= dt;
    if (p.fx.daze > 0 || s.kid.mode !== 'bed' || dist(p, s.kid) > 95 || p.carrying) G.story = null;
  }
  if (!p.carrying) { G.hold = null; G.holdT = 2.5 + Math.random() * 3; return; }
  if (G.hold) {
    G.hold.t -= dt;
    if (G.hold.t <= 0) {
      const k = p.carrying; G.hold = null;
      release(p); k.fx.speed = 1.5; k.speedMult = 1.3;
      say(k, 'Hi-hi, am scăpat!'); float(k.x, k.y, 'A scăpat!', '#ff8a7a'); sfx('escape');
    }
  } else if ((G.holdT -= dt) <= 0) {
    G.holdT = 4 + Math.random() * 4;
    if (p.carrying.awake > 35 && !p.carrying.crib) {
      G.hold = { t: 1.6 }; say(p.carrying, pick(['Lasă-mă jos!', 'Nuuu!', 'Vreau să mă joc!'])); sfx('warn');
    }
  }
}
