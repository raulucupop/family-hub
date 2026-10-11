// Ecranele, butoanele, controlul (joystick, taste, acțiune) și bucla de joc.
const $ = id => document.getElementById(id);
const ui = { fam: null, char: null, guest: null };
const show = id => ['scr-family', 'scr-char', 'scr-game'].forEach(s => { $(s).hidden = s !== id; });
const STATE = { free: 'Prin casă', carried: 'În brațe', bed: 'În pat', asleep: 'Doarme', floor: 'Doarme pe jos' };
const dot = m => `<span class="dot" style="background:${m.color}">${m.name[0]}</span>`;

// ---------- Alegerea familiei și a personajului ----------
$('families').innerHTML = FAMILIES.map(f => `
  <button class="card" data-fam="${f.id}">
    <div class="dots">${f.members.map(dot).join('')}</div>
    <h3>${f.name}</h3>
    <p class="who">${f.members.map(m => m.name).join(', ')}</p>
  </button>`).join('');

$('families').onclick = e => {
  const b = e.target.closest('[data-fam]'); if (!b) return;
  Object.assign(ui, { fam: b.dataset.fam, char: null, guest: null });
  renderChars(); show('scr-char'); window.scrollTo(0, 0);
};
$('back-family').onclick = () => show('scr-family');

function charCard(m) {
  const abs = m.abilities.map(id => `<li><b>${ABILITIES[id].name}</b>: ${ABILITIES[id].desc}</li>`).join('');
  return `<button class="card char ${ui.char === m.id ? 'sel' : ''}" data-char="${m.id}">
    <div class="row">${dot(m)}<div><h3>${m.name}</h3><div class="age">${m.age}</div></div></div>
    <span class="tag ${m.role === 'kid' ? 'kid' : ''}">${m.role === 'kid' ? 'Copil: rezistă treaz' : 'Părinte: adoarme copiii'}</span>
    <p class="trait">${m.trait}</p><ul>${abs}</ul></button>`;
}

function renderChars() {
  const f = FAMILIES.find(x => x.id === ui.fam);
  $('char-title').textContent = `${f.name}: alege personajul`;
  const group = (title, role) => `<p class="group-title">${title}</p><div class="chars">${f.members.filter(m => m.role === role).map(charCard).join('')}</div>`;
  $('chars').innerHTML = group('Părinți', 'parent') + group('Copii', 'kid');
  const others = FAMILIES.filter(x => x.id !== ui.fam);
  $('guests').innerHTML = [`<button class="chip ${!ui.guest ? 'sel' : ''}" data-guest="">Fără musafiri</button>`,
    ...others.map(o => `<button class="chip ${ui.guest === o.id ? 'sel' : ''}" data-guest="${o.id}">Vin în vizită ${o.members.filter(m => m.role === 'kid').map(m => m.name).join(', ')}</button>`)].join('');
  renderHowto();
}

function renderHowto() {
  const m = ui.char && FAMILIES.find(x => x.id === ui.fam).members.find(x => x.id === ui.char);
  const start = $('start');
  start.disabled = !m;
  start.textContent = m ? `Începe cu ${m.name}` : 'Alege un personaj';
  if (!m) { $('howto').innerHTML = '<p>Alege un părinte ca să adormi copiii, sau un copil ca să le strici planul.</p>'; return; }
  const moveTxt = '<p><b>Mișcare:</b> trage cu degetul pe hartă, ca pe un joystick (pe calculator: WASD sau săgețile). Poți și să atingi un loc ca să mergi singur acolo.</p>';
  $('howto').innerHTML = m.role === 'parent'
    ? `<p><b>Misiunea:</b> toți copiii în pat și adormiți înainte de 21:00. Prinzi un copil când ajungi lângă el și îl duci la patul marcat cu galben.</p>${moveTxt}
       <p><b>Butonul rotund</b> (sau Spațiu) face ce e lângă tine: lângă un pat spui o poveste în ritm (atinge când bulina e în mijloc), lângă jucării le strângi, lângă televizor îl stingi. Când copilul din brațe se zbate, apasă repede „Ține-l bine!”.</p>`
    : m.still
    ? `<p><b>Misiunea:</b> nu adormi până la 21:00.</p>
       <p>${m.name} nu merge încă, deci joci din pătuț. Părinții vin să te legene și atunci adormi repede. Țipă și zâmbește la momentul potrivit.</p>`
    : `<p><b>Misiunea:</b> nu adormi până la 21:00 și fă cât mai mult haos.</p>${moveTxt}
       <p><b>Butonul rotund</b> (sau Spațiu): la desene, jucării, cadă, sertare, canapea sau pe patul mare faci haos. În ascunzători (cercurile verzi) nu te văd părinții, dar te pot găsi. Dacă te prind, atinge repede ca să te zbați. În pat te poți preface că dormi.</p>`;
}

