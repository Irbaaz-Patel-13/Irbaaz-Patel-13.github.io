// Replays the 7 Aug 2026 HSR run: the robot's own URDF, posed with the joint values the planner
// logged for candidate 24, over the coloured point cloud from that run's head-camera capture.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFLoader from './vendor/urdf/URDFLoader.js';

const root = document.getElementById('viewer');
if (root) init(root);

function init(el) {
  const base = el.dataset.base;            // path to assets/hsr
  const canvasHost = el.querySelector('.viewer');
  const loading = el.querySelector('.loading');
  const noteEl = el.querySelector('.stage-note');
  const scrub = el.querySelector('.scrub');
  const buttons = [...el.querySelectorAll('.stage-buttons button[data-stage]')];
  const playBtn = el.querySelector('[data-play]');
  const hud = el.querySelector('.hud-values');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let started = false;

  const startLoad = () => { if (started) return; started = true; load().catch(fail); };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); startLoad(); } }, { rootMargin: '300px' });
    io.observe(el);
  } else startLoad();

  function fail(err) {
    console.error(err);
    loading.hidden = false;
    loading.innerHTML = '<p style="max-width:34ch;text-align:center;padding:0 16px">The 3D replay needs WebGL, which this browser has turned off. The figure below shows the same run.</p>';
  }

  async function load() {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Interactive 3D view of the HSR and the point cloud from the 7 August run. Drag to orbit, scroll or pinch to zoom.');
    canvas.setAttribute('role', 'img');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { fail(e); return; }
    canvasHost.prepend(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1214);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 30);
    camera.position.set(0.75, 1.4, 2.6);           // three.js frame (y up)
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0.48, 0.6, 0.0);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.6; controls.maxDistance = 6; controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xdfeff0, 0x1a2224, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fe3ea, 0.8); rim.position.set(-3, 2, -2); scene.add(rim);

    // ROS frame (z up) inside a y-up scene
    const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);

    const grid = new THREE.GridHelper(4, 40, 0x2b3a3e, 0x1a2427);
    grid.rotation.x = Math.PI / 2; grid.position.set(0.6, 0, 0); world.add(grid);

    const [meta, cloudBuf] = await Promise.all([
      fetch(base + '/run.json').then(r => r.json()),
      fetch(base + '/cloud.bin').then(r => r.arrayBuffer()),
    ]);

    // point cloud
    const n = meta.n;
    const pos = new Float32Array(cloudBuf, 0, n * 3);
    const rgb = new Uint8Array(cloudBuf, n * 12, n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) col[i] = rgb[i] / 255;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cloud = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.0085, vertexColors: true, sizeAttenuation: true }));
    world.add(cloud);

    // grasp target chosen by the system (part centre)
    const t = meta.target;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.003, 8, 64), new THREE.MeshBasicMaterial({ color: 0xff5e50 }));
    ring.position.set(t[0], t[1], 0.003); world.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5e50 }));
    dot.position.set(t[0], t[1], t[2]); world.add(dot);

    // robot
    const mats = {
      white: new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.45, metalness: 0.05 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.55, metalness: 0.1 }),
    };
    const darkLinks = /head|torso|wrist|hand|sensor|camera/;
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    loader.packages = { hsr_meshes: base };
    loader.loadMeshCb = (path, mgr, done) => {
      new OBJLoader(mgr).load(path, (obj) => done(obj), undefined, (err) => done(null, err));
    };
    const urdfText = await fetch(base + '/hsrb4s.urdf').then(r => r.text());
    const robot = loader.parse(urdfText);
    const robotHolder = new THREE.Group(); robotHolder.add(robot); world.add(robotHolder);

    await new Promise((res) => { manager.onLoad = res; setTimeout(res, 15000); });
    robot.traverse((o) => {
      if (o.isMesh) {
        let p = o, name = '';
        while (p && !p.isURDFLink) p = p.parent;
        name = p ? p.name : '';
        o.material = darkLinks.test(name) ? mats.dark : mats.white;
      }
    });

    // stages
    const stages = meta.stages;
    const ARM = ['arm_lift_joint', 'arm_flex_joint', 'arm_roll_joint', 'wrist_flex_joint', 'wrist_roll_joint'];
    const ease = (f) => f * f * (3 - 2 * f);
    const lerp = (a, b, f) => a + (b - a) * f;
    let s = 0, target = 0, playing = false, lastT = 0, current = -1;

    function apply(v) {
      v = Math.max(0, Math.min(stages.length - 1, v));
      const i = Math.min(Math.floor(v), stages.length - 2), f = ease(Math.min(1, Math.max(0, v - i)));
      const A = stages[i], B = stages[i + 1];
      const bx = lerp(A.base[0], B.base[0], f), by = lerp(A.base[1], B.base[1], f), yaw = lerp(A.base[2], B.base[2], f);
      robotHolder.position.set(bx, by, 0); robotHolder.rotation.set(0, 0, yaw);
      const q = {};
      ARM.forEach((j) => { q[j] = lerp(A.q[j], B.q[j], f); });
      q.hand_motor_joint = lerp(A.hand, B.hand, f);
      robot.setJointValues(q);
      const nearest = Math.round(v);
      if (nearest !== current) { current = nearest; setActive(nearest); }
      hud.innerHTML =
        `base <b>x ${bx.toFixed(3)}</b> <b>y ${by.toFixed(3)}</b> <b>yaw ${yaw.toFixed(3)}</b><br>` +
        `arm_lift <b>${q.arm_lift_joint.toFixed(3)} m</b> arm_flex <b>${q.arm_flex_joint.toFixed(3)}</b> wrist_flex <b>${q.wrist_flex_joint.toFixed(3)}</b>`;
    }
    function setActive(i) {
      buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      noteEl.textContent = stages[i].note + '.';
    }
    buttons.forEach((b, k) => b.addEventListener('click', () => { playing = false; playBtn.textContent = 'Replay the run'; target = k; scrub.value = k; }));
    scrub.max = stages.length - 1;
    scrub.addEventListener('input', () => { playing = false; playBtn.textContent = 'Replay the run'; target = s = parseFloat(scrub.value); });
    playBtn.addEventListener('click', () => {
      if (playing) { playing = false; playBtn.textContent = 'Replay the run'; return; }
      if (s >= stages.length - 1.01) s = target = 0;
      playing = true; playBtn.textContent = 'Pause'; lastT = performance.now();
    });

    function resize() {
      const w = canvasHost.clientWidth, h = canvas.clientHeight || 480;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvasHost); resize();

    loading.hidden = true;
    apply(0);
    if (!reduce) { playing = true; playBtn.textContent = 'Pause'; lastT = performance.now(); }

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvasHost);

    renderer.setAnimationLoop((now) => {
      if (!visible) return;
      const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now;
      if (playing) {
        s += dt / 2.2;                      // ~2.2 s per stage
        if (s >= stages.length - 1) { s = stages.length - 1; playing = false; playBtn.textContent = 'Replay the run'; }
        target = s; scrub.value = s;
      } else {
        s += (target - s) * Math.min(1, dt * 6);
      }
      apply(s);
      controls.update();
      renderer.render(scene, camera);
    });
  }
}
