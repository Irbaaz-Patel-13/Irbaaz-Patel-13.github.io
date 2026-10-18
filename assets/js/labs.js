// Two interactive project panels, both driven by real project outputs:
//  1. The humanoid replayed at ten saved training checkpoints (motion recorded from the actual policies in MuJoCo).
//  2. The drone pickup route from the capstone planner, animated over the aerial frames it was planned on.
import * as THREE from 'three';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const whenNear = (el, fn) => {
  if (!el) return;
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: '400px' });
  io.observe(el);
};
const watchVisible = (el, cb) => new IntersectionObserver((es) => cb(es[0].isIntersecting), { threshold: 0.05 }).observe(el);

/* ======================= 1. humanoid through training ======================= */
whenNear(document.getElementById('walker'), () => walker().catch((e) => console.warn('walker unavailable', e)));

async function walker() {
  const root = document.getElementById('walker');
  const view = root.querySelector('.lab-view');
  const stepEl = document.getElementById('walker-step'), outEl = document.getElementById('walker-out');
  const bars = document.getElementById('walker-ckpts');
  const [meta, buf] = await Promise.all([
    fetch('assets/humanoid/motion.json').then((r) => r.json()),
    fetch('assets/humanoid/motion.bin').then((r) => r.arrayBuffer()),
  ]);
  const G = meta.geoms.length;
  const cks = meta.checkpoints.map((c) => ({ ...c, data: new Int16Array(buf, c.offset, c.frames * G * 7) }));
  const label = (s) => (s >= 1e6 ? (s / 1e6).toString().replace(/\.0$/, '') + 'M' : s / 1e3 + 'K');
  const maxR = Math.max(...cks.map((c) => c.reward));

  // checkpoint bars: height = reward in this replay; red = it fell
  cks.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = c.fell ? 'fell' : '';
    b.setAttribute('aria-label', `${label(c.steps)} steps: ${c.fell ? 'fell after ' + c.survived + ' steps' : 'walked the full episode'}`);
    b.innerHTML = `<i style="height:${Math.max(6, (c.reward / maxR) * 100)}%"></i><span>${label(c.steps)}</span>`;
    b.addEventListener('click', () => { userTouched = true; select(i); });
    bars.appendChild(b);
  });
  // drag across the bars to scrub through training
  let dragging = false;
  const pick = (x) => { const r = bars.getBoundingClientRect(); return Math.max(0, Math.min(cks.length - 1, Math.floor(((x - r.left) / r.width) * cks.length))); };
  bars.addEventListener('pointerdown', (e) => { dragging = true; userTouched = true; bars.setPointerCapture(e.pointerId); select(pick(e.clientX)); });
  bars.addEventListener('pointermove', (e) => { if (dragging) select(pick(e.clientX)); });
  bars.addEventListener('pointerup', () => { dragging = false; });
  bars.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); userTouched = true; select(Math.max(0, Math.min(cks.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))); bars.children[cur].focus(); }
  });

  // ---- scene ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  view.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x0e1a1d); scene.background = bg; scene.fog = new THREE.Fog(bg, 4, 13);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 40);
  scene.add(new THREE.HemisphereLight(0xe6f4f5, 0x0b1517, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fd6df, 1.4); rim.position.set(-4, 3, -3); scene.add(rim);
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);

  const grid = new THREE.GridHelper(80, 160, 0x24434a, 0x15292d); grid.rotation.x = Math.PI / 2; world.add(grid);
  // distance ticks every metre so progress is readable
  const tickMat = new THREE.LineBasicMaterial({ color: 0x2f5a62 });
  for (let x = 0; x <= 20; x++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -0.6, 0.002), new THREE.Vector3(x, 0.6, 0.002)]);
    world.add(new THREE.Line(g, tickMat));
  }

  const body = new THREE.MeshStandardMaterial({ color: 0xe8eeee, roughness: 0.45, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4fd6df, roughness: 0.4, emissive: 0x0f3a3f });
  const meshes = meta.geoms.map((g) => {
    let geo;
    if (g.type === 2) geo = new THREE.SphereGeometry(g.size[0], 24, 16);
    else { geo = new THREE.CapsuleGeometry(g.size[0], g.size[1] * 2, 6, 16); geo.rotateX(Math.PI / 2); }   // MuJoCo capsules run along local z
    const m = new THREE.Mesh(geo, /hand|head/.test(g.name) ? accent : body);
    world.add(m); return m;
  });
  const torsoIdx = meta.geoms.findIndex((g) => g.name === 'torso1');

  // a faint trail of where the torso has been
  const TRAIL = 400; const trailPos = new Float32Array(TRAIL * 3); let trailN = 0;
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x4fd6df, transparent: true, opacity: 0.55 }));
  world.add(trail);

  function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(view); resize();

  let cur = 0, frame = 0, t = 0, hold = 0, userTouched = false;
  const tour = [0, 4, 7];               // first look: 100K falls, 900K nearly makes it, 1.5M walks
  let tourIdx = 0;
  function select(i) {
    if (i === cur && frame > 0) return;
    cur = i; frame = 0; t = 0; hold = 0; trailN = 0;
    [...bars.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const c = cks[i];
    stepEl.textContent = `${label(c.steps)} steps`;
    outEl.textContent = 'Replaying…';
    camTarget.set(0, 0, 0); firstCam = true;
  }
  function report() {
    const c = cks[cur];
    outEl.textContent = c.fell
      ? `Fell after ${c.survived} steps (${(c.survived * 0.015).toFixed(1)} s)`
      : `Walked the full 1,000 steps, ${c.distance.toFixed(1)} m`;
  }

  const q = new THREE.Quaternion(), camTarget = new THREE.Vector3(); let firstCam = true;
  function pose(f) {
    const c = cks[cur], d = c.data, o = f * G * 7;
    for (let g = 0; g < G; g++) {
      const k = o + g * 7;
      meshes[g].position.set(d[k] / 1000, d[k + 1] / 1000, d[k + 2] / 1000);
      q.set(d[k + 4] / 32767, d[k + 5] / 32767, d[k + 6] / 32767, d[k + 3] / 32767).normalize();   // MuJoCo is w,x,y,z
      meshes[g].quaternion.copy(q);
    }
    const tp = meshes[torsoIdx].position;
    if (trailN < TRAIL) { trailPos.set([tp.x, tp.y, 0.01], trailN * 3); trailN++; trailGeo.setDrawRange(0, trailN); trailGeo.attributes.position.needsUpdate = true; }
    return tp;
  }

  select(reduce ? 7 : 0);
  if (reduce) { report(); }
  let visible = false; watchVisible(view, (v) => { visible = v; });
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const c = cks[cur];
    if (hold > 0) {
      hold -= dt;
      if (hold <= 0) {
        if (!userTouched && !reduce && tourIdx < tour.length - 1) { tourIdx++; select(tour[tourIdx]); }
        else { frame = 0; t = 0; trailN = 0; firstCam = true; }
      }
    } else if (!reduce) {
      t += dt;
      while (t >= meta.dt) { t -= meta.dt; frame++; }
      if (frame >= c.frames - 1) { frame = c.frames - 1; report(); hold = c.fell ? 1.6 : 1.2; }
    } else { frame = c.frames - 1; }
    const tp = pose(frame);
    // follow the torso from the side, a little ahead
    const want = new THREE.Vector3(tp.x + 0.35, tp.y, 0.95);
    if (firstCam) { camTarget.copy(want); firstCam = false; } else camTarget.lerp(want, 0.08);
    const eye = new THREE.Vector3(camTarget.x + 0.4, camTarget.y - 3.1, camTarget.z + 0.55);
    camera.position.copy(world.localToWorld(eye.clone()));
    camera.lookAt(world.localToWorld(camTarget.clone()));
    renderer.render(scene, camera);
  });
  root.querySelector('.lab-poster').hidden = true;
}

