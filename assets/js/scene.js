// The hero: the HSR's own URDF and the real coloured point cloud from the 7 Aug 2026 run.
// Scrolling through #story plays the run (start, drive, reach, grasp, lift) with the logged joint values.
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFLoader from '../vendor/urdf/URDFLoader.js';

const story = document.getElementById('story');
const stage = document.getElementById('stage');
const viewEl = document.getElementById('view');
const BASE = 'assets/hsr';
const still = new URLSearchParams(location.search).has('still');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (p, a, b) => smooth(clamp((p - a) / (b - a)));

export function storyProgress() {
  const r = story.getBoundingClientRect();
  return clamp(-r.top / (r.height - innerHeight));
}

// Robot pose along the story (s = 0..4 over the five logged stages)
function poseParam(p) {
  if (p < 0.30) return 0;
  if (p < 0.47) return ramp(p, 0.30, 0.46);
  if (p < 0.62) return 1 + ramp(p, 0.47, 0.60);
  if (p < 0.72) return 2 + ramp(p, 0.63, 0.70);
  return 3 + ramp(p, 0.72, 0.84);
}

// Camera keyframes in the three.js frame (y up; x = robot forward; z = -ROS y)
const KEYS = [
  { p: 0.00, pos: [1.55, 1.45, 2.65], tgt: [0.42, 0.62, 0.00] },
  { p: 0.18, pos: [1.35, 1.05, 1.05], tgt: [0.66, 0.54, 0.02] },
  { p: 0.38, pos: [0.95, 1.75, 2.45], tgt: [0.45, 0.55, 0.00] },
  { p: 0.56, pos: [0.30, 1.20, 1.95], tgt: [0.55, 0.64, 0.02] },
  { p: 0.70, pos: [1.95, 1.25, 1.80], tgt: [0.60, 0.62, 0.00] },
  { p: 0.92, pos: [2.15, 1.40, 2.25], tgt: [0.50, 0.72, 0.00] },
];
function cameraAt(p) {
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = ramp(p, A.p, B.p);
  return { pos: A.pos.map((v, k) => lerp(v, B.pos[k], t)), tgt: A.tgt.map((v, k) => lerp(v, B.tgt[k], t)) };
}

init().catch((e) => { console.warn('3D scene unavailable:', e); stage.classList.add('stage-fallback'); });