$('chars').onclick = e => { const b = e.target.closest('[data-char]'); if (!b) return; ui.char = b.dataset.char; renderChars(); };
$('guests').onclick = e => { const b = e.target.closest('[data-guest]'); if (!b) return; ui.guest = b.dataset.guest || null; renderChars(); };
$('start').onclick = startGame;

// ---------- Jocul ----------
const cv = $('cv');
const ctx = cv.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * dpr; cv.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
let raf = 0, last = 0, hudAt = 0, toastTimer = 0;
const stage = document.querySelector('.stage');
// 3D dacă browserul poate; altfel rămâne harta 2D.
const view = View3D ? View3D.init(stage) : null;
if (view) $('cam').hidden = false;
$('cam').onclick = () => { if (view) $('cam').innerHTML = '<span class="pre">Unghi: </span>' + view.cycleView(); };
const soundLabel = () => { $('snd').textContent = Sfx.on ? 'Sunet pornit' : 'Fără sunet'; };
$('snd').onclick = () => { Sfx.toggle(); soundLabel(); };
soundLabel();

function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

function startGame() {
  cancelAnimationFrame(raf);
  newGame(ui.fam, ui.char, ui.guest);
  if (view) view.newGame(G);
  G.onToast = showToast;
  G.onEnd = showEnd;
  G.onSfx = Sfx.play;
  keys.clear();
  $('end').hidden = true;
  show('scr-game');
  const p = G.player;
  $('mission').textContent = G.mode === 'parent' ? 'Adoarme toți copiii până la 21:00' : `${p.name}: nu adormi până la 21:00`;
  $('hint').textContent = p.still
    ? 'Nu ai cum să mergi, dar ai abilități. Pe tastatură: 1 și 2.'
    : 'Trage pe hartă ca să te miști (sau WASD). Butonul rotund sau Spațiu: acțiunea de lângă tine. Taste: 1-3 abilități, C cameră.';
  $('abilities').innerHTML = p.abilities.map((id, i) => `
    <button class="ab" data-ab="${id}"><span class="key">${i + 1}</span><b>${ABILITIES[id].name}</b>
    <small>${ABILITIES[id].desc}</small><span class="cd" hidden></span></button>`).join('');
  $('kids').innerHTML = G.kids.map(k => `
    <div class="kid ${k.player ? 'me' : ''}" data-kid="${k.id}">
      <div class="top"><b>${k.name}</b><span class="st"></span></div><div class="bar"><i></i></div>
    </div>`).join('');
  actCache = '';
  showToast(G.mode === 'parent' ? `E ${clockText(0)}. Începe cu cel mai treaz copil.` : `E ${clockText(0)}. Părinții au început operațiunea!`);
  last = performance.now();
  raf = requestAnimationFrame(frame);
  $('scr-game').scrollIntoView({ block: 'start' });
}

function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  step(dt);
  if (view) view.render(G, dt); else render(ctx, G);
  updateAction();
  if (ts - hudAt > 120 || G.over) { hudAt = ts; updateHud(); }
  if (!G.over) raf = requestAnimationFrame(frame);
}

