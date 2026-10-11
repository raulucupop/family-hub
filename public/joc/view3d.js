// Randarea 3D a jocului: personaje, paturi, camera, bule de text (HTML) și atingeri.
// Logica rămâne în sim.js; aici doar se desenează starea G.
const View3D = !window.THREE ? null : (() => {
  const { X, Z, mat, floorText } = House3D;
  // Înălțimi exagerate față de casă, ca personajele să se vadă bine și pe telefon.
  const HEIGHT = { aida: 69, luiza: 66, andrei: 60, amelia: 54, mara: 42, matei: 34, maria: 27 };
  const HAIR = ['#6b4428', '#8a5a32', '#4a3226', '#a0673a', '#5b3a24', '#c08a4a', '#3a2820'];
  const VIEWS = [
    { id: 'house', label: 'Toată casa', el: 55 },
    { id: 'near', label: 'Aproape', el: 64 },
    { id: 'top', label: 'De sus', el: 86 },
  ];
  let renderer, scene, cam, house, stage, layer, dyn, markMesh;
  let actors = [], proxies = [], messPool = [], floatEls = [], viewIdx = 0, time = 0, snap = true;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function part(g, w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : mat(color));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  }
  function flatRing(inner, outer, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40, 1, Math.PI / 2, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function sky() {
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 2200;
      pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe4ff', size: 2, sizeAttenuation: false, fog: false })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff1cf', fog: false }));
    moon.position.set(-800, 900, -1700);
    scene.add(moon);
  }

  function init(stageEl) {
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (err) { return null; }
    if (!renderer.getContext()) return null;
    stage = stageEl;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#131833');
    scene.fog = new THREE.Fog('#131833', 1600, 3200);
    cam = new THREE.PerspectiveCamera(38, 4 / 3, 5, 5000);
    house = House3D.build(scene);
    sky();
    dyn = new THREE.Group(); scene.add(dyn);
    markMesh = flatRing(9, 13, '#ffcf6e'); markMesh.visible = false; scene.add(markMesh);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Group();
      ['#ff8a7a', '#8fe3c5', '#ffcf6e'].forEach((c, j) => part(m, 8, 7, 8, c, Math.cos(j * 2.1) * 9, 0, Math.sin(j * 2.1) * 7));
      m.visible = false; scene.add(m); messPool.push(m);
    }
    const c = renderer.domElement;
    c.className = 'gl';
    stage.prepend(c);
    layer = document.createElement('div'); layer.className = 'layer';
    stage.appendChild(layer);
    stage.classList.add('is3d');
    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(stage); resize();
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => House3D.labels(house));
    return api;
  }

  // ---------- Paturi și personaje ----------
  function makeBed(k) {
    const crib = !!k.crib, w = crib ? 54 : 68, d = 36, fh = crib ? 14 : 10;
    const g = new THREE.Group(); g.position.set(X(k.bed.x), 0, Z(k.bed.y)); dyn.add(g);
    part(g, w, fh, d, '#2b315f', 0, 0, 0);
    part(g, w - 4, 5, d - 4, '#dfe2f7', 0, fh, 0);
    part(g, 14, 5, d - 10, '#ffffff', -w / 2 + 11, fh + 5, 0);
    const blanket = part(g, w - 24, 3, d - 2, mat('#59639f'), -w / 2 + 20 + (w - 24) / 2, fh + 5, 0);
    if (crib) {
      for (let i = 0; i <= 7; i++) for (const s of [-1, 1]) part(g, 2, 20, 2, '#d5daf5', -w / 2 + 2 + i * (w - 4) / 7, fh, s * (d / 2 - 1));
      for (const s of [-1, 1]) part(g, 2, 20, d, '#d5daf5', s * (w / 2 - 1), fh, 0);
    } else part(g, 4, 26, d, '#2b315f', -w / 2 - 2, 0, 0);
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(w + 18, d + 18),
      new THREE.MeshBasicMaterial({ color: '#ffcf6e', transparent: true, opacity: 0.5, depthWrite: false }));
    highlight.rotation.x = -Math.PI / 2; highlight.position.y = 1.5; highlight.visible = false; g.add(highlight);
    floorText(dyn, k.name, k.bed.x, k.bed.y + d / 2 + 12, 13, 'rgba(238,240,255,.85)', 'center');
    k.bedView = { g, blanket, top: fh + 5, w, highlight };
  }

  function makeActor(e, i) {
    const kid = e.role === 'kid';
    const h = kid ? (HEIGHT[e.id] || (e.baby ? 32 : 56)) : 84;
    const bodyH = h * (e.baby ? 0.5 : 0.58), r = h * (kid ? 0.22 : 0.19), headR = h * (e.baby ? 0.27 : 0.19);
    const headY = bodyH + headR * 0.85;
    const mats = [];
    const M = c => { const m = mat(c, { transparent: true }); mats.push(m); return m; };
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; dyn.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; inner.add(o); return o; };
    add(new THREE.CylinderGeometry(r * 0.78, r, bodyH, 18), M(e.color), 0, bodyH / 2, 0);
    const head = add(new THREE.SphereGeometry(headR, 20, 14), M('#f1cdb0'), 0, headY, 0);
    const hair = add(new THREE.SphereGeometry(headR * 1.07, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M(HAIR[i % HAIR.length]), 0, headY, 0);
    hair.rotation.x = -0.5;
    // Brațe care se balansează la mers.
    const arms = [-1, 1].map(s => {
      const pivot = new THREE.Group(); pivot.position.set(s * r * 0.98, bodyH * 0.9, 0); inner.add(pivot);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.2, bodyH * 0.7, 10), M(e.color));
      arm.position.y = -bodyH * 0.35; arm.rotation.z = s * 0.12; arm.castShadow = true; pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 10, 8), M('#f1cdb0'));
      hand.position.y = -bodyH * 0.72; pivot.add(hand);
      return pivot;
    });
    const eyeM = M('#141833');
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(Math.max(1.1, headR * 0.13), 8, 6), eyeM, s * headR * 0.36, headY + headR * 0.08, headR * 0.92);
    const a = { e, g, inner, head, arms, mats, h, r, headR, headY, angle: Math.random() * 6, prev: { x: e.x, y: e.y } };
    if (kid) {
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(18, r * 1.6), Math.max(18, r * 1.6), h + 12, 8), new THREE.MeshBasicMaterial());
      proxy.position.y = h / 2; proxy.visible = false; proxy.userData.ent = e;
      g.add(proxy); proxies.push(proxy);
      a.ring = flatRing(r + 4, r + 8, '#ffcf6e'); dyn.add(a.ring);
    } else {
      a.stars = new THREE.Group(); a.stars.position.y = h + 10; g.add(a.stars);
      for (let j = 0; j < 3; j++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(3.2), new THREE.MeshBasicMaterial({ color: '#ffcf6e' }));
        s.position.set(Math.cos(j * 2.1) * 15, 0, Math.sin(j * 2.1) * 15); a.stars.add(s);
      }
    }
    if (e.player) {
      a.pRing = flatRing(r + 10, r + 13, '#ffcf6e'); dyn.add(a.pRing);
      a.cone = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 14), new THREE.MeshBasicMaterial({ color: '#ffcf6e' }));
      a.cone.rotation.x = Math.PI; dyn.add(a.cone);
    }
    const el = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text) d.textContent = text; layer.appendChild(d); return d; };
    a.tag = el('tag3d' + (e.player ? ' me' : ''), e.name[0]);
    a.tag.style.background = e.color;
    a.tag.title = e.name;
    a.zzz = el('zzz3d', 'z z z');
    a.bubble = el('bubble3d');
    return a;
  }

  function newGame(G) {
    dyn.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
    dyn.clear();
    layer.innerHTML = '';
    actors = []; proxies = []; snap = true;
    G.kids.forEach(makeBed);
    G.all.forEach((e, i) => actors.push(makeActor(e, i)));
    floatEls = Array.from({ length: 12 }, () => { const d = document.createElement('div'); d.className = 'float3d'; d.hidden = true; layer.appendChild(d); return d; });
    // Ascunzătorile se văd doar când joci cu un copil (și prin mobilă).
    if (G.mode === 'kid') HIDES.forEach(h => {
      const r = flatRing(15, 18, '#8fe3c5');
      Object.assign(r.material, { opacity: 0.7, depthTest: false }); r.renderOrder = 5;
      r.position.set(X(h.x), 2, Z(h.y)); dyn.add(r);
      const t = floorText(dyn, 'ascunzătoare', h.x, h.y + 26, 11, 'rgba(143,227,197,.9)', 'center');
      t.material.depthTest = false; t.renderOrder = 5;
    });
  }

  // ---------- Sincronizare pe cadru ----------
  const lerpAngle = (a, b, t) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;

  function syncActor(a, G, dt) {
    const e = a.e, kid = e.role === 'kid';
    const moved = Math.hypot(e.x - a.prev.x, e.y - a.prev.y);
    if (moved > 0.05 && moved < 40) a.angle = lerpAngle(a.angle, Math.atan2(e.x - a.prev.x, e.y - a.prev.y), Math.min(1, dt * 10));
    a.prev = { x: e.x, y: e.y };
    let x = e.x, y = e.y, lift = 0, rotY = a.angle, lying = false;
    if (kid && (e.mode === 'bed' || e.mode === 'asleep')) {
      const bv = e.bedView;
      x = e.bed.x - bv.w / 2 + 11 + a.headY; y = e.bed.y; lift = bv.top + a.r * 0.85; rotY = 0; lying = true;
    } else if (kid && e.mode === 'carried') {
      const pa = actors.find(q => q.e.carrying === e);
      if (pa) {
        const ang = pa.angle, fx = Math.sin(ang), fz = Math.cos(ang);
        x = pa.e.x + fx * 12 + Math.cos(ang) * a.headY / 2; y = pa.e.y + fz * 12 - Math.sin(ang) * a.headY / 2;
        lift = pa.h * 0.42; rotY = ang; lying = true;
      }
    } else if (kid && e.mode === 'floor') { lift = a.r * 0.85; lying = true; }
    a.g.position.set(X(x), lift, Z(y));
    a.g.rotation.set(0, rotY, lying ? Math.PI / 2 : 0);
    const walking = !lying && moved > 0.05;
    a.inner.position.y = walking ? Math.abs(Math.sin(time * 14 + a.headY)) * 2.4 : 0;
    const swing = walking ? Math.sin(time * 14 + a.headY) * 0.6 : 0;
    a.arms[0].rotation.x = swing; a.arms[1].rotation.x = -swing;
    if (e.hop > 0) { a.inner.position.y += Math.sin((1 - e.hop / 0.6) * Math.PI) * 24; a.arms[0].rotation.x = a.arms[1].rotation.x = Math.PI * 0.9; }
    a.g.scale.y = e.hidden ? 0.45 : 1;
    if (e.carrying) { a.arms[0].rotation.x = a.arms[1].rotation.x = -1.2; }
    const op = e.fx.invis > 0 ? (e.player ? 0.35 : 0.12) : 1;
    if (a.op !== op) { a.mats.forEach(m => { m.opacity = op; }); a.op = op; }
    if (a.stars) { a.stars.visible = e.fx.daze > 0; a.stars.rotation.y = time * 4; }
    if (a.ring) {
      const show = e.mode !== 'asleep' && e.mode !== 'carried' && e.mode !== 'floor';
      a.ring.visible = show;
      if (show) {
        a.head.getWorldPosition(tmp);
        if (lying) a.ring.position.set(tmp.x, lift + a.r + 1, tmp.z); else a.ring.position.set(X(x), 1.4, Z(y));
        a.ring.geometry.setDrawRange(0, 6 * Math.round(40 * e.awake / 100));
        a.ring.material.color.set(e.awake > 60 ? '#ff8a7a' : '#ffcf6e');
      }
    }
    if (a.pRing) {
      a.pRing.position.set(X(e.x), 1.6, Z(e.y));
      a.pRing.visible = !lying;
      a.head.getWorldPosition(tmp);
      a.cone.position.set(tmp.x, tmp.y + a.headR + 30 + Math.sin(time * 4) * 3, tmp.z);
    }
  }

  function placeOverlay(a, w, h) {
    const e = a.e;
    a.head.getWorldPosition(tmp);
    tmp.y += a.headR + 6;
    tmp.project(cam);
    const off = tmp.z > 1;
    const sx = (tmp.x + 1) / 2 * w, sy = (1 - tmp.y) / 2 * h;
    const pos = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    a.tag.style.transform = pos; a.tag.hidden = off;
    const asleep = e.mode === 'asleep' || e.mode === 'floor';
    a.zzz.hidden = off || !asleep; if (asleep) a.zzz.style.transform = pos;
    const talk = e.sayT > 0 && e.say && !off;
    a.bubble.hidden = !talk;
    if (talk) {
      if (a.bubble.textContent !== e.say) a.bubble.textContent = e.say;
      a.bubble.style.transform = pos;
      a.bubble.style.opacity = Math.min(1, e.sayT * 2);
    }
  }

  function updateCamera(G, dt) {
    const v = VIEWS[viewIdx], el = v.el * Math.PI / 180, t = Math.tan(cam.fov * Math.PI / 360);
    let tx = 0, tz = 14, d;
    if (v.id === 'near' && G.player) { tx = X(G.player.x); tz = Z(G.player.y); d = 470; }
    else {
      const halfV = (640 * Math.sin(el) + 70 * Math.cos(el)) / 2 * 1.14, halfH = 385 * 1.06;
      d = Math.max(halfV / t, halfH / (t * cam.aspect));
    }
    const want = tmp.set(tx, Math.sin(el) * d, tz + Math.cos(el) * d);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(want, k);
    camLook.lerp(want.set(tx, 0, tz), k);
    snap = false;
    cam.position.copy(camPos);
    if (G.shake > 0) cam.position.add(tmp.set((Math.random() - 0.5) * G.shake * 16, (Math.random() - 0.5) * G.shake * 12, 0));
    cam.lookAt(camLook);
  }

  function render(G, dt) {
    time += dt;
    for (const a of actors) syncActor(a, G, dt);
    for (const k of G.kids) {
      const bv = k.bedView, used = k.mode === 'bed' || k.mode === 'asleep';
      const a = actors.find(q => q.e === k);
      const hgt = used ? a.r * 2 + 3 : 3;
      bv.blanket.scale.y = hgt / 3; bv.blanket.position.y = bv.top + hgt / 2;
      bv.blanket.material.color.set(used ? k.color : '#59639f');
      bv.highlight.visible = G.player.carrying === k;
      if (bv.highlight.visible) bv.highlight.material.opacity = 0.35 + Math.sin(time * 6) * 0.2;
      bv.g.rotation.x = G.fx.cradle > 0 ? Math.sin(time * 5 + k.bed.x) * 0.05 : 0;
    }
    house.lockBars.forEach(m => { m.visible = G.fx.lock > 0; });
    const screens = G.fx.screens <= 0;
    house.tvScreen.material.emissiveIntensity = screens ? 0.75 + Math.sin(time * 9) * 0.15 : 0;
    house.tvLight.intensity = screens ? 1 + Math.sin(time * 7) * 0.15 : 0;
    for (const s of SPOTS) { const l = house.spotLabels[s.id]; if (l) l.material.opacity = spotActive(s) ? 1 : 0.2; }
    house.drawers.forEach(m => m.material.color.set(G.fx.lock > 0 ? '#ffcf6e' : '#9a7d5e'));
    const dim = 1 - 0.55 * G.progress;
    for (const id in house.lamps) house.lamps[id].intensity = 1.2 * dim;
    messPool.forEach((m, i) => {
      const ms = G.mess[i]; m.visible = !!ms;
      if (ms) { m.position.set(X(ms.x), 0, Z(ms.y)); m.rotation.y = ms.seed; }
    });
    if (G.mark && G.mark.t > 0) {
      markMesh.visible = true; markMesh.position.set(X(G.mark.x), 1.8, Z(G.mark.y));
      markMesh.material.opacity = G.mark.t; markMesh.scale.setScalar(1 + (1 - G.mark.t) * 0.8);
    } else markMesh.visible = false;
    updateCamera(G, dt);
    renderer.render(scene, cam);
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const a of actors) placeOverlay(a, w, h);
    floatEls.forEach((d, i) => {
      const f = G.floats[i];
      if (!f) { d.hidden = true; return; }
      tmp.set(X(f.x), 70 + f.lift + (1.4 - f.t) * 45, Z(f.y)).project(cam);
      d.hidden = tmp.z > 1;
      if (d.textContent !== f.text) d.textContent = f.text;
      d.style.color = f.color; d.style.opacity = Math.min(1, f.t);
      d.style.transform = `translate(${((tmp.x + 1) / 2 * w).toFixed(1)}px, ${((1 - tmp.y) / 2 * h).toFixed(1)}px)`;
    });
  }

  // Atingere pe ecran → punct pe hartă (sau copilul atins).
  function pick(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    if (hit) return { x: hit.object.userData.ent.x, y: hit.object.userData.ent.y };
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floor, p)) return null;
    return { x: Math.max(14, Math.min(W - 14, p.x + W / 2)), y: Math.max(14, Math.min(H - 14, p.z + H / 2)) };
  }

  function cycleView() { viewIdx = (viewIdx + 1) % VIEWS.length; return VIEWS[viewIdx].label; }

  const api = { init, newGame, render, pick, cycleView, get canvas() { return renderer.domElement; }, get viewLabel() { return VIEWS[viewIdx].label; } };
  return api;
})();