async function init() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(max-width: 820px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  viewEl.appendChild(canvas);

  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x091214);
  scene.background = bg; scene.fog = new THREE.Fog(bg, 3.2, 7.5);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 30);

  scene.add(new THREE.HemisphereLight(0xdff3f5, 0x0b1517, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 4, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fd6df, 1.6); rim.position.set(-3, 2.2, -2.5); scene.add(rim);

  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);   // ROS frame, z up

  // floor grid that fades with distance (fog handles the falloff)
  const grid = new THREE.GridHelper(6, 60, 0x1f3a3f, 0x13262a);
  grid.rotation.x = Math.PI / 2; grid.position.set(0.6, 0, 0); world.add(grid);

  const [meta, buf, urdfText] = await Promise.all([
    fetch(BASE + '/run.json').then((r) => r.json()),
    fetch(BASE + '/cloud.bin').then((r) => r.arrayBuffer()),
    fetch(BASE + '/hsrb4s.urdf').then((r) => r.text()),
  ]);

  // ---- point cloud with a lidar-style reveal sweep ----
  const n = meta.n;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf, n * 12, n * 3), 3, true));
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, vertexColors: true,
    uniforms: { uSize: { value: mobile ? 0.011 : 0.0095 }, uPix: { value: 800 }, uSweep: { value: 0.3 }, uGlow: { value: new THREE.Color(0x4fd6df) } },
    vertexShader: `
      uniform float uSize; uniform float uPix; uniform float uSweep;
      varying vec3 vC; varying float vA; varying float vEdge;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = position.x - uSweep;
        vA = smoothstep(0.04, -0.04, d);
        vEdge = smoothstep(0.07, 0.0, abs(d));
        vC = pow(color, vec3(2.2));
        gl_PointSize = uSize * uPix / -mv.z;
      }`,
    fragmentShader: `
      uniform vec3 uGlow; varying vec3 vC; varying float vA; varying float vEdge;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = dot(c, c);
        if (r > 0.25 || vA < 0.01) discard;
        vec3 col = mix(vC, uGlow, vEdge * 0.85);
        gl_FragColor = vec4(col * (1.0 + vEdge), vA);
        #include <colorspace_fragment>
      }`,
  });
  world.add(new THREE.Points(g, cloudMat));

  // ---- the part the system chose: a ring around the mug ----
  const t = meta.target;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5b4a, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.0028, 8, 72), ringMat);
  ring.position.set(t[0], t[1], 0.535); world.add(ring);
  const ring2 = ring.clone(); ring2.material = ringMat.clone(); world.add(ring2);

  // ---- robot ----
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eeee, roughness: 0.42, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232a2e, roughness: 0.5, metalness: 0.15 });
  const led = new THREE.MeshStandardMaterial({ color: 0x4fd6df, emissive: 0x4fd6df, emissiveIntensity: 2.2 });
  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);
  loader.packages = { hsr_meshes: BASE };
  loader.loadMeshCb = (path, mgr, done) => new OBJLoader(mgr).load(path, (o) => done(o), undefined, (e) => done(null, e));
  const robot = loader.parse(urdfText);
  const holder = new THREE.Group(); holder.add(robot); world.add(holder);
  await new Promise((res) => { manager.onLoad = res; setTimeout(res, 20000); });
  robot.traverse((o) => {
    if (o.isLine || o.isPoints) { o.visible = false; return; }   // some OBJs carry edge lines
    if (!o.isMesh) return;
    let p = o; while (p && !p.isURDFLink) p = p.parent;
    o.material = /head|torso|wrist|hand|sensor|camera/.test(p ? p.name : '') ? dark : white;
  });
  // status LED ring on the base, like the real robot
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.004, 6, 96), led);
  ledRing.position.set(0, 0, 0.345); robot.links.base_link.add(ledRing);

  const stages = meta.stages;
  const ARM = ['arm_lift_joint', 'arm_flex_joint', 'arm_roll_joint', 'wrist_flex_joint', 'wrist_roll_joint'];
  function applyPose(s) {
    s = clamp(s, 0, stages.length - 1);
    const i = Math.min(Math.floor(s), stages.length - 2), f = smooth(clamp(s - i));
    const A = stages[i], B = stages[i + 1];
    const bx = lerp(A.base[0], B.base[0], f), by = lerp(A.base[1], B.base[1], f), yaw = lerp(A.base[2], B.base[2], f);
    holder.position.set(bx, by, 0); holder.rotation.set(0, 0, yaw);
    const q = {}; ARM.forEach((j) => { q[j] = lerp(A.q[j], B.q[j], f); });
    q.hand_motor_joint = lerp(A.hand, B.hand, f);
    robot.setJointValues(q);
    return { bx, by, yaw, q };
  }

  // ---- sizing ----
  const view = { w: 1, h: 1, desk: true };
  function resize() {
    const w = viewEl.clientWidth, h = viewEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const desk = w > 820;
    // keep the robot clear of the captions: shift the image right on desktop, up on phones
    view.w = w; view.h = h; view.desk = desk;
    camera.fov = desk ? 34 : 42;
    // desktop: push the scene right so the words on the left never sit on the robot
    if (desk) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    cloudMat.uniforms.uPix.value = h * renderer.getPixelRatio() * 0.9;
  }
  new ResizeObserver(resize).observe(viewEl); resize();

  // ---- loop ----
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  let first = true, sP = 0, introStart = performance.now();
  let visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(stage);

  stage.classList.add('live');
  window.dispatchEvent(new CustomEvent('scene:ready'));

  renderer.setAnimationLoop((now) => {
    if (!visible) return;
    const p = still ? 0 : storyProgress();
    const intro = still || reduce ? 1 : smooth(clamp((now - introStart) / 2600));
    // reveal sweep runs on load, across the chair, then holds
    cloudMat.uniforms.uSweep.value = lerp(0.35, 2.2, intro);

    const k = cameraAt(p);
    const sway = reduce || still ? 0 : Math.sin(now / 2600) * 0.04;
    const dist = lerp(1.45, 1, intro) * (view.desk ? 1 : 1.12);
    camTgt.set(...k.tgt);
    const target = new THREE.Vector3(...k.pos).sub(camTgt).multiplyScalar(dist).add(camTgt);
    target.x += sway; target.y += sway * 0.4;
    if (first || reduce) { camPos.copy(target); first = false; } else camPos.lerp(target, 0.08);
    camera.position.copy(camPos); camera.lookAt(camTgt);

    const sTarget = poseParam(p);
    sP = reduce ? sTarget : lerp(sP, sTarget, 0.12);
    const pose = applyPose(sP);

    // ring: strong while the object is being chosen, faint afterwards
    const ringOn = ramp(p, 0.03, 0.12) * (1 - 0.75 * ramp(p, 0.30, 0.36));
    const pulse = reduce ? 0.5 : (now / 1400) % 1;
    ring.material.opacity = ringOn;
    ring2.material.opacity = ringOn * (1 - pulse) * 0.7;
    ring2.scale.setScalar(1 + pulse * 0.9);
    ledRing.material.emissiveIntensity = 1.6 + Math.sin(now / 500) * 0.6;


    renderer.render(scene, camera);
  });
}