function updateHud() {
  $('clock').textContent = clockText();
  const asleep = G.kids.filter(k => k.mode === 'asleep').length;
  $('score').textContent = G.mode === 'parent'
    ? `Dorm: ${asleep} din ${G.kids.length}`
    : `Haos: ${Math.round(G.chaos)} · Treaz: ${Math.round(G.player.awake)}%`;
  document.querySelectorAll('.ab').forEach(b => {
    const cd = G.player.cds[b.dataset.ab] || 0, o = b.querySelector('.cd');
    o.hidden = cd <= 0; o.textContent = Math.ceil(cd) + ' s'; b.disabled = cd > 0;
  });
  for (const k of G.kids) {
    const el = document.querySelector(`[data-kid="${k.id}"]`); if (!el) continue;
    el.classList.toggle('asleep', k.mode === 'asleep');
    el.querySelector('.st').textContent = k.hidden ? 'Ascuns' : STATE[k.mode];
    el.querySelector('.bar i').style.width = (k.mode === 'asleep' ? 100 : k.awake) + '%';
  }
}

// ---------- Butonul de acțiune și bara poveștii ----------
let actCache = '';
function updateAction() {
  const a = G.over ? null : availableAction(), btn = $('act');
  const key = a ? `${a.id}|${a.label}|${!!a.disabled}|${!!a.hot}` : '';
  if (key !== actCache) {
    actCache = key;
    btn.hidden = !a;
    if (a) { $('act-label').textContent = a.label; btn.disabled = !!a.disabled; btn.classList.toggle('hot', !!a.hot); }
  }
  if (a) btn.style.setProperty('--p', a.progress != null ? Math.max(0, Math.min(1, a.progress)) : 0);
  const bar = $('story');
  bar.hidden = !G.story;
  if (G.story) $('story-cur').style.left = (storyCursor() * 100).toFixed(1) + '%';
}

function act() {
  if (!G || G.over) return;
  doAction();
  updateAction();
}
$('act').onclick = act;
$('story').onclick = act;

function tryAbility(id) {
  if (!G || G.over) return;
  const err = useAbility(G.player, id, false);
  if (err) showToast(err);
}
$('abilities').onclick = e => { const b = e.target.closest('[data-ab]'); if (b) tryAbility(b.dataset.ab); };

// ---------- Taste ----------
const keys = new Set();
const DIRS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
function keyInput() {
  let x = 0, y = 0;
  keys.forEach(k => { x += DIRS[k][0]; y += DIRS[k][1]; });
  G.input = { x, y };
  if ((x || y) && G.player.mode === 'bed') tryLeaveBed(false);
}
document.addEventListener('keydown', e => {
  if ($('scr-game').hidden || !G) return;
  const k = e.key.toLowerCase();
  if (DIRS[k]) { e.preventDefault(); if (!keys.has(k)) { keys.add(k); keyInput(); } return; }
  if (k === ' ' || k === 'e') { e.preventDefault(); if (!e.repeat || availableAction()?.hot) act(); return; }
  if (k === 'c') return $('cam').click();
  if (k === 'm') return $('snd').click();
  const id = G.player.abilities[Number(e.key) - 1];
  if (id) tryAbility(id);
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (keys.delete(k) && G) keyInput();
});

// ---------- Atingeri: apăsare scurtă = mergi acolo; tras = joystick ----------
const surface = view ? view.canvas : cv;
let drag = null;
function stagePoint(cx, cy) { const r = stage.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; }
surface.addEventListener('pointerdown', e => {
  if (!G || G.over) return;
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, joy: false };
  try { surface.setPointerCapture(e.pointerId); } catch (err) { /* nu e obligatoriu */ }
});
surface.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || !G) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, len = Math.hypot(dx, dy);
  if (!drag.joy && len > 14) {
    drag.joy = true;
    const s = stagePoint(drag.x0, drag.y0), j = $('joy');
    j.style.left = s.x + 'px'; j.style.top = s.y + 'px'; j.hidden = false;
    if (G.player.mode === 'bed') tryLeaveBed(true);
  }
  if (drag.joy && len > 0) {
    const k = Math.min(1, len / 55);
    G.input = { x: dx / len * k, y: dy / len * k };
    $('joy-knob').style.transform = `translate(${(dx / len * k * 34).toFixed(1)}px, ${(dy / len * k * 34).toFixed(1)}px)`;
  }
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.joy || cancel) { if (G) G.input = { x: 0, y: 0 }; $('joy').hidden = true; }
  else tapAt(e.clientX, e.clientY);
  drag = null;
}
surface.addEventListener('pointerup', e => endDrag(e, false));
surface.addEventListener('pointercancel', e => endDrag(e, true));

