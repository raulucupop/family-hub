// Ecranele, controlul (joystick, taste, mângâiat) și bucla jocului „Vânătoare de pisici la bunici”.
const $ = id => document.getElementById(id);
const ui = { kid: null };
const show = id => ['scr-kid', 'scr-game'].forEach(s => { $(s).hidden = s !== id; });
const dot = m => `<span class="dot" style="background:${m.color}">${m.name[0]}</span>`;
const CAT_STATE = { rest: 'Stă', walk: 'Se plimbă', flee: 'Fuge!', lured: 'Vine', carried: 'În brațe', basket: 'În coș' };

// ---------- Alegerea copilului ----------
$('adults').innerHTML = ADULTS.map(a => `
  <div class="card adult">
    <div class="row">${dot(a)}<div><h3>${a.name}</h3><div class="age">vede până la ${Math.round(a.range / 10)} pași</div></div></div>
    <p class="trait">${a.trait}</p>
  </div>`).join('');

function renderKids() {
  $('kids-pick').innerHTML = FAMILIES.map(f => {
    const kids = f.members.filter(m => m.role === 'kid');
    return `<p class="group-title">${f.name}</p><div class="chars">${kids.map(m => {
      const t = CAT_KIDS[m.id];
      const abs = t.abilities.map(id => `<li><b>${CAT_ABILITIES[id].name}</b>: ${CAT_ABILITIES[id].desc}</li>`).join('');
      return `<button class="card char ${ui.kid === m.id ? 'sel' : ''}" data-kid="${m.id}">
        <div class="row">${dot(m)}<div><h3>${m.name}</h3><div class="age">${m.age} · duce ${t.carry} ${t.carry === 1 ? 'pisică' : 'pisici'} odată</div></div></div>
        <p class="trait">${t.note}</p><ul>${abs}</ul></button>`;
    }).join('')}</div>`;
  }).join('');
  const m = ui.kid && kidInfo(ui.kid);
  $('start').disabled = !m;
  $('start').textContent = m ? `Începe cu ${m.name}` : 'Alege un copil';
}
$('kids-pick').onclick = e => { const b = e.target.closest('[data-kid]'); if (!b) return; ui.kid = b.dataset.kid; renderKids(); };
$('start').onclick = startGame;
renderKids();

// ---------- Jocul ----------
let raf = 0, last = 0, hudAt = 0, toastTimer = 0;
const stage = document.querySelector('.stage');
const view = Farm3D ? Farm3D.init(stage) : null;
$('cam').onclick = () => { if (view) $('cam').innerHTML = '<span class="pre">Unghi: </span>' + view.cycleView(); };
const soundLabel = () => { $('snd').textContent = Sfx.on ? 'Sunet pornit' : 'Fără sunet'; };
$('snd').onclick = () => { Sfx.toggle(); soundLabel(); };
soundLabel();

function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function startGame() {
  if (!view) { showToast('Jocul are nevoie de un browser cu 3D (WebGL).'); return; }
  cancelAnimationFrame(raf);
  newHunt(ui.kid);
  view.newGame(G);
  Object.assign(G, { onToast: showToast, onEnd: showEnd, onSfx: Sfx.play });
  keys.clear(); actCache = '';
  $('end').hidden = true;
  show('scr-game');
  const k = G.kid;
  $('mission').textContent = `${k.name}: adu toate pisicile în coș`;
  $('hint').textContent = k.calm
    ? 'Trage pe hartă ca să te miști (sau WASD). Butonul rotund sau Spațiu: mângâie pisica. Taste: 1-2 abilități, C cameră.'
    : 'Pisicile fug dacă alergi spre ele: trage doar puțin cu degetul sau ține Shift ca să mergi încet. Spațiu: mângâie. 1-2 abilități, C cameră.';
  $('abilities').innerHTML = k.abilities.map((id, i) => `
    <button class="ab" data-ab="${id}"><span class="key">${i + 1}</span><b>${CAT_ABILITIES[id].name}</b>
    <small>${CAT_ABILITIES[id].desc}</small><span class="cd" hidden></span></button>`).join('');
  $('cats').innerHTML = G.cats.map(c => `
    <div class="catchip" data-cat="${c.id}"><span class="paw" style="background:${c.color}"></span><b>${c.name}</b><span class="st"></span></div>`).join('');
  showToast('E 17:00. Fără pisică în brațe, Bunicul și Irina te lasă în pace.');
  last = performance.now();
  raf = requestAnimationFrame(frame);
  $('scr-game').scrollIntoView({ block: 'start' });
}

function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  step(dt);
  view.render(G, dt);
  updateAction();
  if (ts - hudAt > 120 || G.over) { hudAt = ts; updateHud(); }
  if (!G.over) raf = requestAnimationFrame(frame);
}

