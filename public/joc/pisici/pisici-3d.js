// Curtea bunicilor în 3D: casa văruită, curtea, pisicile, Bunicul și Irina cu conurile lor de vedere.
// Coordonatele hărții (x, y) devin (X = x - W/2, Z = y - H/2), cu înălțimea pe Y.
const Farm3D = !window.THREE ? null : (() => {
  const X = x => x - W / 2, Z = y => y - H / 2;
  const HEIGHT = { aida: 69, luiza: 66, andrei: 60, amelia: 54, mara: 42, matei: 34, maria: 30 };
  const VIEWS = [{ id: 'yard', label: 'Toată curtea', el: 55 }, { id: 'near', label: 'Aproape', el: 62 }, { id: 'top', label: 'De sus', el: 86 }];
  // Cât de sus stă o pisică pe mobilă (sobă, pat, raft, fân, bancă).
  const PLATFORMS = [
    { x0: 10, y0: 10, x1: 80, y1: 80, h: 52 }, { x0: 300, y0: 15, x1: 420, y1: 120, h: 24 },
    { x0: 476, y0: 8, x1: 576, y1: 52, h: 60 }, { x0: 596, y0: 60, x1: 712, y1: 190, h: 30 },
    { x0: 60, y0: 512, x1: 120, y1: 534, h: 15 }, { x0: 430, y0: 198, x1: 462, y1: 228, h: 14 },
  ];
  const heightAt = (x, y) => (PLATFORMS.find(p => x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1) || { h: 0 }).h;

  let renderer, scene, cam, stage, layer, dyn, sun, hemi, markMesh, viewIdx = 0, time = 0, snap = true;
  let kidA = null, adultsA = [], catsA = [], floatEls = [], pinEls = [];
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const skyDay = new THREE.Color('#f3c995'), skyDusk = new THREE.Color('#6a5a8c'), sunDay = new THREE.Color('#ffd9a0'), sunDusk = new THREE.Color('#ff8a5a');

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
  function mesh(g, geo, m, x, y, z) {
    const o = new THREE.Mesh(geo, m instanceof THREE.Material ? m : mat(m));
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
  }
  // Cutie întinsă pe hartă de la (x0,y0) la (x1,y1), de la înălțimea y în sus cu h.
  const box = (g, x0, y0, x1, y1, h, c, y = 0) => mesh(g, new THREE.BoxGeometry(x1 - x0, h, y1 - y0), c, X((x0 + x1) / 2), y + h / 2, Z((y0 + y1) / 2));
  const cyl = (g, x, y, r, h, c, y0 = 0, r2 = r) => mesh(g, new THREE.CylinderGeometry(r, r2, h, 20), c, X(x), y0 + h / 2, Z(y));
  const ball = (g, x, y, r, yc, c) => mesh(g, new THREE.SphereGeometry(r, 18, 12), c, X(x), yc, Z(y));

  function floorText(g, text, x, y, size, color, depthTest = true) {
    const c = document.createElement('canvas'), ctx = c.getContext('2d'), font = '800 64px Nunito, "Segoe UI", sans-serif';
    ctx.font = font; c.width = Math.ceil(ctx.measureText(text).width) + 16; c.height = 84;
    ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 8, 44);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.width * size / 84, size),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest }));
    m.rotation.x = -Math.PI / 2; m.position.set(X(x), 1.6, Z(y)); m.renderOrder = depthTest ? 0 : 5;
    g.add(m); return m;
  }
  function flatRing(inner, outer, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40, 1, Math.PI / 2, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; return m;
  }

  // ---------- Decorul ----------
  function buildFarm(g) {
    const grass = mesh(g, new THREE.PlaneGeometry(3000, 3000), '#4b7432', 0, -3, 0); grass.rotation.x = -Math.PI / 2;
    box(g, 0, 240, 720, 600, 3, '#5f8f3e', -3);
    const floors = { kitchen: '#c8b08a', bedroom: '#a07a58', pantry: '#8f7f68', shed: '#9a8452' };
    for (const id in floors) { const r = ROOMS[id]; box(g, r.x, r.y, r.x + r.w, r.y + r.h, 3, floors[id], -3); }
    const wallM = mat('#efe9dc'), capM = mat('#3a6db0');
    for (const w of WALLS) {
      const v = w.x1 === w.x2;
      if (v) { box(g, w.x1 - 4, w.y1, w.x1 + 4, w.y2, w.h, wallM); box(g, w.x1 - 5, w.y1, w.x1 + 5, w.y2, 3, capM, w.h); }
      else { box(g, w.x1, w.y1 - 4, w.x2, w.y1 + 4, w.h, wallM); box(g, w.x1, w.y1 - 5, w.x2, w.y1 + 5, 3, capM, w.h); }
    }
    box(g, 0, 240, 580, 262, 2, '#a07a58'); // prispa
    const post = mat('#7a5a3a');
    for (let x = 0; x <= 720; x += 40) box(g, x - 3, 594, x + 3, 600, 26, post);
    for (let y = 280; y < 600; y += 40) { box(g, 0, y - 3, 6, y + 3, 26, post); box(g, 714, y - 3, 720, y + 3, 26, post); }
    box(g, 0, 596, 720, 598, 3, post, 18); box(g, 2, 240, 4, 600, 3, post, 18); box(g, 716, 240, 718, 600, 3, post, 18);
    // Bucătăria: soba, masa, banca, dulapul, fereastra
    box(g, 10, 10, 80, 80, 50, '#d8c9a8'); box(g, 8, 8, 82, 82, 3, '#6a5444', 50);
    box(g, 95, 120, 165, 180, 4, '#8a6a4c', 24);
    [[99, 124], [161, 124], [99, 176], [161, 176]].forEach(([x, y]) => box(g, x - 3, y - 3, x + 3, y + 3, 24, '#6a5040'));
    box(g, 95, 186, 165, 198, 14, '#7a5a3a'); box(g, 200, 60, 244, 140, 62, '#7a5a3a');
    box(g, 165, 0, 235, 5, 26, mat('#9fd0f0', { emissive: '#4a7aa0', emissiveIntensity: 0.3 }), 22);
    // Camera bunicilor: patul cu cuvertură, lada de zestre, covorul, coșul cu rufe
    box(g, 300, 15, 420, 120, 16, '#6a4a3a'); box(g, 302, 17, 418, 118, 6, '#f2efe6', 16);
    box(g, 306, 20, 356, 46, 6, '#ffffff', 22); box(g, 364, 20, 414, 46, 6, '#ffffff', 22);
    box(g, 300, 54, 420, 120, 4, '#b8433b', 22);
    box(g, 430, 15, 465, 60, 28, '#8a5a3a'); box(g, 280, 140, 450, 230, 1, '#a8473f');
    cyl(g, 446, 213, 15, 14, '#c9a76a');
    // Cămara: raftul cu borcane, butoiul
    box(g, 476, 8, 576, 52, 60, '#7a5a3a');
    ['#e2a33a', '#c84b3a', '#8fb84a', '#e2a33a', '#c84b3a'].forEach((c, i) => cyl(g, 490 + i * 19, 18, 6, 12, c, 60));
    cyl(g, 522, 196, 16, 30, '#8a5a32', 0, 14);
    // Șopronul: fânul și unelte
    box(g, 596, 60, 712, 190, 30, '#d9b84a');
    box(g, 600, 205, 640, 210, 4, '#5a4a3a', 30);
    // Curtea
    cyl(g, 330, 440, 20, 24, '#9a9690'); cyl(g, 330, 440, 15, 1, '#2a4a6a', 23);
    box(g, 308, 438, 312, 442, 52, '#6a4a2a'); box(g, 348, 438, 352, 442, 52, '#6a4a2a'); box(g, 304, 428, 356, 452, 4, '#8a3a2a', 52);
    for (let i = 0; i < 4; i++) {
      box(g, 470, 322 + i * 30, 600, 340 + i * 30, 4, '#6b4a2e');
      for (let j = 0; j < 6; j++) ball(g, 482 + j * 22, 331 + i * 30, 6, 8, '#5aa040');
    }
    cyl(g, 640, 432, 36, 20, '#d9b84a'); mesh(g, new THREE.ConeGeometry(36, 46, 20), '#e0c25a', X(640), 43, Z(432));
    box(g, 650, 505, 715, 585, 34, '#a0703a'); box(g, 646, 500, 719, 590, 4, '#7a3a2a', 34);
    cyl(g, 240, 560, 10, 70, '#6a4a2a');
    const crown = new THREE.Mesh(new THREE.SphereGeometry(40, 20, 14), mat('#3f7a3a', { transparent: true, opacity: 0.8 }));
    crown.position.set(X(240), 110, Z(552)); crown.castShadow = true; g.add(crown);
    for (const h of HIDES.filter(h => h.label === 'în tufiș')) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(h.r, 16, 12), mat('#3f7a3a', { transparent: true, opacity: 0.85 }));
      b.scale.y = 0.8; b.position.set(X(h.x), h.r * 0.6, Z(h.y)); b.castShadow = true; g.add(b);
    }
    box(g, 60, 512, 120, 534, 15, '#8a6a4c'); box(g, 60, 532, 120, 536, 32, '#7a5a3a');
    cyl(g, BASKET.x, BASKET.y, 20, 12, '#b8894a', 0, 16); cyl(g, BASKET.x, BASKET.y, 17, 1, '#e8d2a0', 2);
    box(g, 428, 298, 432, 302, 52, '#6a4a2a'); box(g, 568, 298, 572, 302, 52, '#6a4a2a'); box(g, 430, 299, 570, 301, 1, '#ddd', 48);
    ['#4a8ad0', '#e05a5a', '#f2f2f2', '#e0b040'].forEach((c, i) => box(g, 446 + i * 30, 299, 466 + i * 30, 301, 22, c, 26));
    // Lumini: cerul, soarele de după-amiază (cu umbre)
    hemi = new THREE.HemisphereLight('#ffe7c2', '#3d5a2a', 0.7); scene.add(hemi);
    sun = new THREE.DirectionalLight('#ffd9a0', 0.95);
    sun.position.set(-420, 380, 260); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 460, bottom: -460, near: 10, far: 1600 });
    sun.shadow.bias = -0.0008; scene.add(sun);
  }

  function labels(g) {
    for (const id in ROOMS) { const r = ROOMS[id]; floorText(g, r.name.toUpperCase(), r.x + 14, r.y + r.h - 18, 14, 'rgba(40,30,20,.45)'); }
    floorText(g, 'COȘUL PISICILOR', BASKET.x - 34, BASKET.y + 34, 12, 'rgba(255,240,200,.95)');
    for (const h of HIDES) {
      const r = flatRing(h.r - 3, h.r, '#9be7c4'); Object.assign(r.material, { opacity: 0.75, depthTest: false }); r.renderOrder = 5;
      r.position.set(X(h.x), 2, Z(h.y)); g.add(r);
    }
  }

  // ---------- Personaje și pisici ----------
  function makePerson(e, h, hairColor, extra) {
    const r = h * (e.player ? 0.22 : 0.19), bodyH = h * 0.58, headR = h * 0.19, headY = bodyH + headR * 0.85;
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; dyn.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const mats = [];
    const M = c => { const m = mat(c, { transparent: true }); mats.push(m); return m; };
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; inner.add(o); return o; };
    add(new THREE.CylinderGeometry(r * 0.78, r, bodyH, 18), M(e.color), 0, bodyH / 2, 0);
    const head = add(new THREE.SphereGeometry(headR, 20, 14), M('#f1cdb0'), 0, headY, 0);
    const hair = add(new THREE.SphereGeometry(headR * 1.07, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M(hairColor), 0, headY, 0);
    hair.rotation.x = -0.5;
    const eyeM = M('#141833');
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(Math.max(1.1, headR * 0.13), 8, 6), eyeM, s * headR * 0.36, headY + headR * 0.08, headR * 0.92);
    const arms = [-1, 1].map(s => {
      const pivot = new THREE.Group(); pivot.position.set(s * r * 0.98, bodyH * 0.9, 0); inner.add(pivot);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.2, bodyH * 0.7, 10), M(e.color));
      arm.position.y = -bodyH * 0.35; arm.rotation.z = s * 0.12; arm.castShadow = true; pivot.add(arm);
      return pivot;
    });
    if (extra === 'hat') {
      add(new THREE.CylinderGeometry(headR * 1.3, headR * 1.3, 2, 20), M('#3b3a35'), 0, headY + headR * 0.55, 0);
      add(new THREE.CylinderGeometry(headR * 0.95, headR * 1.05, headR * 0.8, 20), M('#3b3a35'), 0, headY + headR * 0.95, 0);
      add(new THREE.BoxGeometry(headR * 0.9, headR * 0.18, headR * 0.3), M('#f2f2f2'), 0, headY - headR * 0.3, headR * 0.92);
    }
    if (extra === 'bun') add(new THREE.SphereGeometry(headR * 0.5, 14, 10), M(hairColor), 0, headY + headR * 0.6, -headR * 0.8);
    const el = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text) d.textContent = text; layer.appendChild(d); return d; };
    const a = { e, g, inner, head, headR, arms, mats, h, angle: 0, prev: { x: e.x, y: e.y }, op: 1 };
    a.tag = el('tag3d' + (e.player ? ' me' : ''), e.name[0]); a.tag.style.background = e.color; a.tag.title = e.name;
    a.mark = el('mark3d'); a.bubble = el('bubble3d');
    return a;
  }

  function makeCat(c) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; dyn.add(g);
    const m = mat(c.color), dark = mat('#1a1a1a');
    const body = mesh(g, new THREE.SphereGeometry(7, 16, 12), m, 0, 7, 0); body.scale.set(1, 0.9, 1.6);
    const head = mesh(g, new THREE.SphereGeometry(5.2, 16, 12), m, 0, 12, 10);
    for (const s of [-1, 1]) {
      const ear = mesh(g, new THREE.ConeGeometry(2.2, 4.5, 8), m, s * 2.8, 17, 10); ear.rotation.z = -s * 0.25;
      mesh(g, new THREE.SphereGeometry(0.9, 8, 6), dark, s * 2, 13, 14.6);
    }
    const tail = new THREE.Group(); tail.position.set(0, 9, -9); g.add(tail);
    const t = mesh(tail, new THREE.CylinderGeometry(1.2, 1.6, 14, 8), m, 0, 6, -2); t.rotation.x = -0.5;
    const el = document.createElement('div'); el.className = 'bubble3d cat'; layer.appendChild(el);
    const pin = document.createElement('div'); pin.className = 'pin3d'; pin.textContent = c.name; layer.appendChild(pin);
    return { c, g, tail, bubble: el, pin, angle: Math.random() * 6, prev: { x: c.x, y: c.y } };
  }

  function cone(a) {
    const geo = new THREE.CircleGeometry(a.range, 28, -a.fov * Math.PI / 180, a.fov * Math.PI / 90);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 3; dyn.add(m); return m;
  }

  function init(stageEl) {
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (err) { return null; }
    if (!renderer.getContext()) return null;
    stage = stageEl;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = skyDay.clone(); scene.fog = new THREE.Fog(skyDay.clone(), 1300, 3000);
    cam = new THREE.PerspectiveCamera(38, 4 / 3, 5, 5000);
    const farm = new THREE.Group(); scene.add(farm);
    buildFarm(farm);
    dyn = new THREE.Group(); scene.add(dyn);
    markMesh = flatRing(9, 13, '#ffc94a'); markMesh.visible = false; scene.add(markMesh);
    const c = renderer.domElement; c.className = 'gl'; stage.prepend(c);
    layer = document.createElement('div'); layer.className = 'layer'; stage.appendChild(layer);
    stage.classList.add('is3d');
    const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    new ResizeObserver(resize).observe(stage); resize();
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => labels(farm));
    return api;
  }

  function newGame(G) {
    dyn.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    dyn.clear(); layer.innerHTML = ''; snap = true;
    kidA = makePerson(G.kid, HEIGHT[G.kid.id] || 50, '#6b4428');
    kidA.pRing = flatRing(16, 19, '#ffc94a'); dyn.add(kidA.pRing);
    adultsA = G.adults.map(a => { const p = makePerson(a, 84, a.id === 'bunicul' ? '#d8d8d8' : '#5b3a24', a.id === 'bunicul' ? 'hat' : 'bun'); p.cone = cone(a); return p; });
    catsA = G.cats.map(makeCat);
    floatEls = Array.from({ length: 10 }, () => { const d = document.createElement('div'); d.className = 'float3d'; d.hidden = true; layer.appendChild(d); return d; });
  }

  // ---------- Pe fiecare cadru ----------
  const lerpAngle = (a, b, t) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;
  function project(x, y, z, w, h) { tmp.set(x, y, z).project(cam); return { off: tmp.z > 1, sx: (tmp.x + 1) / 2 * w, sy: (1 - tmp.y) / 2 * h }; }
  const place = (el, p) => { el.hidden = p.off; if (!p.off) el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px)`; };

  function syncPerson(a, dt, faceAngle) {
    const e = a.e, moved = Math.hypot(e.x - a.prev.x, e.y - a.prev.y);
    if (faceAngle != null) a.angle = lerpAngle(a.angle, faceAngle, Math.min(1, dt * 10));
    else if (moved > 0.05 && moved < 40) a.angle = lerpAngle(a.angle, Math.atan2(e.x - a.prev.x, e.y - a.prev.y), Math.min(1, dt * 10));
    a.prev = { x: e.x, y: e.y };
    a.g.position.set(X(e.x), 0, Z(e.y)); a.g.rotation.y = a.angle;
    const walking = moved > 0.05, swing = walking ? Math.sin(time * 14 + a.h) * 0.6 : 0;
    a.inner.position.y = walking ? Math.abs(Math.sin(time * 14 + a.h)) * 2.2 : 0;
    a.arms[0].rotation.x = swing; a.arms[1].rotation.x = -swing;
  }

  function overlay(a, w, h) {
    a.head.getWorldPosition(tmp);
    const p = project(tmp.x, tmp.y + a.headR + 6, tmp.z, w, h);
    place(a.tag, p);
    const talk = a.e.sayT > 0 && a.e.say;
    a.bubble.hidden = p.off || !talk;
    if (talk && !p.off) { if (a.bubble.textContent !== a.e.say) a.bubble.textContent = a.e.say; a.bubble.style.transform = a.tag.style.transform; }
    return p;
  }

  function render(G, dt) {
    time += dt;
    const w = stage.clientWidth, h = stage.clientHeight, k = G.kid;
    // Lumina coboară spre seară.
    const p = G.progress;
    scene.background.copy(skyDay).lerp(skyDusk, p * 0.8); scene.fog.color.copy(scene.background);
    sun.color.copy(sunDay).lerp(sunDusk, p); sun.intensity = 0.95 - 0.45 * p; hemi.intensity = 0.7 - 0.25 * p;
    sun.position.set(-420, 380 - 220 * p, 260);
    // Copilul
    syncPerson(kidA, dt);
    const op = k.fx.invis > 0 || k.hidden ? 0.4 : 1;
    if (kidA.op !== op) { kidA.mats.forEach(m => { m.opacity = op; }); kidA.op = op; }
    if (k.carrying.length) { kidA.arms[0].rotation.x = kidA.arms[1].rotation.x = -1.2; }
    kidA.pRing.position.set(X(k.x), 1.8, Z(k.y));
    // Adulții și conurile lor
    adultsA.forEach(a => {
      const e = a.e;
      syncPerson(a, dt, Math.PI / 2 - e.facing); // facing e pe hartă (cos, sin); figura privește spre +Z local
      const blind = e.fx.daze > 0 || e.state === 'nap';
      a.cone.visible = !blind;
      a.cone.position.set(X(e.x), 1.2 + (e.id === 'irina' ? 0.1 : 0), Z(e.y));
      a.cone.rotation.set(-Math.PI / 2, 0, -e.facing);
      const hot = e.state === 'chase' ? 1 : e.alert;
      a.cone.material.color.setRGB(1, 0.96 - 0.6 * hot, 0.85 - 0.65 * hot);
      a.cone.material.opacity = 0.24 + 0.16 * hot;
      if (e.state === 'nap') a.inner.rotation.x = 0.25; else a.inner.rotation.x = 0;
    });
    // Pisicile
    let carriedIdx = 0;
    catsA.forEach(ca => {
      const c = ca.c, moved = Math.hypot(c.x - ca.prev.x, c.y - ca.prev.y);
      if (moved > 0.05 && moved < 40) ca.angle = lerpAngle(ca.angle, Math.atan2(c.x - ca.prev.x, c.y - ca.prev.y), Math.min(1, dt * 10));
      ca.prev = { x: c.x, y: c.y };
      let y = 0;
      if (c.state === 'carried') { y = kidA.h * 0.42 + carriedIdx++ * 14; }
      else if (c.state === 'basket') y = 6;
      else if (c.state === 'rest') y = heightAt(c.x, c.y);
      ca.g.position.set(X(c.x), y + (moved > 0.05 ? Math.abs(Math.sin(time * 16)) * 1.5 : 0), Z(c.y));
      ca.g.rotation.y = c.state === 'carried' ? kidA.angle + Math.PI / 2 : ca.angle;
      // Pisicile sunt exagerat de mari, ca să se vadă bine de sus și pe telefon.
      ca.g.scale.set(1.7, c.state === 'rest' || c.state === 'basket' ? 1.4 : 1.7, 1.7);
      ca.tail.rotation.z = Math.sin(time * (c.state === 'flee' ? 14 : 3) + c.x) * 0.5;
    });
    if (G.mark && G.mark.t > 0) {
      markMesh.visible = true; markMesh.position.set(X(G.mark.x), 1.8, Z(G.mark.y));
      markMesh.material.opacity = G.mark.t; markMesh.scale.setScalar(1 + (1 - G.mark.t) * 0.8);
    } else markMesh.visible = false;
    updateCamera(G, dt);
    renderer.render(scene, cam);
    // Etichete HTML peste scenă
    overlay(kidA, w, h);
    adultsA.forEach(a => {
      const pa = overlay(a, w, h), e = a.e;
      const sign = e.state === 'chase' ? '!' : e.state === 'nap' ? 'Zzz' : e.state === 'search' || e.alert > 0.2 ? '?' : '';
      a.mark.hidden = pa.off || !sign;
      if (sign) { if (a.mark.textContent !== sign) a.mark.textContent = sign; a.mark.className = 'mark3d' + (sign === '!' ? ' hot' : ''); a.mark.style.transform = a.tag.style.transform; }
    });
    catsA.forEach(ca => {
      const c = ca.c, talk = c.sayT > 0 && c.say && c.state !== 'basket';
      const pc = project(ca.g.position.x, ca.g.position.y + 22, ca.g.position.z, w, h);
      ca.bubble.hidden = pc.off || !talk;
      if (talk && !pc.off) { if (ca.bubble.textContent !== c.say) ca.bubble.textContent = c.say; ca.bubble.style.transform = `translate(${pc.sx.toFixed(1)}px, ${pc.sy.toFixed(1)}px)`; }
      const showPin = k.fx.reveal > 0 && !['carried', 'basket'].includes(c.state);
      ca.pin.hidden = pc.off || !showPin;
      if (showPin && !pc.off) ca.pin.style.transform = `translate(${pc.sx.toFixed(1)}px, ${pc.sy.toFixed(1)}px)`;
    });
    floatEls.forEach((d, i) => {
      const f = G.floats[i];
      if (!f) { d.hidden = true; return; }
      const pf = project(X(f.x), 70 + f.lift + (1.4 - f.t) * 45, Z(f.y), w, h);
      d.hidden = pf.off;
      if (d.textContent !== f.text) d.textContent = f.text;
      d.style.color = f.color; d.style.opacity = Math.min(1, f.t);
      d.style.transform = `translate(${pf.sx.toFixed(1)}px, ${pf.sy.toFixed(1)}px)`;
    });
  }

  function updateCamera(G, dt) {
    const v = VIEWS[viewIdx], el = v.el * Math.PI / 180, t = Math.tan(cam.fov * Math.PI / 360);
    let tx = 0, tz = 14, d;
    if (v.id === 'near') { tx = X(G.kid.x); tz = Z(G.kid.y); d = 470; }
    else { const halfV = (640 * Math.sin(el) + 70 * Math.cos(el)) / 2 * 1.14, halfH = 385 * 1.06; d = Math.max(halfV / t, halfH / (t * cam.aspect)); }
    const want = tmp.set(tx, Math.sin(el) * d, tz + Math.cos(el) * d);
    const kk = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(want, kk); camLook.lerp(want.set(tx, 0, tz), kk); snap = false;
    cam.position.copy(camPos);
    if (G.shake > 0) cam.position.add(tmp.set((Math.random() - 0.5) * G.shake * 16, (Math.random() - 0.5) * G.shake * 12, 0));
    cam.lookAt(camLook);
  }

  function pick(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floor, p)) return null;
    return { x: Math.max(14, Math.min(W - 14, p.x + W / 2)), y: Math.max(14, Math.min(H - 14, p.z + H / 2)) };
  }

  function cycleView() { viewIdx = (viewIdx + 1) % VIEWS.length; return VIEWS[viewIdx].label; }

  const api = { init, newGame, render, pick, cycleView, get canvas() { return renderer.domElement; } };
  return api;
})();
