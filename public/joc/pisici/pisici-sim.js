// Simularea: copilul, pisicile, Bunicul și Irina. Desenarea e în pisici-3d.js.
let G = null;
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrap = a => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const turnToward = (cur, tgt, step) => cur + Math.max(-step, Math.min(step, wrap(tgt - cur)));

function say(e, text, t = 2.2) { e.say = text; e.sayT = t; }
function sfx(name) { if (G && G.onSfx) G.onSfx(name); }
function toast(msg) { if (G && G.onToast) G.onToast(msg); }
function float(x, y, text, color = '#ffc94a') {
  const lift = G.floats.filter(f => f.t > 1 && Math.abs(f.x - x) < 50 && Math.abs(f.y - y) < 50).length * 24;
  G.floats.push({ x, y, text, color, t: 1.4, lift });
}
function clockText(p = G.progress) {
  const m = Math.floor(17 * 60 + p * 90);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function kidInfo(id) {
  for (const f of FAMILIES) { const m = f.members.find(m => m.id === id); if (m) return { ...m, fam: f.id }; }
  return null;
}

function newHunt(kidId) {
  const kid = { ...kidInfo(kidId), ...CAT_KIDS[kidId], x: START.x, y: START.y, path: [], carrying: [], pet: null,
    fx: { invis: 0, speed: 0, stealth: 0, frozen: 0, grace: 3, reveal: 0, lure: 0, slow: 0, gentle: 0 },
    cds: {}, say: '', sayT: 0, curSpeed: 0, hidden: false, speedMult: 1, player: true };
  const spots = [...CAT_SPOTS].sort(() => Math.random() - 0.5);
  const cats = CATS.map((c, i) => ({ ...c, x: spots[i].x, y: spots[i].y, spot: spots[i], state: 'rest', path: [],
    restT: 6 + Math.random() * 10, meowT: 2 + Math.random() * 10, say: '', sayT: 0, fleeCd: 0, think: 0 }));
  const adults = ADULTS.map(a => {
    const w = PATROLS[a.id][0];
    return { ...a, x: w.x, y: w.y, wp: 0, facing: Math.PI / 2, state: 'patrol', alert: 0, lostT: 0, lastSeen: null,
      path: [], fx: { daze: 0 }, say: '', sayT: 0, waitT: 1.5, napT: 0, think: 0, detour: false };
  });
  G = { kid, cats, adults, t: 0, progress: 0, duration: HUNT_SECONDS, hearts: HEARTS, inBasket: 0, floats: [],
    input: { x: 0, y: 0 }, cd: {}, shake: 0, over: false, result: null, mark: null, lureRange: 240, score: 0 };
  return G;
}

// ---------- Mișcare ----------
function goTo(e, x, y) { e.path = route(e.x, e.y, x, y); }
function stepPath(e, speed, dt) {
  let budget = speed * dt;
  while (budget > 0 && e.path.length) {
    const p = e.path[0], d = dist(e, p);
    if (d <= budget) { e.x = p.x; e.y = p.y; e.path.shift(); budget -= d; }
    else { e.x += (p.x - e.x) / d * budget; e.y += (p.y - e.y) / d * budget; budget = 0; }
  }
}
function kidSpeed(k) {
  let s = k.speed * (1 - 0.08 * k.carrying.length);
  if (k.fx.speed > 0) s *= k.speedMult;
  if (k.fx.slow > 0) s *= 0.7;
  return s;
}

// ---------- Copilul ----------
function updateKid(dt) {
  const k = G.kid, x0 = k.x, y0 = k.y;
  if (k.fx.frozen <= 0) {
    const inp = G.input, len = Math.hypot(inp.x, inp.y);
    if (len > 0.15) {
      k.path = [];
      const sp = kidSpeed(k) * Math.min(1, len) * dt, dx = inp.x / len * sp, dy = inp.y / len * sp;
      const free = !walkable(k.x, k.y); // dacă a rămas cumva într-un perete, îl lăsăm să iasă
      const at = (x, y) => (free || walkable(x, y)) ? ((k.x = x), (k.y = y), true) : false;
      at(k.x + dx, k.y + dy) || at(k.x + dx, k.y) || at(k.x, k.y + dy);
      clampToMap(k);
    } else stepPath(k, kidSpeed(k), dt);
  }
  k.curSpeed = Math.hypot(k.x - x0, k.y - y0) / Math.max(dt, 1e-4);
  k.hidden = HIDES.some(h => dist(h, k) < h.r);
  k.carrying.forEach((c, i) => { c.x = k.x + (i - (k.carrying.length - 1) / 2) * 10; c.y = k.y - 4; });
  if (k.carrying.length && dist(k, BASKET) < 44) depositCats();
  if (k.pet && (dist(k, k.pet.cat) > 50 || !['rest', 'walk', 'lured'].includes(k.pet.cat.state))) k.pet = null;
}

function depositCats() {
  const k = G.kid, n = k.carrying.length;
  for (const c of k.carrying) {
    const a = G.inBasket++ * 0.9;
    c.state = 'basket'; c.x = BASKET.x + Math.cos(a) * 9; c.y = BASKET.y + Math.sin(a) * 7;
  }
  k.carrying = [];
  float(BASKET.x, BASKET.y, n === 1 ? '+1 pisică în coș' : `+${n} pisici în coș`, '#9be7c4');
  say(k, pick(['Încă una!', 'Hop în coș!', 'Gata, aici stați cuminți.']));
  sfx('basket');
  if (G.inBasket >= G.cats.length) finish(true);
}

// ---------- Pisicile ----------
function flee(c) {
  const k = G.kid;
  const s = pick(CAT_SPOTS.slice().sort((a, b) => dist(b, k) - dist(a, k)).slice(0, 4));
  c.spot = s; c.state = 'flee'; c.fleeCd = 3; goTo(c, s.x, s.y);
  say(c, 'Fsss!', 1.2); sfx('hiss');
  if (k.pet && k.pet.cat === c) k.pet = null;
}

function updateCat(c, dt) {
  if (c.sayT > 0) c.sayT -= dt;
  if (c.state === 'carried' || c.state === 'basket') return;
  const k = G.kid;
  c.fleeCd = Math.max(0, c.fleeCd - dt);
  // Dacă dai buzna peste ea, poate fugi. Copiii mici și cei calmi n-o sperie.
  if (!k.calm && k.fx.reveal <= 0 && c.state !== 'flee' && c.fleeCd <= 0 && k.curSpeed > 82 && dist(c, k) < 70
      && Math.random() < c.shy * 2.5 * dt) {
    flee(c);
    float(c.x, c.y, `${c.name} a fugit!`, '#ff6b5b');
    return;
  }
  if (k.fx.lure > 0 && c.state !== 'flee' && dist(c, k) < G.lureRange) c.state = 'lured';
  if (c.state === 'lured') {
    if (k.fx.lure <= 0) { c.state = 'rest'; c.restT = 5; c.path = []; return; }
    if (dist(c, k) > 26) {
      if ((c.think -= dt) <= 0) { c.think = 0.4; goTo(c, k.x, k.y); }
      stepPath(c, 60, dt);
    }
    return;
  }
  if ((c.meowT -= dt) <= 0) {
    c.meowT = 7 + Math.random() * 9;
    say(c, 'Miau!', 1.4);
    if (dist(c, k) < 260) sfx('meow');
  }
  if (c.state === 'flee') { stepPath(c, 135, dt); if (!c.path.length) { c.state = 'rest'; c.restT = 6 + Math.random() * 8; } return; }
  if (c.state === 'walk') { stepPath(c, 34, dt); if (!c.path.length) { c.state = 'rest'; c.restT = 8 + Math.random() * 12; } return; }
  if ((c.restT -= dt) <= 0) {
    const taken = s => G.cats.some(o => o !== c && o.spot === s && ['rest', 'walk'].includes(o.state));
    const s = pick(CAT_SPOTS.filter(s => s !== c.spot && !taken(s)));
    c.spot = s; c.state = 'walk';
    goTo(c, s.x + (Math.random() - 0.5) * 16, s.y + (Math.random() - 0.5) * 10);
  }
}

// ---------- Bunicul și Irina ----------
function canSee(a, k) {
  if (a.fx.daze > 0 || a.state === 'nap' || k.fx.invis > 0 || k.fx.grace > 0) return false;
  const d = dist(a, k);
  let range = a.range * (k.small ? 0.6 : 1) * (k.fx.stealth > 0 ? 0.45 : 1);
  if (k.hidden) range = Math.min(range, 32);
  if (d > range) return false;
  if (d > 40 && Math.abs(wrap(Math.atan2(k.y - a.y, k.x - a.x) - a.facing)) > a.fov * Math.PI / 180) return false;
  return lineOfSight(a, k);
}

function moveAdult(a, speed, dt) {
  const x0 = a.x, y0 = a.y;
  stepPath(a, speed, dt);
  if (Math.hypot(a.x - x0, a.y - y0) > 0.01) a.facing = turnToward(a.facing, Math.atan2(a.y - y0, a.x - x0), dt * 6);
}

function nextWaypoint(a, nearest) {
  const list = PATROLS[a.id];
  if (nearest) a.wp = list.reduce((bi, w, i) => (dist(w, a) < dist(list[bi], a) ? i : bi), 0);
  a.detour = false;
  goTo(a, list[a.wp].x, list[a.wp].y);
}

function arrive(a) {
  const list = PATROLS[a.id], here = list[a.wp];
  if (a.detour) { a.detour = false; a.waitT = 2.5; say(a, 'Am întins rufele.'); }
  else if (here.nap && Math.random() < 0.6) { a.state = 'nap'; a.napT = 7; say(a, 'Zzz...', 7); return; }
  else if (here.laundry && Math.random() < 0.5) { a.detour = true; goTo(a, LAUNDRY.x, LAUNDRY.y); say(a, 'Mă duc să întind rufele.'); return; }
  else a.waitT = 0.8 + Math.random() * 1.4;
  a.wp = (a.wp + 1) % list.length;
  goTo(a, list[a.wp].x, list[a.wp].y);
}

function updateAdult(a, dt) {
  if (a.sayT > 0) a.sayT -= dt;
  const k = G.kid;
  if (a.fx.daze > 0) { a.state = 'charmed'; a.alert = 0; return; }
  if (a.state === 'charmed') { a.state = 'return'; nextWaypoint(a, true); }
  if (a.state === 'nap') {
    if ((a.napT -= dt) <= 0 || (k.curSpeed > 80 && dist(a, k) < 60)) {
      a.state = 'patrol'; a.alert = 0.4; say(a, 'Hm? Ce-a fost asta?');
      a.wp = (a.wp + 1) % PATROLS[a.id].length; nextWaypoint(a);
    }
    return;
  }
  // Irina aude când alergi pe lângă ea și se întoarce.
  if (a.hears && k.curSpeed > 92 && dist(a, k) < 85 && !(k.fx.invis > 0) && lineOfSight(a, k)) a.facing = Math.atan2(k.y - a.y, k.x - a.x);
  const sees = canSee(a, k);
  // Fără pisică în brațe, adulții te lasă în pace; cel mult te salută.
  const hasCat = k.carrying.length > 0;
  if (a.state === 'chase' && !hasCat) {
    a.state = 'return'; a.alert = 0; nextWaypoint(a, true); say(a, pick(['Bine, bine...', 'Așa, fără pisici!']));
  }
  if (sees && !hasCat && a.sayT <= 0 && Math.random() < 0.25 * dt) say(a, pick(a.hello));
  if (a.state !== 'chase') {
    a.alert = sees && hasCat ? Math.min(1, a.alert + dt * (1.2 + 1.6 * (1 - dist(a, k) / a.range))) : Math.max(0, a.alert - 0.6 * dt);
    if (sees && hasCat) a.facing = turnToward(a.facing, Math.atan2(k.y - a.y, k.x - a.x), dt * 4);
    if (a.alert >= 1) { a.state = 'chase'; a.lostT = 0; a.think = 0; say(a, pick(a.spot)); sfx('alert'); G.shake = 0.25; }
  }
  if (a.state === 'patrol' || a.state === 'return') {
    if (a.alert > 0.25) { a.path = []; return; } // se oprește să se uite mai bine
    if (a.waitT > 0) { a.waitT -= dt; a.facing += Math.sin(G.t * 1.7 + a.wp) * dt * 1.4; return; }
    if (!a.path.length) { if (a.state === 'return') { a.state = 'patrol'; nextWaypoint(a, true); } else arrive(a); }
    moveAdult(a, a.speed, dt);
  } else if (a.state === 'chase') {
    if (sees) { a.lastSeen = { x: k.x, y: k.y }; a.lostT = 0; } else a.lostT += dt;
    if ((a.think -= dt) <= 0) { a.think = 0.25; const tgt = sees ? k : a.lastSeen; goTo(a, tgt.x, tgt.y); }
    moveAdult(a, a.chase, dt);
    if (sees && dist(a, k) < 22) return caught(a);
    if (a.lostT > 4.5 || (!sees && !a.path.length)) { a.state = 'search'; a.waitT = 2; say(a, pick(a.lost)); }
  } else if (a.state === 'search') {
    a.facing += dt * 2.2;
    if ((a.waitT -= dt) <= 0) { a.state = 'return'; a.alert = 0; nextWaypoint(a, true); }
  }
}

function caught(a) {
  const k = G.kid, lost = k.carrying.length;
  G.hearts--; G.shake = 0.5; sfx('caught');
  say(a, pick(a.caught)); say(k, pick(['Nuuu!', 'Of...', 'Nu-i corect!']));
  const escaping = k.carrying; k.carrying = []; k.pet = null;
  escaping.forEach(c => { c.state = 'rest'; flee(c); });
  if (lost) float(k.x, k.y, lost === 1 ? 'Pisica a fugit!' : `${lost} pisici au fugit!`, '#ff6b5b');
  G.adults.forEach(o => { o.state = 'return'; o.alert = 0; nextWaypoint(o, true); });
  k.x = START.x; k.y = START.y; k.path = []; k.fx.frozen = 2; k.fx.grace = 5;
  toast(G.hearts > 0 ? `${a.name} te-a prins! Mai ai ${G.hearts} ${G.hearts === 1 ? 'inimă' : 'inimi'}.` : `${a.name} te-a prins a treia oară.`);
  if (G.hearts <= 0) finish(false, 'caught');
}

// ---------- Abilități și acțiunea „mângâie” ----------
function useAbility(id) {
  const k = G.kid, ab = CAT_ABILITIES[id];
  if (k.cds[id] > 0) return 'Încă se reîncarcă.';
  if (k.fx.frozen > 0) return 'Stai cuminte câteva secunde.';
  switch (ab.type) {
    case 'invisible':
      k.fx.invis = ab.dur; if (ab.slow) k.fx.slow = ab.dur;
      G.adults.forEach(a => { if (a.state === 'chase') a.lostT = 3; });
      break;
    case 'charm': {
      const awake = G.adults.filter(a => a.fx.daze <= 0 && a.state !== 'nap');
      const ts = ab.all ? awake : awake.sort((a, b) => dist(a, k) - dist(b, k)).slice(0, 1);
      if (!ts.length) return 'Nu e niciun adult treaz.';
      ts.forEach(a => { a.fx.daze = ab.dur; a.alert = 0; a.path = []; say(a, ab.adultSay, ab.dur); });
      break;
    }
    case 'lure': k.fx.lure = ab.dur; G.lureRange = ab.range; break;
    case 'reveal': k.fx.reveal = ab.dur; break;
    case 'stealth': k.fx.stealth = ab.dur; break;
    case 'speed': k.fx.speed = ab.dur; k.speedMult = ab.mult; break;
    case 'gentle': k.fx.gentle = 60; break;
  }
  k.cds[id] = ab.cd;
  if (ab.say) say(k, ab.say);
  sfx('ability');
  return null;
}

function petTarget() {
  const k = G.kid;
  return G.cats.filter(c => ['rest', 'walk', 'lured'].includes(c.state) && dist(c, k) < 46).sort((a, b) => dist(a, k) - dist(b, k))[0];
}
function needPets(c) {
  const k = G.kid;
  if (k.fx.gentle > 0) return 1;
  return Math.max(1, c.trust - (k.petBonus || 0) - (c.state === 'lured' ? 1 : 0));
}

function availableAction() {
  const k = G && G.kid;
  if (!k || G.over || k.fx.frozen > 0 || k.carrying.length >= k.carry) return null;
  const c = k.pet ? k.pet.cat : petTarget();
  if (!c) return null;
  const need = needPets(c), n = k.pet && k.pet.cat === c ? k.pet.n : 0;
  return { id: 'pet', cat: c, hot: n > 0, progress: n / need, label: n ? `Mângâie-o pe ${c.name} ${n}/${need}` : `Mângâie-o pe ${c.name}` };
}

function doAction() {
  const a = availableAction();
  if (!a || G.cd.pet > 0) return null;
  const k = G.kid, c = a.cat;
  G.cd.pet = 0.3;
  if (!k.pet || k.pet.cat !== c) k.pet = { cat: c, n: 0 };
  k.pet.n++;
  c.path = []; if (c.state === 'walk') c.state = 'rest'; c.restT = Math.max(c.restT, 3);
  sfx('purr'); float(c.x, c.y, 'prrr', '#9be7c4');
  if (k.pet.n >= needPets(c)) {
    c.state = 'carried'; k.carrying.push(c); k.pet = null; k.fx.gentle = 0;
    say(k, `Te-am prins, ${c.name}!`); say(c, 'Miau!', 1.2); sfx('meow');
    float(c.x, c.y, `${c.name} e în brațe!`, '#ffc94a');
  }
  return 'pet';
}

// ---------- Bucla ----------
function finish(win, why) {
  if (G.over) return;
  G.over = true;
  const k = G.kid, n = G.inBasket, total = G.cats.length;
  G.score = n * 100 + G.hearts * 50 + (win ? Math.round((1 - G.progress) * 90) * 10 : 0);
  const hearts = `${G.hearts} ${G.hearts === 1 ? 'inimă' : 'inimi'}`;
  G.result = win
    ? { win, eyebrow: `Toate pisicile, la ${clockText()}`, title: `${k.name}: toate pisicile sunt în coș!`, text: `Toate cele ${total} pisici torc în coș și ți-au mai rămas ${hearts}. Bunica zice că e gata masa. Scor: ${G.score}.` }
    : why === 'caught'
    ? { win, eyebrow: 'Prins de trei ori', title: 'Gata, la masă!', text: `Ai adunat ${n} din ${total} pisici înainte să te prindă de trei ori. Scor: ${G.score}.` }
    : { win, eyebrow: 'E 18:30', title: 'Bunica cheamă la masă', text: `Ai adunat ${n} din ${total} pisici. Celelalte ${total - n} încă se plimbă prin curte. Scor: ${G.score}.` };
  sfx(win ? 'win' : 'lose');
  if (G.onEnd) G.onEnd(G.result);
}

function step(dt) {
  if (!G || G.over) return;
  G.t += dt; G.progress = Math.min(1, G.t / G.duration);
  const k = G.kid;
  for (const f in k.fx) k.fx[f] = Math.max(0, k.fx[f] - dt);
  for (const c in k.cds) k.cds[c] = Math.max(0, k.cds[c] - dt);
  for (const c in G.cd) G.cd[c] = Math.max(0, G.cd[c] - dt);
  G.adults.forEach(a => { a.fx.daze = Math.max(0, a.fx.daze - dt); });
  if (k.sayT > 0) k.sayT -= dt;
  G.floats.forEach(f => { f.t -= dt; });
  G.floats = G.floats.filter(f => f.t > 0);
  G.shake = Math.max(0, G.shake - dt);
  if (G.mark) G.mark.t -= dt * 1.5;
  updateKid(dt);
  G.cats.forEach(c => updateCat(c, dt));
  for (const a of G.adults) { updateAdult(a, dt); if (G.over) return; }
  if (!G.over && G.t >= G.duration) finish(false, 'time');
}
