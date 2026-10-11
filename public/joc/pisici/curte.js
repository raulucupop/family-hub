// Harta de la bunici (coordonate logice 720×600): casa sus, curtea jos.
// Pereții opresc privirea adulților; ușile nu.
const W = 720, H = 600;

const ROOMS = {
  kitchen: { name: 'Bucătăria',        x: 0,   y: 0,   w: 250, h: 240 },
  bedroom: { name: 'Camera bunicilor', x: 250, y: 0,   w: 220, h: 240 },
  pantry:  { name: 'Cămara',           x: 470, y: 0,   w: 110, h: 240 },
  shed:    { name: 'Șopronul',         x: 580, y: 0,   w: 140, h: 240 },
  yard:    { name: 'Curtea',           x: 0,   y: 240, w: 720, h: 360 },
};

const DOORS = [
  { a: 'kitchen', b: 'bedroom', x: 250, y: 170, v: true },
  { a: 'bedroom', b: 'pantry',  x: 470, y: 190, v: true },
  { a: 'kitchen', b: 'yard',    x: 120, y: 240 },
  { a: 'bedroom', b: 'yard',    x: 380, y: 240 },
  { a: 'shed',    b: 'yard',    x: 650, y: 240 },
];

// [x1, y1, x2, y2, înălțime]; bucățile dintre uși se calculează mai jos.
const WALL_LINES = [
  [0, 0, 720, 0, 60], [0, 0, 0, 240, 50], [720, 0, 720, 240, 50], [0, 240, 720, 240, 40],
  [250, 0, 250, 240, 42], [470, 0, 470, 240, 42], [580, 0, 580, 240, 46],
];
const WALLS = [];
for (const [x1, y1, x2, y2, h] of WALL_LINES) {
  const vertical = x1 === x2;
  const cuts = DOORS
    .filter(d => vertical ? d.v && d.x === x1 && d.y > y1 && d.y < y2 : !d.v && d.y === y1 && d.x > x1 && d.x < x2)
    .map(d => vertical ? [d.y - 26, d.y + 26] : [d.x - 26, d.x + 26])
    .sort((a, b) => a[0] - b[0]);
  let start = vertical ? y1 : x1;
  const pieces = [];
  for (const [a, b] of cuts) { pieces.push([start, a]); start = b; }
  pieces.push([start, vertical ? y2 : x2]);
  for (const [a, b] of pieces) if (b - a > 1) WALLS.push(vertical ? { x1, y1: a, x2, y2: b, h } : { x1: a, y1, x2: b, y2, h });
}

// Unde stau pisicile.
const CAT_SPOTS = [
  { label: 'pe sobă', x: 45, y: 48 }, { label: 'pe pervaz', x: 200, y: 26 },
  { label: 'sub pat', x: 360, y: 70 }, { label: 'în coșul cu rufe', x: 445, y: 212 },
  { label: 'pe raftul cu borcane', x: 525, y: 40 }, { label: 'în fân', x: 650, y: 110 },
  { label: 'în grădină', x: 535, y: 380 }, { label: 'lângă fântână', x: 330, y: 482 },
  { label: 'pe bancă', x: 90, y: 528 }, { label: 'sub copac', x: 280, y: 548 },
  { label: 'lângă coteț', x: 640, y: 548 }, { label: 'pe prispă', x: 300, y: 262 },
];

// Unde se poate ascunde copilul (cerc cu raza r).
const HIDES = [
  { label: 'sub masă', x: 130, y: 150, r: 30 }, { label: 'sub pat', x: 360, y: 70, r: 30 },
  { label: 'după butoi', x: 522, y: 196, r: 24 }, { label: 'în fân', x: 650, y: 160, r: 30 },
  { label: 'în tufiș', x: 190, y: 330, r: 28 }, { label: 'în tufiș', x: 470, y: 562, r: 28 },
  { label: 'în tufiș', x: 692, y: 300, r: 24 }, { label: 'în căpița de fân', x: 640, y: 432, r: 30 },
];

const BASKET = { x: 46, y: 292 };
const START = { x: 80, y: 310 };

// Traseele de pază. nap = Bunicul poate ațipi aici; laundry = Irina iese uneori la rufe.
const PATROLS = {
  bunicul: [{ x: 330, y: 470 }, { x: 530, y: 410 }, { x: 650, y: 330 }, { x: 650, y: 170 }, { x: 650, y: 330 },
            { x: 400, y: 560 }, { x: 240, y: 520 }, { x: 95, y: 505, nap: true }, { x: 200, y: 290 }, { x: 330, y: 330 }],
  irina:   [{ x: 60, y: 110 }, { x: 150, y: 190 }, { x: 330, y: 170 }, { x: 525, y: 120 }, { x: 400, y: 200, laundry: true },
            { x: 170, y: 80 }],
};
const LAUNDRY = { x: 500, y: 300 };

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
  return d.v
    ? [{ x: d.x + before * 18, y: d.y }, { x: d.x - before * 18, y: d.y }]
    : [{ x: d.x, y: d.y + before * 18 }, { x: d.x, y: d.y - before * 18 }];
}

// Drum prin uși de la (x0,y0) la (x1,y1).
function route(x0, y0, x1, y1) {
  const r0 = roomAt(x0, y0), r1 = roomAt(x1, y1);
  const end = clampToMap({ x: x1, y: y1 });
  if (!r0 || !r1 || r0 === r1) return [end];
  const prev = { [r0]: null }, q = [r0];
  while (q.length) {
    const r = q.shift();
    if (r === r1) break;
    for (const d of DOORS) {
      const n = d.a === r ? d.b : d.b === r ? d.a : null;
      if (n && !(n in prev)) { prev[n] = { r, d }; q.push(n); }
    }
  }
  const pts = [end];
  let c = r1;
  while (prev[c]) { const { r, d } = prev[c]; pts.unshift(...doorPoints(d, r)); c = r; }
  return pts;
}

// Pentru mișcarea directă (joystick): în cameră, departe de pereți, sau prin ușă.
function walkable(x, y) {
  for (const id in ROOMS) {
    const r = ROOMS[id];
    if (x > r.x + 12 && x < r.x + r.w - 12 && y > r.y + 12 && y < r.y + r.h - 12) return true;
  }
  return DOORS.some(d => d.v ? Math.abs(x - d.x) <= 16 && Math.abs(y - d.y) <= 20 : Math.abs(y - d.y) <= 16 && Math.abs(x - d.x) <= 20);
}

// Se vede de la a la b? (niciun perete între ele)
function lineOfSight(a, b) {
  const cross = (px, py, qx, qy) => px * qy - py * qx;
  const rx = b.x - a.x, ry = b.y - a.y;
  for (const w of WALLS) {
    const sx = w.x2 - w.x1, sy = w.y2 - w.y1, den = cross(rx, ry, sx, sy);
    if (Math.abs(den) < 1e-9) continue;
    const qpx = w.x1 - a.x, qpy = w.y1 - a.y;
    const t = cross(qpx, qpy, sx, sy) / den, u = cross(qpx, qpy, rx, ry) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) return false;
  }
  return true;
}
