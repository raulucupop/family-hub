// Simularea: ceasul, copiii, părinții și abilitățile.
let G = null;
const clamp = v => Math.max(0, Math.min(100, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const TUNE = { base: 1.0, near: 2.0, escape: 2.0, ai: [9, 9], cradle: 1.5, calm: 1.5, crowd: 0.45, rock: 2.5, rockPlayer: 1.5, roomWatch: 0.5, playerBed: 0.6, watch: 110, chores: { parent: [20, 10], kid: [12, 8] }, parentAi: { parent: [11, 8], kid: [16, 12] } };
const CHORES = { living: 'Strâng jucăriile...', kitchen: 'Spăl vasele...', bath: 'Pregătesc hainele de mâine...', parents: 'Împăturesc rufe...' };
const ROOM_POINT = { living: { x: 220, y: 420 }, kitchen: { x: 560, y: 380 }, bath: { x: 640, y: 190 }, parents: { x: 420, y: 190 }, kids: { x: 150, y: 200 } };

function say(e, text, t = 2.2) { e.say = text; e.sayT = t; }
function toast(msg) { if (G && G.onToast) G.onToast(msg); }
function clockText(p = G.progress) {
  const m = Math.floor(21 * 60 - G.minutes + p * G.minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function makeEntity(m, fam) {
  return { ...m, fam, x: 0, y: 0, r: m.role === 'parent' ? 17 : m.baby ? 11.5 : 14,
    path: [], fx: { daze: 0, freeze: 0, calm: 0, invis: 0, speed: 0, stayUp: 0, pretend: 0 }, cds: {}, say: '', sayT: 0, think: 0, aiT: 10 + Math.random() * 12 };
}

function newGame(famId, playerId, guestId) {
  const fam = FAMILIES.find(f => f.id === famId);
  const kidDefs = fam.members.filter(m => m.role === 'kid').map(m => [m, fam.id]);
  if (guestId) FAMILIES.find(f => f.id === guestId).members.filter(m => m.role === 'kid').forEach(m => kidDefs.push([m, guestId]));
  const parents = fam.members.filter(m => m.role === 'parent').map(m => makeEntity(m, fam.id));
  const spots = [...SPOTS].sort(() => Math.random() - 0.5);
  const kids = kidDefs.map(([m, f], i) => {
    const k = makeEntity(m, f);
    Object.assign(k, { bed: BED_SLOTS[i], mode: 'free', cryT: 3, messT: 2 });
    if (m.still) { k.mode = 'bed'; k.x = k.bed.x - 14; k.y = k.bed.y; }
    else { const s = spots[i % spots.length]; k.x = s.x + (Math.random() - 0.5) * 30; k.y = s.y + (Math.random() - 0.5) * 20; }
    return k;
  });
  G = { fam, guestId, kids, parents, all: [...kids, ...parents], t: 0, progress: 0, mess: [], chaos: 0, over: false,
    fx: { screens: 0, lock: 0, lockBeds: 0, cradle: 0 } };
  // Cu musafiri sunt mai mulți copii, deci seara începe mai devreme.
  G.duration = GAME_SECONDS * (1 + 0.25 * Math.max(0, kids.length - 3));
  G.minutes = Math.round(90 * G.duration / GAME_SECONDS);
  G.hunger = [0.25 + Math.random() * 0.1, 0.6 + Math.random() * 0.13].map(f => f * G.duration);
  // Părinții tocmai au terminat cina în bucătărie.
  parents.forEach((p, i) => { p.x = 540 + i * 70; p.y = 420 + i * 30; p.think = 2; });
  G.player = G.all.find(e => e.id === playerId);
  G.player.player = true;
  Object.assign(G, { floats: [], input: { x: 0, y: 0 }, story: null, hold: null, holdT: 3, cd: {}, shake: 0 });
  kids.forEach(k => Object.assign(k, { wriggle: 0, wriggleNeed: 7, hop: 0, hidden: null }));
  G.mode = G.player.role;
  parents.forEach(p => { p.speed = p.player ? 140 : G.mode === 'parent' ? 112 : 122; });
  return G;
}

// ---------- Mișcare ----------
function blockedFor(e) {
  if (e.role !== 'kid' || G.fx.lock <= 0) return null;
  return d => d.a === 'kids' || d.b === 'kids';
}
function goTo(e, x, y) { const r = route(e.x, e.y, x, y, blockedFor(e)); if (r) e.path = r; return !!r; }
function speedOf(e) {
  let s = e.speed;
  if (e.role === 'kid') s *= (0.55 + 0.45 * e.awake / 100) * (e.fx.calm > 0 ? 0.5 : 1);
  if (e.carrying) s *= 0.8;
  if (e.fx.speed > 0) s *= e.speedMult || 1.6;
  return s;
}
function move(e, dt) {
  if (e.role === 'kid' && (e.mode !== 'free' || e.fx.freeze > 0)) return;
  if (e.role === 'parent' && e.fx.daze > 0) return;
  let budget = speedOf(e) * dt;
  while (budget > 0 && e.path.length) {
    const p = e.path[0], d = dist(e, p);
    if (d <= budget) { e.x = p.x; e.y = p.y; e.path.shift(); budget -= d; }
    else { e.x += (p.x - e.x) / d * budget; e.y += (p.y - e.y) / d * budget; budget = 0; }
  }
}

// ---------- Copii ----------
const spotActive = s => !(s.screen && G.fx.screens > 0) && !(s.lockable && G.fx.lock > 0);
function allowedSpot(k, s) { return !(G.fx.lock > 0 && (roomAt(k.x, k.y) === 'kids') !== (s.room === 'kids')); }
function spotAt(k) { return SPOTS.find(s => spotActive(s) && dist(k, s) < 42); }

function goToSpot(k, s) { k.stayT = 3 + Math.random() * 4; goTo(k, s.x + (Math.random() - 0.5) * 30, s.y + (Math.random() - 0.5) * 18); }
function pickSpot(k, threat) {
  let opts = SPOTS.filter(s => spotActive(s) && allowedSpot(k, s));
  if (!opts.length) return;
  if (threat) opts.sort((a, b) => dist(b, threat) - dist(a, threat)), opts = opts.slice(0, 2);
  goToSpot(k, pick(opts));
}

function wake(k, awake, text) {
  if (k.mode === 'asleep') k.mode = 'bed';
  else if (k.mode === 'floor') k.mode = 'free';
  k.awake = Math.max(k.awake, awake);
  if (text) say(k, text);
}

function canLeaveBed(k) {
  if (k.still || G.fx.lockBeds > 0 || k.fx.calm > 0 || k.fx.stayUp > 0) return false;
  if (k.fx.invis > 0) return true;
  return !G.parents.some(p => p.fx.daze <= 0 && dist(p, k) < TUNE.watch);
}
// Pentru copiii conduși de calculator: un părinte în cameră descurajează, unul lângă pat oprește.
function escapeFactor(k, near) {
  if (k.still || near || G.fx.lockBeds > 0 || k.fx.calm > 0 || k.fx.stayUp > 0) return 0;
  if (k.fx.invis > 0) return 1;
  const room = roomAt(k.x, k.y);
  return G.parents.some(p => p.fx.daze <= 0 && roomAt(p.x, p.y) === room) ? TUNE.roomWatch : 1;
}
function leaveBed(k) {
  k.mode = 'free'; k.y += 22;
  say(k, pick(['Mi-e sete!', 'Nu mi-e somn!', 'Trebuie la baie!', 'Hi-hi!']));
}

function addMess(k) {
  if (G.mess.length >= 10) return;
  const m = clampToMap({ x: k.x + (Math.random() - 0.5) * 48, y: k.y + (Math.random() - 0.5) * 36 });
  m.room = roomAt(m.x, m.y); m.seed = Math.random() * 6;
  if (m.room) G.mess.push(m);
  if (k.player) { G.chaos += 12; float(m.x, m.y, '+12 haos', '#ff8a7a'); }
}

function fallAsleep(k, onFloor) {
  k.awake = 0; k.path = []; k.mode = onFloor ? 'floor' : 'asleep';
  say(k, onFloor ? 'Zzz... (pe covor)' : 'Zzz...');
  if (!onFloor) { sfx('sleep'); float(k.x, k.y, 'Doarme!', '#8fe3c5'); }
  if (k.player) finish(false, onFloor);
}

function updateKid(k, dt) {
  if (k.mode === 'carried') { k.awake = clamp(k.awake - dt); return; }
  if (k.mode === 'floor') return;
  if (k.mode === 'asleep') {
    const room = roomAt(k.x, k.y);
    const noise = G.mess.filter(m => m.room === room).length + G.kids.filter(o => o.mode === 'free' && roomAt(o.x, o.y) === room).length;
    if (noise && Math.random() < 0.012 * noise * dt) wake(k, 30, 'Hm?');
    return;
  }
  const excite = 0.12 * G.mess.length;
  if (k.mode === 'bed') {
    const near = G.parents.some(p => p.fx.daze <= 0 && dist(p, k) < 85);
    let rate = k.crib && k.awake > 50 && !near ? -1 : TUNE.base * k.calm * (1 + 0.8 * G.progress);
    if (near) rate += TUNE.near + (k.crib ? (k.player ? TUNE.rockPlayer : TUNE.rock) : 0);
    if (k.player && rate > 0 && !k.still) rate *= TUNE.playerBed;
    if (k.fx.pretend > 0) rate *= 0.5;
    if (rate > 0) rate *= 1 + TUNE.crowd * Math.max(0, G.kids.length - 3);
    if (G.fx.cradle > 0) rate += TUNE.cradle;
    if (k.fx.calm > 0) rate += TUNE.calm;
    if (k.fx.stayUp > 0) rate = -k.stayGain;
    if (k.fx.stayUp > 0 && k.player) G.chaos += 3 * dt;
    k.awake = clamp(k.awake - (rate - excite) * dt);
    if (k.awake <= 0) return fallAsleep(k, false);
    if (k.baby && k.awake > 60 && !near) {
      k.cryT -= dt;
      if (k.cryT <= 0) { k.cryT = 6 + Math.random() * 3; noise(k, k.still ? 'Uaaa!' : 'Buaaa!', 0.25); }
    }
    if (!k.player && k.awake > 30 && Math.random() < k.escape * TUNE.escape * (k.awake / 100) * escapeFactor(k, near) * dt) leaveBed(k);
    if (!k.player) aiAbility(k, dt);
    return;
  }
  // liber prin casă
  const s = k.path.length ? null : spotAt(k);
  const gain = s ? s.gain : 0;
  k.awake = clamp(k.awake + (gain + excite - (0.5 + 1.6 * G.progress) * (k.stamina || 1) - (k.fx.calm > 0 ? 1 : 0)) * dt);
  if (s && k.player) G.chaos += gain * 4 * dt;
  if (s && s.mess) { k.messT -= dt; if (k.messT <= 0) { k.messT = 2.5 + Math.random() * 2; if (Math.random() < 0.5) addMess(k); } }
  if (k.awake <= 0) return fallAsleep(k, true);
  if (k.player || k.fx.freeze > 0) return;
  k.think -= dt;
  const threat = G.parents.find(p => p.fx.daze <= 0 && dist(p, k) < 125);
  if (threat && k.think <= 0 && k.fx.invis <= 0) {
    k.think = 1.2; pickSpot(k, threat);
    if (Math.random() < 0.3) say(k, pick(['Nu mă prinzi!', 'Încă cinci minute!', 'Nu mi-e somn!']));
    return;
  }
  if (s) { k.stayT -= dt; if (k.stayT <= 0) pickSpot(k); }
  else if (!k.path.length) pickSpot(k);
  aiAbility(k, dt);
}

// Zgomot: trezește pe cine doarme, îi agită pe ceilalți.
function noise(src, text, wakeChance) {
  say(src, text);
  sfx(src.crib ? 'cry' : 'scream'); G.shake = src.crib ? 0.2 : 0.5;
  for (const k of G.kids) {
    if (k === src) continue;
    if (k.mode === 'asleep' && Math.random() < wakeChance) { wake(k, 40, 'Ce-a fost asta?'); if (src.player) G.chaos += 15; }
    else if (k.mode === 'bed' || k.mode === 'free') k.awake = clamp(k.awake + 6);
  }
}

// ---------- Părinți ----------
function pickUp(p, k) {
  p.carrying = k; k.mode = 'carried'; k.path = []; p.follow = null; p.goal = null; p.path = [];
  sfx('pick');
  say(p, pick(['Te-am prins!', 'Hai la nani!', 'Gata, la culcare!']));
  say(k, k.crib ? 'Gâ-gâ!' : pick(['Nuuu!', 'Încă cinci minute!', 'Nu vreau!']), 1.8);
  if (p.player) toast(`${k.name} e în brațele tale. Du-te la patul marcat cu galben.`);
  if (k.player) toast(`${p.name} te-a prins! Atinge repede ca să te zbați.`);
}
function release(p) {
  const k = p.carrying; if (!k) return;
  p.carrying = null; k.mode = 'free'; k.x = p.x + 16; k.y = p.y + 6;
  p.fx.noGrab = 1.5; // altfel îl prinde din nou în aceeași clipă
}
function putToBed(p) {
  const k = p.carrying; p.carrying = null; p.path = [];
  k.x = k.bed.x - 14; k.y = k.bed.y; k.mode = 'bed';
  say(p, pick(['Noapte bună!', 'Somn ușor!', 'Pup, la nani.']));
  sfx('bed');
  if (k.awake < 10) fallAsleep(k, false);
}

function updateParent(p, dt) {
  if (p.carrying) { p.carrying.x = p.x + 11; p.carrying.y = p.y - 9; }
  if (p.fx.daze > 0) return;
  const m = G.mess.find(m => dist(m, p) < 24);
  p.fixT = m ? (p.fixT || 0) + dt : 0;
  if (m && p.fixT > 1.1) { G.mess.splice(G.mess.indexOf(m), 1); p.fixT = 0; }
  if (!p.carrying && !(p.fx.noGrab > 0)) {
    const k = G.kids.find(k => (k.mode === 'free' || k.mode === 'floor') && !(k.fx.invis > 0) && dist(k, p) < 26);
    if (k) pickUp(p, k);
  }
  if (p.carrying && dist(p, p.carrying.bed) < 42) putToBed(p);
  if (!p.player) return parentAI(p, dt);
  if (p.follow) {
    p.think -= dt;
    if (p.follow.fx.invis > 0 || !['free', 'floor'].includes(p.follow.mode)) p.follow = null;
    else if (p.think <= 0) { p.think = 0.3; goTo(p, p.follow.x, p.follow.y); }
  }
}

function parentAI(p, dt) {
  aiAbility(p, dt);
  if (p.task) { if (!p.path.length && (p.task.t -= dt) <= 0) p.task = null; return; }
  if (p.carrying) { if (!p.path.length) goTo(p, p.carrying.bed.x, p.carrying.bed.y + 24); return; }
  if ((p.choreT = (p.choreT ?? 10 + Math.random() * 8) - dt) <= 0) {
    const c = TUNE.chores[G.mode];
    p.choreT = c[0] + Math.random() * c[1];
    return doChores(p);
  }
  if ((p.think -= dt) > 0) return;
  p.think = 0.35;
  const other = G.parents.find(o => o !== p);
  const taken = k => other && other.goal === k && !other.carrying;
  // Copilul jucat de tine s-a ascuns: părinții verifică ascunzătorile.
  if (G.player.hidden && Math.random() < 0.1) {
    const h = pick(HIDES); p.goal = null; p.task = { t: 1 }; goTo(p, h.x, h.y);
    if (Math.random() < 0.5) say(p, pick(['Unde ești?', 'Te găsesc eu...', 'Cucu! Unde e copilul?']));
    return;
  }
  const free = G.kids.filter(k => ['free', 'floor'].includes(k.mode) && !(k.fx.invis > 0) && !taken(k));
  const baby = G.kids.find(k => k.mode === 'bed' && k.crib && k.awake > (k.player ? 30 : 58) && !taken(k));
  const score = k => dist(p, k) * (k.player ? 0.6 : 1);
  if (baby && (!free.length || baby.awake > 78 || baby.player)) { p.goal = baby; goTo(p, baby.bed.x, baby.bed.y + 34); return; }
  if (free.length) { const k = free.sort((a, b) => score(a) - score(b))[0]; p.goal = k; goTo(p, k.x, k.y); return; }
  const mess = G.mess.slice().sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (mess) { p.goal = null; goTo(p, mess.x, mess.y); return; }
  const inBed = G.kids.filter(k => k.mode === 'bed' && !(k.fx.pretend > 0) && !taken(k)).sort((a, b) => b.awake - a.awake)[0];
  const otherGuards = other && !other.player && !other.task && other.goal && other.goal.mode === 'bed';
  if (inBed && !otherGuards) { p.goal = inBed; goTo(p, inBed.bed.x, inBed.bed.y + 34); return; }
  doChores(p, 0.4);
}

function doChores(p, talk = 1) {
  const room = pick(Object.keys(CHORES));
  p.goal = null; p.task = { t: 3 + Math.random() * 3 }; goTo(p, ROOM_POINT[room].x, ROOM_POINT[room].y);
  if (Math.random() < talk) say(p, CHORES[room]);
}

// ---------- Abilități ----------
function nearestParent(e) { return G.parents.filter(p => p.fx.daze <= 0).sort((a, b) => dist(a, e) - dist(b, e))[0]; }
function nearestKid(e) { return G.kids.filter(k => ['free', 'bed', 'floor'].includes(k.mode)).sort((a, b) => dist(a, e) - dist(b, e))[0]; }

// Întoarce un mesaj de eroare sau null dacă abilitatea a mers.
function useAbility(e, id, ai) {
  const ab = ABILITIES[id];
  if (e.cds[id] > 0) return 'Încă se reîncarcă.';
  if (e.mode === 'asleep' || e.mode === 'floor') return 'Doarme.';
  const scale = ai && G.mode === 'parent' ? 0.6 : 1;
  switch (ab.type) {
    case 'calmKid': { const k = nearestKid(e); if (!k) return 'Niciun copil treaz.'; k.fx.calm = ab.dur; if (ab.drop) k.awake = clamp(k.awake - ab.drop); say(k, 'Hmm...'); break; }
    case 'screensOff': G.fx.screens = ab.dur; G.kids.forEach(k => { if (k.stayScreen) k.fx.stayUp = 0; }); break;
    case 'fixAll': G.mess = []; if (ab.screens) G.fx.screens = Math.max(G.fx.screens, ab.screens); break;
    case 'lockRoom': G.fx.lock = ab.dur; break;
    case 'lockBeds': G.fx.lockBeds = ab.dur; break;
    case 'cradle': G.fx.cradle = ab.dur; break;
    case 'speed': if (e.role === 'kid' && e.mode !== 'free') return 'Nu poți fugi acum.'; e.fx.speed = ab.dur; e.speedMult = ab.mult; break;
    case 'lecture': { const room = roomAt(e.x, e.y); const ks = G.kids.filter(k => ['free', 'bed'].includes(k.mode) && roomAt(k.x, k.y) === room);
      if (!ks.length) return 'Nu e niciun copil în cameră.'; ks.forEach(k => { k.awake = clamp(k.awake - ab.amount); k.fx.freeze = 3; }); break; }
    case 'freezeFree': G.kids.filter(k => k.mode === 'free').forEach(k => { k.fx.freeze = ab.dur; }); break;
    case 'distract': case 'charm': {
      const targets = ab.all ? G.parents.filter(p => p.fx.daze <= 0) : [nearestParent(e)].filter(Boolean);
      if (!targets.length) return 'Părinții sunt deja ocupați.';
      targets.forEach(p => {
        release(p); p.path = []; p.goal = null; p.follow = null; say(p, ab.parentSay, 2.6);
        if (ab.type === 'charm') { p.fx.daze = ab.dur * scale; p.task = null; }
        else { const rooms = Object.keys(ROOM_POINT).filter(r => r !== roomAt(p.x, p.y));
          const pt = ROOM_POINT[ab.room === 'random' ? pick(rooms) : ab.room];
          if (p.player) { p.fx.daze = Math.max(2, ab.dur * scale); } else { p.task = { t: ab.dur * scale }; goTo(p, pt.x, pt.y); } }
      });
      if (e.player) G.chaos += 10;
      if (e.mode === 'bed' && ab.type === 'distract' && id === 'water') e.awake = clamp(e.awake + 10);
      break; }
    case 'scream': {
      e.awake = clamp(e.awake + 25);
      noise(e, ab.say, 0.7);
      G.parents.forEach(p => { if (p.carrying === e) release(p); p.fx.daze = Math.max(p.fx.daze, 2 * scale); });
      if (e.player) G.chaos += 20;
      break; }
    case 'invisible':
      e.fx.invis = ab.dur;
      G.parents.forEach(p => { if (p.carrying === e) release(p); if (p.follow === e) p.follow = null; });
      if (e.mode === 'bed' && !ai) { e.mode = 'free'; e.y += 22; }
      else if (e.mode === 'bed' && ai) leaveBed(e);
      break;
    case 'stayUp':
      if (e.mode !== 'bed') return 'Merge doar când ești în pat.';
      if (ab.screen && G.fx.screens > 0) return 'Wi-Fi-ul e oprit.';
      e.fx.stayUp = ab.dur; e.stayGain = ab.gain; e.stayScreen = !!ab.screen; break;
  }
  e.cds[id] = ab.cd;
  if (e.player) sfx('ability');
  if (ab.type !== 'scream') say(e, ab.say);
  if (ai && e.role === 'kid' && G.mode === 'parent' && ['charm', 'distract', 'scream'].includes(ab.type)) toast(`${e.name}: ${ab.name}!`);
  return null;
}

function aiAbility(e, dt) {
  if ((e.aiT -= dt) > 0) return;
  const t = e.role === 'parent' ? TUNE.parentAi[G.mode] : TUNE.ai;
  e.aiT = t[0] + Math.random() * t[1];
  const ids = e.abilities.filter(id => !(e.cds[id] > 0)).sort(() => Math.random() - 0.5);
  for (const id of ids) if (!useAbility(e, id, true)) return;
}

// ---------- Bucla ----------
function finish(win, onFloor) {
  if (G.over) return;
  G.over = true;
  const p = G.player, asleep = G.kids.filter(k => k.mode === 'asleep').length;
  let r;
  if (G.mode === 'parent') {
    const awake = G.kids.filter(k => k.mode !== 'asleep').map(k => `${k.name} (${Math.round(k.awake)}%)`).join(', ');
    r = win ? { eyebrow: 'Misiune îndeplinită', title: `Toți dorm la ${clockText()}`,
                text: `Mai ai ${Math.round(G.minutes * (1 - G.progress))} de minute doar pentru tine. Folosește-le cu înțelepciune: dormi și tu.` }
            : { eyebrow: 'E ora 21:00', title: 'Încă se aude ceva...',
                text: `Au adormit ${asleep} din ${G.kids.length} copii. Încă treji: ${awake}.` };
  } else {
    const chaos = Math.round(G.chaos);
    r = win ? { eyebrow: 'Rezistență legendară', title: `${p.name} a rezistat până la 21:00!`,
                text: `Puncte de haos: ${chaos}. Părinții au nevoie urgentă de o cafea.` }
            : { eyebrow: `Somn ușor, ${clockText()}`, title: onFloor ? `${p.name} a adormit pe covor` : `${p.name} a adormit`,
                text: `Ai rezistat până la ${clockText()} și ai strâns ${chaos} puncte de haos.` };
  }
  r.win = win;
  sfx(win ? 'win' : 'lose');
  G.result = r;
  if (G.onEnd) G.onEnd(r);
}

function step(dt) {
  if (!G || G.over) return;
  G.t += dt; G.progress = Math.min(1, G.t / G.duration);
  for (const f in G.fx) G.fx[f] = Math.max(0, G.fx[f] - dt);
  if (G.mark) G.mark.t -= dt * 1.5;
  for (const e of G.all) {
    for (const f in e.fx) e.fx[f] = Math.max(0, e.fx[f] - dt);
    for (const c in e.cds) e.cds[c] = Math.max(0, e.cds[c] - dt);
    if (e.sayT > 0) e.sayT -= dt;
  }
  // Treziri de noapte: bebelușii vor lapte; dacă nu sunt bebeluși, un copil adormit are un coșmar.
  // Dacă nu doarme nimeni încă, trezirea mai așteaptă.
  if (G.hunger.length && G.t > G.hunger[0]) {
    const babies = G.kids.filter(k => k.crib && !k.player && ['bed', 'asleep'].includes(k.mode));
    const big = G.kids.filter(k => !k.crib && !k.player && k.mode === 'asleep');
    if (babies.length) babies.forEach(k => wake(k, 82, 'Vreau lapte!'));
    else if (big.length) wake(pick(big), 60, pick(['Am avut un coșmar!', 'Mi-e sete!', 'Trebuie la baie!']));
    if (babies.length || big.length) G.hunger.shift(); else G.hunger[0] = G.t + 6;
  }
  for (const k of G.kids) updateKid(k, dt);
  for (const p of G.parents) updateParent(p, dt);
  tickActions(dt);
  const direct = directMove(dt);
  for (const e of G.all) if (!(e.player && direct)) move(e, dt);
  for (const p of G.parents) if (p.carrying) { p.carrying.x = p.x + 11; p.carrying.y = p.y - 9; }
  if (G.over) return;
  if (G.mode === 'parent' && G.kids.every(k => k.mode === 'asleep')) finish(true);
  else if (G.t >= G.duration) finish(G.mode === 'kid');
}
