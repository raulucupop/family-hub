// Harta casei (coordonate logice 720×600), drumuri prin uși și desenare.
const W = 720, H = 600;

const ROOMS = {
  kids:    { name: 'Camera copiilor',       x: 0,   y: 0,   w: 300, h: 270, floor: '#2c3566' },
  parents: { name: 'Dormitorul părinților', x: 300, y: 0,   w: 240, h: 270, floor: '#352f63' },
  bath:    { name: 'Baie',                  x: 540, y: 0,   w: 180, h: 270, floor: '#26456d' },
  living:  { name: 'Sufragerie',            x: 0,   y: 270, w: 430, h: 330, floor: '#2e3a60' },
  kitchen: { name: 'Bucătărie',             x: 430, y: 270, w: 290, h: 330, floor: '#383b5c' },
};

// v = ușă într-un perete vertical (camere stânga/dreapta)
const DOORS = [
  { a: 'kids',    b: 'parents', x: 300, y: 215, v: true },
  { a: 'kids',    b: 'living',  x: 140, y: 270 },
  { a: 'parents', b: 'living',  x: 370, y: 270 },
  { a: 'parents', b: 'bath',    x: 540, y: 215, v: true },
  { a: 'bath',    b: 'kitchen', x: 620, y: 270 },
  { a: 'living',  b: 'kitchen', x: 430, y: 450, v: true },
];

// Locurile care îi țin pe copii treji. gain = cât de treji îi face pe secundă.
const SPOTS = [
  { id: 'tv',      room: 'living',  x: 82,  y: 450, label: 'Desene',      gain: 3,   screen: true },
  { id: 'toys',    room: 'kids',    x: 236, y: 215, label: 'Jucării',     gain: 2,   mess: true },
  { id: 'bigbed',  room: 'parents', x: 420, y: 140, label: 'Sărituri',    gain: 2.5, mess: true },
  { id: 'tub',     room: 'bath',    x: 650, y: 115, label: 'Stropeală',   gain: 2,   mess: true },
  { id: 'drawers', room: 'kitchen', x: 660, y: 420, label: 'Sertare',     gain: 1.6, mess: true, lockable: true },
  { id: 'sofa',    room: 'living',  x: 300, y: 520, label: 'Canapea',     gain: 1.4 },
];

// Ascunzătorile pentru copilul jucat de tine.
const HIDES = [
  { id: 'underbed', label: 'sub patul mare', x: 366, y: 136 },
  { id: 'tub',      label: 'în cadă',        x: 650, y: 46 },
  { id: 'table',    label: 'sub masă',       x: 565, y: 485 },
  { id: 'sofa',     label: 'după canapea',   x: 416, y: 566 },
];