function tapAt(cx, cy) {
  if (!G || G.over) return;
  const a = availableAction();
  if (a && a.hot) return act(); // în mini-joc, orice atingere contează
  let p;
  if (view) p = view.pick(cx, cy);
  else { const r = cv.getBoundingClientRect(); p = { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H }; }
  if (p) handleTap(p.x, p.y);
}

function tryLeaveBed(quiet) {
  const p = G.player;
  if (p.mode !== 'bed' || p.still) return false;
  if (!canLeaveBed(p)) {
    if (quiet && G.lastBedMsg > G.t - 1.5) return false;
    G.lastBedMsg = G.t;
    const watcher = G.parents.find(q => q.fx.daze <= 0 && dist(q, p) < TUNE.watch);
    showToast(G.fx.lockBeds > 0 ? 'Stingerea! Nu poți ieși încă.'
      : p.fx.calm > 0 ? 'Te-au calmat. Mai stai puțin.'
      : p.fx.stayUp > 0 ? 'Termină întâi ce ai început.'
      : watcher ? `Te vede ${watcher.name}! Așteaptă să plece, prefă-te că dormi sau folosește o abilitate.` : 'Nu poți ieși acum.');
    return false;
  }
  p.mode = 'free'; p.y += 22; G.chaos += 10; say(p, 'Hi-hi!');
  return true;
}

function handleTap(x, y) {
  const p = G.player;
  G.mark = { x, y, t: 1 };
  if (G.mode === 'parent') {
    if (p.fx.daze > 0) return showToast('Ai uitat ce voiai să faci. Revii în câteva secunde.');
    const k = G.kids.find(k => ['free', 'floor'].includes(k.mode) && !(k.fx.invis > 0) && Math.hypot(k.x - x, k.y - y) < 34);
    p.follow = k || null; p.think = 0;
    goTo(p, k ? k.x : x, k ? k.y : y);
    return;
  }
  if (p.still) return showToast(`${p.name} nu merge încă. Folosește abilitățile.`);
  if (p.mode === 'carried') return showToast('Ești în brațe. Atinge repede ca să te zbați!');
  if (p.mode === 'bed' && !tryLeaveBed(false)) return;
  if (p.hidden) unhide(p);
  if (p.mode === 'free' && !goTo(p, x, y)) showToast('Ușile camerei copiilor sunt blocate!');
}

// ---------- Final și recorduri ----------
function record(r) {
  const key = `os-best-${ui.fam}-${ui.char}-${ui.guest || 'acasa'}`;
  let best = null;
  try { best = JSON.parse(localStorage.getItem(key)); } catch (e) { /* fără stocare */ }
  let cur = null;
  if (G.mode === 'kid') cur = { score: Math.round(G.chaos), label: `${Math.round(G.chaos)} puncte de haos` };
  else if (r.win) cur = { score: Math.round(G.minutes * (1 - G.progress)), label: `toți adormiți la ${clockText()}` };
  if (cur && (!best || cur.score > best.score)) {
    try { localStorage.setItem(key, JSON.stringify(cur)); } catch (e) { /* fără stocare */ }
    return best ? `Record nou! Înainte: ${best.label}.` : 'Primul tău record cu acest personaj.';
  }
  return best ? `Recordul tău: ${best.label}.` : '';
}

function showEnd(r) {
  $('end-eyebrow').textContent = r.eyebrow;
  $('end-title').textContent = r.title;
  $('end-text').textContent = r.text;
  $('end-record').textContent = record(r);
  G.input = { x: 0, y: 0 }; $('joy').hidden = true; $('act').hidden = true; $('story').hidden = true;
  setTimeout(() => { updateHud(); $('end').hidden = false; $('again').focus(); }, 700);
}
$('again').onclick = startGame;
$('change').onclick = () => { $('end').hidden = true; renderChars(); show('scr-char'); };
$('quit').onclick = () => { cancelAnimationFrame(raf); if (G) G.over = true; renderChars(); show('scr-char'); };
