// Casa în 3D: podele, pereți cu uși, mobilă, lumini.
// Coordonatele hărții (x, y) devin (X = x - W/2, Z = y - H/2), cu înălțimea pe axa Y.
const House3D = (() => {
  const X = x => x - W / 2, Z = y => y - H / 2;
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });

  // Cutie întinsă pe hartă de la (x0,y0) la (x1,y1), de la înălțimea y în sus cu h.
  function box(group, x0, y0, x1, y1, h, color, y = 0, opts) {
    const material = color instanceof THREE.Material ? color : mat(color, opts);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, y1 - y0), material);
    m.position.set(X((x0 + x1) / 2), y + h / 2, Z((y0 + y1) / 2));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  }

  // Text întins pe podea (numele camerelor, etichetele locurilor).
  function floorText(group, text, x, y, size, color, align = 'left') {
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    const font = '800 64px Nunito, "Segoe UI", sans-serif';
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(text).width) + 16; c.height = 84;
    ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 8, 44);
    const tex = new THREE.CanvasTexture(c);
    const w = c.width * size / 84;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(X(align === 'left' ? x + w / 2 : x), 1.6, Z(y));
    group.add(m);
    return m;
  }

  function walls(group) {
    const wallMat = mat('#474d8a'), capMat = mat('#7d86c9');
    const T = 8;
    // [x1, y1, x2, y2, înălțime]. Peretele din față e scund, ca la o casă de păpuși.
    const segs = [
      [0, 0, 720, 0, 64], [0, 0, 0, 600, 50], [720, 0, 720, 600, 50], [0, 600, 720, 600, 10],
      [300, 0, 300, 270, 42], [540, 0, 540, 270, 42], [0, 270, 720, 270, 42], [430, 270, 430, 600, 42],
    ];
    for (const [x1, y1, x2, y2, h] of segs) {
      const vertical = x1 === x2;
      const cuts = DOORS
        .filter(d => vertical ? d.v && d.x === x1 && d.y > y1 && d.y < y2 : !d.v && d.y === y1 && d.x > x1 && d.x < x2)
        .map(d => vertical ? [d.y - 26, d.y + 26] : [d.x - 26, d.x + 26])
        .sort((a, b) => a[0] - b[0]);
      let start = vertical ? y1 : x1;
      const pieces = [];
      for (const [a, b] of cuts) { pieces.push([start, a]); start = b; }
      pieces.push([start, vertical ? y2 : x2]);
      for (const [a, b] of pieces) {
        if (b - a < 1) continue;
        if (vertical) { box(group, x1 - T / 2, a, x1 + T / 2, b, h, wallMat); box(group, x1 - T / 2 - 1, a, x1 + T / 2 + 1, b, 2, capMat, h); }
        else { box(group, a, y1 - T / 2, b, y1 + T / 2, h, wallMat); box(group, a, y1 - T / 2 - 1, b, y1 + T / 2 + 1, 2, capMat, h); }
      }
    }
    // Barierele care apar pe ușile camerei copiilor când sunt blocate.
    const lockMat = new THREE.MeshStandardMaterial({ color: '#ffcf6e', emissive: '#ffb627', emissiveIntensity: 0.9, transparent: true, opacity: 0.75 });
    return DOORS.filter(d => d.a === 'kids' || d.b === 'kids').map(d => {
      const m = d.v ? box(group, d.x - 3, d.y - 26, d.x + 3, d.y + 26, 34, lockMat) : box(group, d.x - 26, d.y - 3, d.x + 26, d.y + 3, 34, lockMat);
      m.visible = false;
      return m;
    });
  }

  function furniture(g) {
    const r = {};
    // Sufragerie: covor, TV, canapea
    box(g, 70, 330, 330, 550, 1, '#4a3f78');
    box(g, 6, 398, 30, 502, 18, '#5a4636');
    r.tvScreen = box(g, 14, 412, 20, 488, 42, mat('#0b0f24', { emissive: '#7cc6ff', emissiveIntensity: 0.9 }), 18);
    box(g, 200, 548, 400, 588, 16, '#5c4f92');
    box(g, 200, 574, 400, 590, 36, '#4b3f7a');
    box(g, 196, 548, 212, 590, 26, '#4b3f7a'); box(g, 388, 548, 404, 590, 26, '#4b3f7a');
    // Bucătărie: blat, frigider, masă, sertare
    box(g, 438, 278, 640, 312, 34, '#6b6f9a'); box(g, 436, 276, 642, 314, 3, '#c9cde6', 34);
    box(g, 650, 278, 712, 334, 76, '#d8deef');
    box(g, 520, 450, 610, 520, 3, '#8a6a4c', 26); box(g, 560, 480, 570, 490, 26, '#5a4636');
    [[530, 432], [600, 432], [530, 538], [600, 538]].forEach(([x, y]) => box(g, x - 9, y - 9, x + 9, y + 9, 14, '#6b5240'));
    box(g, 690, 366, 714, 474, 42, '#6a5440');
    r.drawers = [0, 1, 2, 3].map(i => box(g, 686, 372 + i * 25, 690, 393 + i * 25, 30, mat('#9a7d5e'), 6));
    // Baie: cadă cu apă, chiuvetă, covoraș
    box(g, 588, 14, 710, 82, 24, '#e3e9f7');
    box(g, 596, 22, 702, 74, 1, mat('#7fc0f0', { emissive: '#3d7fb8', emissiveIntensity: 0.3 }), 22);
    box(g, 556, 128, 592, 162, 32, '#e3e9f7');
    box(g, 620, 96, 690, 132, 1, '#7d8fd0');
    // Dormitorul părinților: patul mare
    box(g, 354, 16, 486, 130, 14, '#3f3775');
    box(g, 354, 14, 486, 22, 44, '#3f3775');
    box(g, 358, 22, 482, 128, 6, '#e5e2fb', 14);
    box(g, 362, 26, 414, 52, 6, '#ffffff', 20); box(g, 426, 26, 478, 52, 6, '#ffffff', 20);
    box(g, 356, 62, 484, 128, 5, '#7064c4', 20);
    box(g, 494, 20, 530, 50, 22, '#5a4636');
    // Camera copiilor: cutia cu jucării, covor rotund
    box(g, 208, 226, 272, 258, 18, '#a66b45');
    ['#ff8a7a', '#8fe3c5', '#ffcf6e'].forEach((c, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), mat(c));
      s.position.set(X(222 + i * 18), 23, Z(236)); s.castShadow = true; g.add(s);
    });
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 1, 40), mat('#5361a8'));
    rug.position.set(X(130), 0.5, Z(205)); rug.receiveShadow = true; g.add(rug);
    return r;
  }

  function build(scene) {
    const g = new THREE.Group();
    scene.add(g);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat('#0d1230'));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -3; ground.receiveShadow = true;
    g.add(ground);
    const floors = { kids: '#3d4790', parents: '#4a4088', bath: '#33629a', living: '#3e4d82', kitchen: '#4d5079' };
    for (const id in ROOMS) {
      const rm = ROOMS[id];
      box(g, rm.x, rm.y, rm.x + rm.w, rm.y + rm.h, 3, floors[id], -3);
    }
    const lockBars = walls(g);
    const f = furniture(g);
    // Lumini: cerul nopții, luna (cu umbre) și câte o lampă pe cameră.
    scene.add(new THREE.HemisphereLight('#8e9cf0', '#1d1838', 0.45));
    const moon = new THREE.DirectionalLight('#c3cdff', 0.45);
    moon.position.set(-260, 520, -320);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -460, right: 460, top: 460, bottom: -460, near: 10, far: 1500 });
    moon.shadow.bias = -0.0008;
    scene.add(moon);
    const lamps = {};
    for (const id in ROOMS) {
      const rm = ROOMS[id];
      const l = new THREE.PointLight(id === 'kids' ? '#ffb877' : '#ffcf8a', 1.2, 400, 1.2);
      l.position.set(X(rm.x + rm.w / 2), 140, Z(rm.y + rm.h / 2));
      scene.add(l); lamps[id] = l;
    }
    const tvLight = new THREE.PointLight('#6fb8ff', 1.1, 260, 1.5);
    tvLight.position.set(X(60), 40, Z(450));
    scene.add(tvLight);
    return { group: g, lockBars, lamps, tvLight, ...f, spotLabels: {} };
  }

  // Etichetele se desenează după ce s-a încărcat fontul.
  function labels(h) {
    for (const id in ROOMS) {
      const rm = ROOMS[id];
      floorText(h.group, rm.name.toUpperCase(), rm.x + 14, rm.y + rm.h - 18, 15, 'rgba(238,240,255,.42)');
    }
    for (const s of SPOTS) h.spotLabels[s.id] = floorText(h.group, s.label, s.x, s.y + (['toys', 'sofa'].includes(s.id) ? -30 : 30), 14, 'rgba(255,207,110,.9)', 'center');
  }

  return { build, labels, box, floorText, mat, X, Z };
})();