const BED_SLOTS = [
  { x: 50, y: 40 }, { x: 130, y: 40 }, { x: 210, y: 40 },
  { x: 50, y: 125 }, { x: 130, y: 125 }, { x: 210, y: 125 },
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function roomAt(x, y) {
  for (const id in ROOMS) {
    const r = ROOMS[id];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return id;
  }
  return null;
}

function clampToMap(p) {
  p.x = Math.max(14, Math.min(W - 14, p.x));
  p.y = Math.max(14, Math.min(H - 14, p.y));
  return p;
}

function doorPoints(d, from) {
  const c = ROOMS[from];
  const before = d.v ? (c.x + c.w / 2 < d.x ? -1 : 1) : (c.y + c.h / 2 < d.y ? -1 : 1);
  const o = 18;
  return d.v
    ? [{ x: d.x + before * o, y: d.y }, { x: d.x - before * o, y: d.y }]
    : [{ x: d.x, y: d.y + before * o }, { x: d.x, y: d.y - before * o }];
}

// Drum din (x0,y0) în (x1,y1) trecând prin uși. blocked(door) poate închide uși.
function route(x0, y0, x1, y1, blocked) {
  const r0 = roomAt(x0, y0), r1 = roomAt(x1, y1);
  const end = clampToMap({ x: x1, y: y1 });
  if (!r0 || !r1 || r0 === r1) return [end];
  const prev = { [r0]: null }, q = [r0];
  while (q.length) {
    const r = q.shift();
    if (r === r1) break;
    for (const d of DOORS) {
      if (blocked && blocked(d)) continue;
      const n = d.a === r ? d.b : d.b === r ? d.a : null;
      if (n && !(n in prev)) { prev[n] = { r, d }; q.push(n); }
    }
  }
  if (!(r1 in prev)) return null;
  const pts = [end];
  let c = r1;
  while (prev[c]) { const { r, d } = prev[c]; pts.unshift(...doorPoints(d, r)); c = r; }
  return pts;
}

// ---------- Desenare ----------
function rr(ctx, x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}

function drawFurniture(ctx, G) {
  // Sufragerie: covor, TV, canapea
  rr(ctx, 70, 330, 260, 220, 30, 'rgba(255,207,110,.06)');
  const tvOn = G.fx.screens <= 0;
  rr(ctx, 10, 405, 16, 90, 4, '#0b0f24');
  if (tvOn) { ctx.fillStyle = 'rgba(120,200,255,.18)'; ctx.beginPath(); ctx.moveTo(26, 410); ctx.lineTo(120, 380); ctx.lineTo(120, 520); ctx.lineTo(26, 490); ctx.fill(); }
  rr(ctx, 200, 548, 200, 40, 12, '#4b3f7a'); rr(ctx, 206, 540, 188, 18, 8, '#5c4f92');
  // Bucătărie: blat, frigider, masă, sertare
  rr(ctx, 440, 280, 200, 30, 4, '#4a4e74'); rr(ctx, 650, 280, 60, 54, 6, '#c9d2ee');
  rr(ctx, 520, 450, 90, 70, 10, '#5a4a3a');
  rr(ctx, 690, 370, 22, 100, 4, '#6a5440');
  for (let i = 0; i < 4; i++) rr(ctx, 692, 376 + i * 24, 18, 18, 2, G.fx.lock > 0 ? '#ffcf6e' : '#80684f');
  // Baie: cadă, chiuvetă
  rr(ctx, 590, 16, 118, 64, 24, '#d7e3f7'); rr(ctx, 600, 24, 98, 48, 18, '#8fc3f0');
  rr(ctx, 556, 130, 34, 30, 8, '#d7e3f7');
  // Dormitor părinți: patul mare
  rr(ctx, 356, 18, 128, 110, 10, '#4c4386'); rr(ctx, 364, 24, 50, 26, 8, '#e7e2ff'); rr(ctx, 426, 24, 50, 26, 8, '#e7e2ff');
  rr(ctx, 356, 60, 128, 68, 10, '#6a5fb8');
  // Camera copiilor: cutia cu jucării, fereastra cu luna
  rr(ctx, 210, 228, 60, 30, 6, '#8a5a3c');
  ['#ff8a7a', '#8fe3c5', '#ffcf6e'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(222 + i * 18, 228, 7, 0, 7); ctx.fill(); });
  rr(ctx, 255, 6, 40, 8, 3, '#9fc0ff');
}