function updateHud() {
  const k = G.kid;
  $('clock').textContent = clockText();
  $('score').textContent = `În coș: ${G.inBasket} din ${G.cats.length} · ${'♥'.repeat(G.hearts)}${'♡'.repeat(HEARTS - G.hearts)}`;
  $('arms').textContent = k.carrying.length ? `În brațe: ${k.carrying.map(c => c.name).join(', ')} (${k.carrying.length}/${k.carry})` : k.hidden ? 'Ești ascuns' : '';
  document.querySelectorAll('.ab').forEach(b => {
    const cd = k.cds[b.dataset.ab] || 0, o = b.querySelector('.cd');
    o.hidden = cd <= 0; o.textContent = Math.ceil(cd) + ' s'; b.disabled = cd > 0;
  });
  for (const c of G.cats) {
    const el = document.querySelector(`[data-cat="${c.id}"]`); if (!el) continue;
    el.classList.toggle('done', c.state === 'basket');
    el.classList.toggle('held', c.state === 'carried');
    el.querySelector('.st').textContent = CAT_STATE[c.state] || '';
  }
}

// ---------- Butonul de mângâiat ----------
let actCache = '';
function updateAction() {
  const a = G.over ? null : availableAction(), btn = $('act');
  const key = a ? `${a.label}|${a.hot}` : '';
  if (key !== actCache) {
    actCache = key;
    btn.hidden = !a;
    if (a) { $('act-label').textContent = a.label; btn.classList.toggle('hot', !!a.hot); }
  }
  if (a) btn.style.setProperty('--p', Math.max(0, Math.min(1, a.progress)));
}
function act() { if (G && !G.over) { doAction(); updateAction(); } }
$('act').onclick = act;

function tryAbility(id) {
  if (!G || G.over) return;
  const err = useAbility(id);
  if (err) showToast(err);
}
$('abilities').onclick = e => { const b = e.target.closest('[data-ab]'); if (b) tryAbility(b.dataset.ab); };

// ---------- Taste ----------
const keys = new Set();
let slow = false;
const DIRS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
function keyInput() {
  let x = 0, y = 0;
  keys.forEach(k => { x += DIRS[k][0]; y += DIRS[k][1]; });
  const len = Math.hypot(x, y) || 1, m = slow ? 0.5 : 1;
  G.input = { x: x / len * m, y: y / len * m };
}
document.addEventListener('keydown', e => {
  if ($('scr-game').hidden || !G) return;
  const k = e.key.toLowerCase();
  if (k === 'shift') { slow = true; keyInput(); return; }
  if (DIRS[k]) { e.preventDefault(); if (!keys.has(k)) { keys.add(k); keyInput(); } return; }
  if (k === ' ' || k === 'e') { e.preventDefault(); act(); return; }
  if (k === 'c') return $('cam').click();
  if (k === 'm') return $('snd').click();
  const id = G.kid.abilities[Number(e.key) - 1];
  if (id) tryAbility(id);
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'shift') { slow = false; if (G) keyInput(); return; }
  if (keys.delete(k) && G) keyInput();
});

// ---------- Atingeri: apăsare scurtă = mergi acolo; tras = joystick (puțin = încet) ----------
let drag = null;
if (view) {
  const surface = view.canvas;
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
      const r = stage.getBoundingClientRect(), j = $('joy');
      j.style.left = (drag.x0 - r.left) + 'px'; j.style.top = (drag.y0 - r.top) + 'px'; j.hidden = false;
    }
    if (drag.joy && len > 0) {
      const m = Math.min(1, len / 60);
      G.input = { x: dx / len * m, y: dy / len * m };
      $('joy-knob').style.transform = `translate(${(dx / len * m * 34).toFixed(1)}px, ${(dy / len * m * 34).toFixed(1)}px)`;
      $('joy').classList.toggle('slow', m < 0.62);
    }
  });
  const end = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.joy || cancel) { if (G) G.input = { x: 0, y: 0 }; $('joy').hidden = true; }
    else tapAt(e.clientX, e.clientY);
    drag = null;
  };
  surface.addEventListener('pointerup', e => end(e, false));
  surface.addEventListener('pointercancel', e => end(e, true));
}

function tapAt(cx, cy) {
  if (!G || G.over) return;
  const a = availableAction();
  if (a && a.hot) return act(); // în timp ce mângâi, orice atingere contează
  const p = view.pick(cx, cy);
  if (!p) return;
  const k = G.kid;
  if (k.fx.frozen > 0) return showToast('Stai cuminte câteva secunde.');
  G.mark = { x: p.x, y: p.y, t: 1 };
  goTo(k, p.x, p.y);
}

// ---------- Final și recorduri ----------
function record() {
  const key = `os-pisici-${ui.kid}`;
  let best = null;
  try { best = JSON.parse(localStorage.getItem(key)); } catch (e) { /* fără stocare */ }
  if (!best || G.score > best) {
    try { localStorage.setItem(key, JSON.stringify(G.score)); } catch (e) { /* fără stocare */ }
    return best ? `Record nou! Înainte: ${best} puncte.` : 'Primul tău record cu acest copil.';
  }
  return `Recordul tău: ${best} puncte.`;
}
function showEnd(r) {
  $('end-eyebrow').textContent = r.eyebrow;
  $('end-title').textContent = r.title;
  $('end-text').textContent = r.text;
  $('end-record').textContent = record();
  G.input = { x: 0, y: 0 }; $('joy').hidden = true; $('act').hidden = true;
  setTimeout(() => { updateHud(); $('end').hidden = false; $('again').focus(); }, 700);
}
$('again').onclick = startGame;
$('change').onclick = () => { $('end').hidden = true; renderKids(); show('scr-kid'); };
$('quit').onclick = () => { cancelAnimationFrame(raf); if (G) G.over = true; renderKids(); show('scr-kid'); };