/* ======================= 2. drone pickup route ======================= */
whenNear(document.getElementById('route'), () => route().catch((e) => console.warn('route unavailable', e)));

async function route() {
  const root = document.getElementById('route');
  const canvas = document.getElementById('route-canvas'), ctx = canvas.getContext('2d');
  const countEl = document.getElementById('route-count'), legEl = document.getElementById('route-leg');
  const strip = document.getElementById('route-frames');
  const inset = root.querySelector('.inset');
  const data = await fetch('assets/drone/routes.json').then((r) => r.json());
  const O = data.origin;
  const imgs = data.frames.map((f) => { const im = new Image(); im.src = f.img; return im; });
  await Promise.all(imgs.map((im) => im.decode().catch(() => {})));

  data.frames.forEach((f, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.setAttribute('aria-label', `Aerial frame ${i + 1}`);
    b.innerHTML = `<img src="${f.img}" alt="" loading="lazy">`;
    b.addEventListener('click', () => load(i));
    strip.appendChild(b);
  });

  let W = 1, S = 1, cur = 0, legs = [], items = [], legI = 0, legT = 0, wait = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    W = canvas.width; S = W / data.frames[cur].w;
  }
  new ResizeObserver(() => { resize(); if (reduce) draw(); }).observe(canvas);

  function load(i) {
    cur = i; resize();
    [...strip.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const p = data.frames[i].path;
    legs = []; let from = O;
    for (const pt of p) { legs.push([from, pt]); from = pt; }
    items = p.filter((pt) => !(Math.abs(pt[0] - O[0]) < 1 && Math.abs(pt[1] - O[1]) < 1));
    legI = 0; legT = 0; wait = 0.5;
    if (reduce) { legI = legs.length; draw(); finish(); }
    else { countEl.textContent = `Pickup 0 of ${items.length}`; legEl.textContent = 'Nearest item first, back to base after each one'; }
  }
  function finish() {
    countEl.textContent = `${items.length} pickups, ${legs.length} legs`;
    legEl.textContent = 'The real route my planner produced for this frame';
  }

  const X = (v) => v * S;
  function dodge(...pts) {
    if (!inset) return;
    const cr = canvas.getBoundingClientRect(), ir = inset.getBoundingClientRect(), k = cr.width / data.frames[cur].w, pad = 24;
    const under = pts.some((p) => p && p[0] * k + cr.left > ir.left - pad && p[0] * k + cr.left < ir.right + pad && p[1] * k + cr.top > ir.top - pad && p[1] * k + cr.top < ir.bottom + pad);
    inset.classList.toggle('dodge', under);
  }
  function draw(drone) {
    const im = imgs[cur];
    ctx.drawImage(im, 0, 0, W, W * (data.frames[cur].h / data.frames[cur].w));
    ctx.fillStyle = 'rgba(9,18,20,0.38)'; ctx.fillRect(0, 0, W, W);
    const lw = Math.max(1.5, W / 450);
    const done = Math.ceil(legI / 2);                      // items collected so far
    // flown legs
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.min(legI, legs.length); i++) {
      const [a, b] = legs[i];
      ctx.strokeStyle = 'rgba(79,214,223,0.28)'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(X(a[0]), X(a[1])); ctx.lineTo(X(b[0]), X(b[1])); ctx.stroke();
    }
    // items, numbered in visiting order
    items.forEach((pt, k) => {
      const x = X(pt[0]), y = X(pt[1]), r = Math.max(7, W / 80);
      if (k < done) {
        ctx.fillStyle = '#63D39A'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = k === done ? '#FF5B4A' : 'rgba(255,91,74,0.75)'; ctx.lineWidth = lw * (k === done ? 1.6 : 1);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.fillStyle = '#E9EFEC'; ctx.font = `600 ${Math.round(r * 1.1)}px Anybody, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(k + 1), x, y - r * 1.9);
      }
    });
    // base
    const bx = X(O[0]), by = X(O[1]), bs = Math.max(10, W / 60);
    ctx.fillStyle = '#4FD6DF'; ctx.fillRect(bx - bs / 2, by - bs / 2, bs, bs);
    ctx.fillStyle = '#E9EFEC'; ctx.font = `650 ${Math.round(bs * 1.1)}px Anybody, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Base', bx + bs, by + bs * 1.6);
    // current leg and drone
    if (drone) {
      const [a] = legs[Math.min(legI, legs.length - 1)];
      ctx.strokeStyle = '#4FD6DF'; ctx.lineWidth = lw * 1.4;
      ctx.beginPath(); ctx.moveTo(X(a[0]), X(a[1])); ctx.lineTo(X(drone[0]), X(drone[1])); ctx.stroke();
      const dx = X(drone[0]), dy = X(drone[1]), s = Math.max(9, W / 70);
      ctx.fillStyle = 'rgba(79,214,223,0.18)'; ctx.beginPath(); ctx.arc(dx, dy, s * 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#E9EFEC'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(dx - s, dy - s); ctx.lineTo(dx + s, dy + s); ctx.moveTo(dx + s, dy - s); ctx.lineTo(dx - s, dy + s); ctx.stroke();
      ctx.fillStyle = '#E9EFEC';
      for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.arc(dx + ox * s, dy + oy * s, s * 0.42, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4FD6DF'; ctx.beginPath(); ctx.arc(dx, dy, s * 0.35, 0, 7); ctx.fill();
    }
    dodge(drone, items[done]);
  }

  load(0);
  let visible = false; watchVisible(canvas, (v) => { visible = v; });
  const SPEED = 1150;                                       // planner px per second
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || reduce) return;
    if (wait > 0) { wait -= dt; if (wait <= 0 && legI >= legs.length) { load((cur + 1) % data.frames.length); } draw(legI < legs.length ? legs[legI][0] : null); return; }
    const [a, b] = legs[legI], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    legT += (dt * SPEED) / len;
    if (legT >= 1) {
      legT = 0; legI++;
      if (legI % 2 === 1) countEl.textContent = `Pickup ${Math.ceil(legI / 2)} of ${items.length}`;
      if (legI >= legs.length) { finish(); wait = 2.6; draw(null); return; }
    }
    const [p0, p1] = legs[legI], e = legT < 0.5 ? 2 * legT * legT : 1 - Math.pow(-2 * legT + 2, 2) / 2;
    draw([p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e]);
  }
  requestAnimationFrame(tick);
}