function drawBeds(ctx, G) {
  for (const k of G.kids) {
    const b = k.bed, crib = k.crib;
    const w = crib ? 52 : 66, h = 34;
    rr(ctx, b.x - w / 2, b.y - h / 2, w, h, 8, '#1a1f45');
    rr(ctx, b.x - w / 2 + 3, b.y - h / 2 + 3, 14, h - 6, 5, '#e9ebff');
    const used = k.mode === 'bed' || k.mode === 'asleep';
    rr(ctx, b.x - w / 2 + 19, b.y - h / 2 + 3, w - 22, h - 6, 6, used ? k.color + 'aa' : '#4b5590');
    if (crib) { ctx.strokeStyle = '#c9cff0'; ctx.lineWidth = 1.5;
      for (let i = 0; i <= 6; i++) { const x = b.x - w / 2 + 2 + i * (w - 4) / 6; ctx.beginPath(); ctx.moveTo(x, b.y - h / 2); ctx.lineTo(x, b.y - h / 2 + 5); ctx.moveTo(x, b.y + h / 2); ctx.lineTo(x, b.y + h / 2 - 5); ctx.stroke(); } }
    const carried = G.player && G.player.carrying === k;
    if (carried) { ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.strokeRect(b.x - w / 2 - 5, b.y - h / 2 - 5, w + 10, h + 10); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(238,240,255,.75)'; ctx.font = '800 14px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(k.name, b.x, b.y + h / 2 + 15);
  }
}

function drawPerson(ctx, e, G) {
  const t = G.t;
  ctx.save();
  if (e.fx.invis > 0) ctx.globalAlpha = e.player ? 0.35 : 0.12;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.35, 0, 0, 7); ctx.fill();
  if (e.player) {
    ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7 + Math.sin(t * 6) * 2, 0, 7); ctx.stroke();
  }
  ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
  ctx.fillStyle = '#141833'; ctx.font = `800 ${Math.round(e.r * 1.15)}px "Baloo 2", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.name[0], e.x, e.y + 1);
  ctx.textBaseline = 'alphabetic';
  if (e.role === 'kid' && e.mode !== 'asleep') {
    ctx.strokeStyle = e.awake > 60 ? '#ff8a7a' : '#ffcf6e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.awake / 100); ctx.stroke();
  }
  if (e.role === 'kid' && (e.mode === 'asleep' || e.mode === 'floor')) {
    ctx.fillStyle = '#8fe3c5'; ctx.font = '800 13px "Baloo 2", sans-serif';
    const f = (t * 0.8) % 1;
    ctx.globalAlpha = 1 - f; ctx.fillText('z', e.x + e.r + 2 + f * 8, e.y - e.r - f * 14);
    ctx.globalAlpha = 1;
  }
  if (e.role === 'parent' && e.fx.daze > 0) {
    ctx.fillStyle = '#ffcf6e'; ctx.font = '800 14px "Baloo 2", sans-serif';
    for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.fillText('✦', e.x + Math.cos(a) * 16, e.y - e.r - 6 + Math.sin(a) * 4); }
  }
  ctx.restore();
}

function drawBubble(ctx, e) {
  if (!(e.sayT > 0) || !e.say) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, e.sayT * 2);
  ctx.font = '700 14px Nunito, sans-serif';
  const w = ctx.measureText(e.say).width + 16, h = 23;
  let x = Math.max(4, Math.min(W - w - 4, e.x - w / 2)), y = Math.max(4, e.y - e.r - 30);
  rr(ctx, x, y, w, h, 10, '#eef0ff');
  ctx.fillStyle = '#141833'; ctx.textAlign = 'left'; ctx.fillText(e.say, x + 8, y + 16);
  ctx.restore();
}

function render(ctx, G) {
  ctx.fillStyle = '#0a0e22'; ctx.fillRect(0, 0, W, H);
  for (const id in ROOMS) { const r = ROOMS[id]; ctx.fillStyle = r.floor; ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8); }
  for (const d of DOORS) {
    const kidsDoor = d.a === 'kids' || d.b === 'kids';
    ctx.fillStyle = G.fx.lock > 0 && kidsDoor ? '#ffcf6e' : '#454b80';
    if (d.v) ctx.fillRect(d.x - 5, d.y - 26, 10, 52); else ctx.fillRect(d.x - 26, d.y - 5, 52, 10);
  }
  ctx.font = '800 15px Nunito, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(238,240,255,.32)';
  for (const id in ROOMS) { const r = ROOMS[id]; ctx.fillText(r.name.toUpperCase(), r.x + 12, r.y + r.h - 12); }
  drawFurniture(ctx, G);
  ctx.font = '800 13px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,207,110,.7)';
  for (const s of SPOTS) {
    const off = (s.screen && G.fx.screens > 0) || (s.lockable && G.fx.lock > 0);
    ctx.fillText(off ? s.label + ' (oprit)' : s.label, s.x, s.y + 26);
  }
  if (G.mode === 'kid') { ctx.fillStyle = 'rgba(143,227,197,.6)'; for (const h of HIDES) ctx.fillText('ascunzătoare', h.x, h.y + 4); }
  drawBeds(ctx, G);
  for (const m of G.mess) {
    ctx.fillStyle = '#ff8a7a';
    for (let i = 0; i < 4; i++) { const a = m.seed + i * 1.7; ctx.fillRect(m.x + Math.cos(a) * 9 - 3, m.y + Math.sin(a) * 7 - 3, 6, 6); }
  }
  if (G.mark && G.mark.t > 0) {
    ctx.strokeStyle = `rgba(255,207,110,${G.mark.t})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(G.mark.x, G.mark.y, 14 - G.mark.t * 6, 0, 7); ctx.stroke();
  }
  const people = [...G.kids.filter(k => k.mode !== 'carried'), ...G.parents];
  people.sort((a, b) => a.y - b.y).forEach(e => drawPerson(ctx, e, G));
  for (const p of G.parents) if (p.carrying) drawPerson(ctx, p.carrying, G);
  ctx.fillStyle = `rgba(4,6,20,${0.05 + 0.3 * G.progress})`; ctx.fillRect(0, 0, W, H);
  [...G.kids, ...G.parents].forEach(e => drawBubble(ctx, e));
  ctx.font = '800 16px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
  for (const f of G.floats) { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - 30 - f.lift - (1.4 - f.t) * 30); }
  ctx.globalAlpha = 1;
}
