/* Coinflip teaser — 10 s.
 *
 * A metal Goated coin bursts up from the bottom on the drop, stops dead in the
 * middle while it keeps spinning, lands face-on, then falls away to reveal the
 * Goated mark that was hiding behind it.
 *
 * Every frame is a pure function of time: window.__seek(t) renders the frame at
 * t seconds (used by render.mjs for parallel, motion-blurred rendering).
 *   ?clean  → logo-only ending (no COINFLIP title)
 *   ?look=gold|lime|chrome → coin metal
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const C = window.CUES;
const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const CLEAN = params.has('clean');
const LOOK = params.get('look') || 'gold';
const W = 1920, H = 1080;
const LIME = '#d5fb23';

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, t0, d) => clamp((t - t0) / d);
const smooth = (p) => p * p * (3 - 2 * p);
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const outBack = (p, s = 1.7) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const bump = (p) => Math.sin(Math.PI * clamp(p));
const decay = (t, t0, k) => (t < t0 ? 0 : Math.exp(-(t - t0) * k));
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** keyframes [[t, v], ...] with smoothstep between keys */
function curve(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

// ---------------------------------------------------------------- the Goated mark
// Traced from the in-game card back (same as order-up-video/assets/goat.svg).
const HORNS = [
  [[285, 193], [528, 432], [528, 726], [442, 664], [386, 426], [292, 324], [257, 361], [295, 468], [188, 355]],
  [[768, 193], [859, 355], [757, 462], [796, 361], [757, 324], [597, 497], [592, 366]],
];
const HORNS_C = [523.5, 459.5], HORNS_W = 685; // centre and width incl. the rounded stroke
function drawHorns(ctx, width, fill) {
  const s = width / HORNS_W;
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(-HORNS_C[0], -HORNS_C[1]);
  ctx.beginPath();
  for (const poly of HORNS) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
const CAM_Z = 9.5;
camera.position.set(0, 0, CAM_Z);

// studio environment: bright strips in a black room → crisp reflections on metal
function buildEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.BackSide })));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panel = (hex, k, pos, scale, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }));
    m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
    env.add(m);
  };
  panel(0xffffff, 10, [-4.5, 6.5, 6], [7, 0.5, 4]);           // key softbox, top-left front
  panel(0xffffff, 6, [7, 1.5, 3], [0.35, 7, 3]);              // tall strip, right
  panel(0xd5fb23, 5, [-8, -1, 1], [0.35, 6, 3]);              // lime strip, left
  panel(0xc8d8ff, 2.2, [0, -7, 5], [10, 0.35, 4]);            // cool bounce from below
  panel(0xffe4b8, 3.5, [3, 6, -7], [6, 0.5, 3]);              // warm kicker, behind
  panel(0xffffff, 3, [0, 0, 12], [3, 3, 0.3]);                // small front fill
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = buildEnvironment();
scene.environmentIntensity = 0.78;

const key = new THREE.DirectionalLight(0xffffff, 1.25);
key.position.set(-3, 4, 6);
scene.add(key);
const rim = new THREE.PointLight(0xd5fb23, 0, 12, 1.6);
scene.add(rim);

// ---------------------------------------------------------------- coin textures
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const METAL = { gold: [255, 206, 108], lime: [214, 236, 74], chrome: [236, 238, 244] }[LOOK] || [255, 206, 108];
const ENAMEL = LOOK === 'chrome';

function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function drawArcText(ctx, items, r, size, fill) {
  // items: strings and '*' separators (drawn as small 4-point stars); fills the full circle
  ctx.save();
  ctx.fillStyle = fill;
  ctx.font = `600 ${size}px Geist`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const tokens = [];
  for (const it of items) {
    if (it === '*') tokens.push({ star: true, w: size * 1.2 });
    else for (const ch of it) tokens.push({ ch, w: ctx.measureText(ch).width + size * 0.12 });
  }
  const total = tokens.reduce((a, b) => a + b.w, 0);
  const k = (2 * Math.PI * r) / total; // stretch spacing to close the circle exactly
  let acc = 0;
  for (const tk of tokens) {
    const a = ((acc + tk.w / 2) * k) / r;
    acc += tk.w;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -r);
    if (tk.star) {
      const s = size * 0.32;
      ctx.translate(0, -size * 0.36);
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fill();
    } else {
      ctx.fillText(tk.ch, 0, 0);
    }
    ctx.restore();
  }
  ctx.restore();
}

function faceTextures() {
  const S = 2048, c = S / 2, R = S / 2 - 4;
  // --- relief (height) and material masks
  const hCv = makeCanvas(S), h = hCv.getContext('2d');
  const fCv = makeCanvas(S), f = fCv.getContext('2d'); // frosted relief mask
  const eCv = makeCanvas(S), e = eCv.getContext('2d'); // enamel mask (logo)
  for (const g of [h, f, e]) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.translate(c, c); }

  const ring = (g, r0, r1, fill) => { g.beginPath(); g.arc(0, 0, r1, 0, 2 * Math.PI); g.arc(0, 0, r0, 0, 2 * Math.PI, true); g.fillStyle = fill; g.fill(); };
  // gently dished field
  const dish = h.createRadialGradient(0, 0, 0, 0, 0, R * 0.9);
  dish.addColorStop(0, 'rgb(46,46,46)'); dish.addColorStop(1, 'rgb(20,20,20)');
  h.beginPath(); h.arc(0, 0, R * 0.9, 0, 2 * Math.PI); h.fillStyle = dish; h.fill();
  // fine sunburst engraving
  h.strokeStyle = 'rgba(255,255,255,0.09)';
  h.lineWidth = R * 0.0032;
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * 2 * Math.PI;
    h.beginPath(); h.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08); h.lineTo(Math.cos(a) * R * 0.69, Math.sin(a) * R * 0.69); h.stroke();
  }
  // raised rim with a sloped inner wall and a rounded outer edge
  const wall = h.createRadialGradient(0, 0, R * 0.882, 0, 0, R * 0.915);
  wall.addColorStop(0, 'rgb(20,20,20)'); wall.addColorStop(1, 'rgb(255,255,255)');
  ring(h, R * 0.882, R * 0.915, wall);
  ring(h, R * 0.915, R * 0.972, '#fff');
  const edge = h.createRadialGradient(0, 0, R * 0.972, 0, 0, R);
  edge.addColorStop(0, '#fff'); edge.addColorStop(1, 'rgb(120,120,120)');
  ring(h, R * 0.972, R, edge);
  // inner line + bead ring + legend + horns (also into the frosted mask)
  for (const [g, col] of [[h, 'rgb(205,205,205)'], [f, '#fff']]) {
    g.strokeStyle = col; g.lineWidth = R * 0.009;
    g.beginPath(); g.arc(0, 0, R * 0.7, 0, 2 * Math.PI); g.stroke();
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * 2 * Math.PI;
      g.beginPath(); g.arc(Math.cos(a) * R * 0.857, Math.sin(a) * R * 0.857, R * 0.0072, 0, 2 * Math.PI); g.fillStyle = col; g.fill();
    }
    drawArcText(g, ['GOATED ORIGINALS', '*', 'COINFLIP', '*', 'GOATED ORIGINALS', '*', 'COINFLIP', '*'], R * 0.758, R * 0.074, col);
  }
  for (const [g, col] of [[h, '#fff'], [f, '#fff'], [e, '#fff']]) {
    g.save(); g.translate(0, R * 0.035); drawHorns(g, R * 1.0, col); g.restore();
  }

  // --- normals from a softened copy of the relief
  const bCv = makeCanvas(S), b = bCv.getContext('2d');
  b.filter = 'blur(2.6px)';
  b.drawImage(hCv, 0, 0);
  const hd = b.getImageData(0, 0, S, S).data;
  const nCv = makeCanvas(S), n = nCv.getContext('2d');
  const nImg = n.createImageData(S, S), nd = nImg.data;
  const K = 0.028;
  for (let y = 0; y < S; y++) {
    const ym = Math.max(0, y - 1), yp = Math.min(S - 1, y + 1);
    for (let x = 0; x < S; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(S - 1, x + 1);
      const dx = (hd[(y * S + xp) * 4] - hd[(y * S + xm) * 4]) * K;
      const dy = (hd[(yp * S + x) * 4] - hd[(ym * S + x) * 4]) * K;
      const nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      nd[i] = (nx / l * 0.5 + 0.5) * 255; nd[i + 1] = (ny / l * 0.5 + 0.5) * 255; nd[i + 2] = (nz / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
  }
  n.putImageData(nImg, 0, 0);

  // --- colour + roughness/metalness (G = roughness, B = metalness)
  const fd = f.getImageData(0, 0, S, S).data, ed = e.getImageData(0, 0, S, S).data, hs = h.getImageData(0, 0, S, S).data;
  const colCv = makeCanvas(S), col = colCv.getContext('2d'), colImg = col.createImageData(S, S), cd = colImg.data;
  const ormCv = makeCanvas(S), orm = ormCv.getContext('2d'), ormImg = orm.createImageData(S, S), od = ormImg.data;
  const lime = [213, 251, 35];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const r = Math.hypot(x - c, y - c) / R;
      const frost = fd[i] / 255, enamel = ENAMEL ? ed[i] / 255 : 0;
      const onRim = r > 0.9 ? 1 : 0;
      const engraving = hs[i] > 30 && hs[i] < 60 && r < 0.7 ? 1 : 0;
      let rough = lerp(0.09 + 0.12 * engraving, 0.17, onRim);
      rough = lerp(rough, 0.46, frost);
      rough = lerp(rough, 0.32, enamel);
      // a touch darker in the recessed field, like toning on a proof coin
      const tone = r < 0.88 ? 0.86 + 0.14 * frost : 1;
      for (let k = 0; k < 3; k++) cd[i + k] = lerp(METAL[k] * tone, lime[k], enamel);
      cd[i + 3] = 255;
      od[i] = 255; od[i + 1] = rough * 255; od[i + 2] = (1 - enamel) * 255; od[i + 3] = 255;
    }
  }
  col.putImageData(colImg, 0, 0);
  orm.putImageData(ormImg, 0, 0);

  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = MAX_ANISO;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: tex(colCv, true), normalMap: tex(nCv, false), orm: tex(ormCv, false) };
}

function edgeTextures() {
  // reeded edge: fine ridges around the circumference
  const Wd = 4096, Ht = 8, RIDGES = 260;
  const cv = makeCanvas(Wd, Ht), g = cv.getContext('2d');
  const img = g.createImageData(Wd, Ht), d = img.data;
  for (let x = 0; x < Wd; x++) {
    const ph = (x / Wd) * RIDGES * 2 * Math.PI;
    const nx = Math.sin(ph) * 0.75, nz = 1;
    const l = Math.hypot(nx, nz);
    for (let y = 0; y < Ht; y++) {
      const i = (y * Wd + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = 128; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

// ---------------------------------------------------------------- coin
const COIN_R = 1.15, COIN_T = 0.135;
const coin = new THREE.Group();
const spinner = new THREE.Group();
coin.add(spinner);
scene.add(coin);
let faceMat, edgeMat;
function buildCoin() {
  const ft = faceTextures();
  const metal = new THREE.Color(`rgb(${METAL.join(',')})`);
  faceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(1, 1),
    roughnessMap: ft.orm, metalnessMap: ft.orm, roughness: 1, metalness: 1,
  });
  edgeMat = new THREE.MeshStandardMaterial({
    color: metal, metalness: 1, roughness: 0.22, normalMap: edgeTextures(), normalScale: new THREE.Vector2(1, 1),
  });
  const geo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 220, 1, false);
  geo.rotateX(Math.PI / 2); // faces → ±Z
  // Planar UVs so the artwork reads upright on the front, and upright again once the coin flips over.
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nz = nor.getZ(i);
    if (Math.abs(nz) < 0.5) continue;
    uv.setXY(i, pos.getX(i) / (2 * COIN_R) + 0.5, (nz > 0 ? 1 : -1) * pos.getY(i) / (2 * COIN_R) + 0.5);
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat]);
  spinner.add(mesh);
  // thin bevel band where face meets edge (catches a bright line of light)
  const bevel = new THREE.Mesh(new THREE.TorusGeometry(COIN_R - 0.004, 0.012, 8, 220), new THREE.MeshStandardMaterial({ color: metal, metalness: 1, roughness: 0.3 }));
  for (const z of [COIN_T / 2, -COIN_T / 2]) { const m = bevel.clone(); m.position.z = z; spinner.add(m); }
}

// ---------------------------------------------------------------- the Goated mark behind the coin
const logo = new THREE.Group();
scene.add(logo);
let logoMat, logoGlow;
const LOGO_Z = -1.4, LOGO_W = 1.62;
function buildLogo() {
  const s = LOGO_W / HORNS_W;
  const shapes = HORNS.map((poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2((x - HORNS_C[0]) * s, -(y - HORNS_C[1]) * s))));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.022, bevelSegments: 5, curveSegments: 1 });
  geo.translate(0, 0, -0.1);
  geo.computeVertexNormals();
  logoMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(LIME), metalness: 0.6, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: new THREE.Color(LIME), emissiveIntensity: 0.06, transparent: true, opacity: 0,
  });
  logo.add(new THREE.Mesh(geo, logoMat));
  // soft lime glow behind the mark
  const g = makeCanvas(512), gc = g.getContext('2d');
  const rad = gc.createRadialGradient(256, 256, 0, 256, 256, 256);
  rad.addColorStop(0, 'rgba(213,251,35,0.30)'); rad.addColorStop(0.4, 'rgba(213,251,35,0.07)'); rad.addColorStop(1, 'rgba(213,251,35,0)');
  gc.fillStyle = rad; gc.fillRect(0, 0, 512, 512);
  const gt = new THREE.CanvasTexture(g); gt.colorSpace = THREE.SRGBColorSpace;
  logoGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  logoGlow.position.z = -0.6;
  logo.add(logoGlow);
  logo.position.z = LOGO_Z;
}

// ---------------------------------------------------------------- post
// Motion blur and anti-aliasing happen here: each frame averages several jittered
// sub-frames of the HDR scene, then bloom + tone mapping run once on the average.
const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
const accumRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, samples: 0 });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const accMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, w: { value: 1 } }, vertexShader: fsVert,
  fragmentShader: 'uniform sampler2D tex; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * w, 1.0); }',
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat);
const quadScene = new THREE.Scene();
quadScene.add(quad);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.35, 2.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

// ---------------------------------------------------------------- choreography
// Spin (revolutions per second) about the coin's horizontal axis — end over end like a real flip.
const omega = curve([
  [0, 0], [C.launch - 0.02, 0], [C.launch + 0.04, 4.6], [C.stop, 3.1],
  [C.kick2 - 0.08, 3.0], [C.kick2 + 0.05, 4.6], [C.kick2 + 0.4, 3.0],
  [C.slowmo, 3.0], [C.slowmo + 0.34, 0.3], [C.spinUp, 0.3],
  [C.spinUp + 0.32, 3.8], [C.land - 0.2, 3.4], [C.land, 0],
  [C.fall, 0], [C.fall + 0.12, 0.5], [C.fall + 0.55, 2.6], [11, 2.6],
]);
const DT = 0.0005, NT = Math.ceil(11 / DT);
const thetaRaw = new Float64Array(NT + 2);
for (let i = 0; i <= NT; i++) thetaRaw[i + 1] = thetaRaw[i] + omega((i + 0.5) * DT) * DT * 2 * Math.PI;
const rawAt = (t) => { const x = clamp(t, 0, 11) / DT, i = Math.floor(x), f = x - i; return lerp(thetaRaw[i], thetaRaw[Math.min(i + 1, NT + 1)], f); };
// Bend the spin through anchors: face tilted toward camera as it stops dead, square to
// camera on the light sweep, and exactly heads-up on the landing.
const TAU = 2 * Math.PI;
const ANCHORS = (() => {
  const want = [[C.launch, null], [C.stop, 0.6], [C.sweep, 0], [C.land, 0]];
  const out = [];
  let prev = -Infinity;
  for (const [t, phase] of want) {
    const raw = rawAt(t);
    let target = raw;
    if (phase !== null) {
      target = Math.round((raw - phase) / TAU) * TAU + phase;
      while (target <= prev + 1.5) target += TAU; // keep spinning forward
    }
    out.push([t, raw, target]);
    prev = target;
  }
  return out;
})();
function theta(t) {
  if (t <= C.land) {
    if (t <= ANCHORS[0][0]) return rawAt(t);
    for (let i = 1; i < ANCHORS.length; i++) {
      const [t1, r1, g1] = ANCHORS[i], [, r0, g0] = ANCHORS[i - 1];
      if (t <= t1) return g0 + ((rawAt(t) - r0) / (r1 - r0)) * (g1 - g0);
    }
  }
  const landTarget = ANCHORS[ANCHORS.length - 1][2];
  // settle wobble after the snap, then the tumble as it falls
  const wob = 0.32 * Math.exp(-(t - C.land) * 7) * Math.sin((t - C.land) * 26);
  return landTarget + wob + (rawAt(t) - rawAt(C.fall)) * (t > C.fall ? 1 : 0);
}

const BELOW = -3.9;
function coinY(t) {
  if (t < C.launch) return BELOW;
  if (t < C.stop) return lerp(BELOW, 0, outBack(prog(t, C.launch, C.stop - C.launch), 1.15));
  if (t < C.fall) {
    const bob = 0.045 * Math.sin((t - C.stop) * 2.6) * prog(t, C.stop, 0.5) * (1 - prog(t, C.land - 0.3, 0.3));
    return bob;
  }
  const s = t - C.fall; // a little lift, then gravity
  return 0.9 * s - 0.5 * 30 * s * s;
}
const tiltY = (t) => {
  const on = prog(t, C.stop, 0.5) * (1 - smooth(prog(t, C.land - 0.45, 0.4)));
  const slow = 1 - 0.55 * bump(prog(t, C.slowmo, C.spinUp - C.slowmo + 0.3));
  return 0.36 * Math.sin((t - C.stop) * 1.35) * on * slow + (t > C.fall ? -0.25 * smooth(prog(t, C.fall, 0.4)) : 0);
};
const tiltZ = (t) => 0.07 * Math.sin((t - C.stop) * 0.9 + 0.6) * prog(t, C.stop, 0.5) * (1 - prog(t, C.land - 0.45, 0.4));

const camZ = curve([[0, CAM_Z], [C.slowmo, CAM_Z], [C.slowmo + 0.7, 7.7], [C.spinUp, 7.6], [C.land, 9.1], [C.fall, 9.2], [10, 9.7]]);
const camX = (t) => 0.55 * Math.sin((t - C.stop) * 0.55) * prog(t, C.stop, 0.8) * (1 - prog(t, C.land - 0.5, 0.6));
const HITS = [[C.launch, 0.05, 9], [C.stop, 0.08, 8], [C.kick2, 0.035, 10], [C.land, 0.06, 9], [C.fall, 0.05, 8], [C.title, 0.025, 9], [C.final, 0.02, 9]];
function shake(t) {
  let a = 0;
  for (const [t0, amp, k] of HITS) a += amp * decay(t, t0, k);
  return [a * (Math.sin(t * 89) * 0.6 + Math.sin(t * 53 + 1) * 0.4), a * (Math.sin(t * 77 + 2) * 0.6 + Math.sin(t * 131) * 0.4)];
}

// logo: appears behind the face-on coin (hidden), revealed as the coin falls
const LOGO_UP = CLEAN ? 0 : 1.12;
function renderLogo(t) {
  // hidden behind the face-on coin while it materialises (small enough to stay covered) …
  const p = prog(t, C.land + 0.2, 0.42);
  // … then it grows into the hero mark as the coin drops away
  const grow = outBack(prog(t, C.fall + 0.06, 0.6), 1.25);
  const lift = CLEAN ? 0 : inOutCubic(prog(t, C.title - 0.05, 0.7));
  logo.position.y = LOGO_UP * lift;
  const sc = lerp(0.62, 1, outBack(p, 1.3)) * lerp(1, CLEAN ? 1.72 : 1.5, grow) * (1 - 0.1 * lift) * (1 + 0.025 * decay(t, C.final, 6));
  logo.scale.setScalar(sc);
  logo.rotation.y = 0.18 * Math.sin((t - C.fall) * 0.9) * prog(t, C.fall, 1.2);
  logo.rotation.x = -0.06 * Math.sin((t - C.fall) * 0.7) * prog(t, C.fall, 1.2);
  logoMat.opacity = p;
  logoMat.emissiveIntensity = 0.06 + 0.7 * decay(t, C.fall + 0.1, 3.5) + 0.35 * decay(t, C.title, 4) + 0.35 * decay(t, C.final, 4);
  logoGlow.material.opacity = (0.6 + 0.4 * decay(t, C.fall + 0.1, 2.5)) * smooth(prog(t, C.fall, 0.5)) + 0.2 * decay(t, C.final, 4);
}

// ---------------------------------------------------------------- 2D effects (sparks, shockwave, glints)
const fx = document.getElementById('fx').getContext('2d');
const v3 = new THREE.Vector3();
function toScreen(x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x + 1) * W / 2, (1 - v3.y) * H / 2]; }
function coinRadiusPx() { const [x0] = toScreen(coin.position.x, coin.position.y, coin.position.z); const [x1] = toScreen(coin.position.x + COIN_R, coin.position.y, coin.position.z); return Math.abs(x1 - x0); }

const SPARKS = [];
{
  const R = rng(9);
  // burst out of the bottom edge on the drop (screen space)
  for (let i = 0; i < 70; i++) SPARKS.push({ t0: C.launch + R() * 0.05, kind: 'edge', x: 960 + (R() - 0.5) * 260, y: 1095, a: -Math.PI / 2 + (R() - 0.5) * 1.4, v: lerp(700, 2300, R()), k: 3.2, g: 900, life: lerp(0.35, 0.8, R()) });
  // ring of sparks off the rim when it stops dead, and again on the landing snap
  for (let i = 0; i < 80; i++) SPARKS.push({ t0: C.stop, kind: 'rim', a: R() * Math.PI * 2, v: lerp(500, 1700, R()), k: 4.5, g: 300, life: lerp(0.3, 0.7, R()) });
  for (let i = 0; i < 40; i++) SPARKS.push({ t0: C.land, kind: 'rim', a: R() * Math.PI * 2, v: lerp(400, 1200, R()), k: 5, g: 200, life: lerp(0.25, 0.5, R()) });
  // a shower left behind as it drops away
  for (let i = 0; i < 40; i++) SPARKS.push({ t0: C.fall + 0.04 + R() * 0.2, kind: 'trail', u: R() * 2 - 1, a: Math.PI / 2 + (R() - 0.5) * 2.2, v: lerp(150, 650, R()), k: 2.5, g: 700, life: lerp(0.35, 0.8, R()) });
}
const DUST = (() => { const R = rng(3); return Array.from({ length: 70 }, () => ({ x: R() * W, y: R() * H, z: lerp(0.3, 1, R()), ph: R() * 6.28, sp: lerp(6, 22, R()) })); })();
// [time, angle on the rim (rad, 0 = right, negative = up), size]
const GLINTS = [[C.stop, -2.35, 0.55], [C.kick2, -0.7, 0.45], [C.sweep + 0.12, -2.0, 0.6], [C.land, -0.75, 0.6]];
function coinScreenAt(t) {
  const y = coinY(t);
  return toScreen(0, y, 0);
}

function drawStar(x, y, s, alpha) {
  if (alpha <= 0.002 || s <= 0.5) return;
  fx.save();
  fx.translate(x, y);
  fx.globalCompositeOperation = 'lighter';
  const core = fx.createRadialGradient(0, 0, 0, 0, 0, s * 0.35);
  core.addColorStop(0, `rgba(255,255,255,${alpha})`); core.addColorStop(0.3, `rgba(240,255,180,${alpha * 0.6})`); core.addColorStop(1, 'rgba(213,251,35,0)');
  fx.fillStyle = core; fx.beginPath(); fx.arc(0, 0, s * 0.35, 0, 2 * Math.PI); fx.fill();
  for (const [len, wid, rot] of [[s * 1.6, s * 0.035, 0], [s * 0.9, s * 0.03, Math.PI / 2], [s * 0.45, s * 0.02, Math.PI / 4], [s * 0.45, s * 0.02, -Math.PI / 4]]) {
    fx.save(); fx.rotate(rot);
    const g = fx.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, 'rgba(213,251,35,0)'); g.addColorStop(0.5, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(213,251,35,0)');
    fx.fillStyle = g; fx.beginPath(); fx.ellipse(0, 0, len, wid, 0, 0, 2 * Math.PI); fx.fill();
    fx.restore();
  }
  fx.restore();
}

function drawFX(t) {
  fx.clearRect(0, 0, W, H);
  fx.globalCompositeOperation = 'lighter';
  // dust motes drifting in the dark
  for (const d of DUST) {
    const y = (d.y - t * d.sp * d.z + H) % H, x = d.x + Math.sin(t * 0.4 + d.ph) * 14;
    const a = 0.05 + 0.06 * d.z;
    fx.fillStyle = `rgba(220,235,200,${a.toFixed(3)})`;
    fx.beginPath(); fx.arc(x, y, 0.8 + 1.4 * d.z, 0, 2 * Math.PI); fx.fill();
  }
  // lime light leak at the bottom edge on the riser, flash on the drop
  const leak = smooth(prog(t, C.riser, C.launch - C.riser)) * (1 - prog(t, C.launch + 0.05, 0.6)) + 0.8 * decay(t, C.launch, 5);
  if (leak > 0.003) {
    const g = fx.createRadialGradient(960, 1160, 0, 960, 1160, 900);
    g.addColorStop(0, `rgba(213,251,35,${(0.55 * leak).toFixed(3)})`); g.addColorStop(0.4, `rgba(213,251,35,${(0.14 * leak).toFixed(3)})`); g.addColorStop(1, 'rgba(213,251,35,0)');
    fx.fillStyle = g; fx.fillRect(0, 0, W, H);
  }
  // shockwave when the coin stops dead, and a softer one on landing
  for (const [t0, amp] of [[C.stop, 1], [C.land, 0.55]]) {
    const p = prog(t, t0, 0.7);
    if (p > 0 && p < 1) {
      const [cx, cy] = coinScreenAt(t0), r0 = 250;
      for (const [d, col, w] of [[0, '213,251,35', 16], [0.06, '255,255,255', 5]]) {
        const q = prog(t, t0 + d, 0.7);
        if (q <= 0 || q >= 1) continue;
        fx.strokeStyle = `rgba(${col},${(0.8 * amp * (1 - q)).toFixed(3)})`;
        fx.lineWidth = w * (1 - q) * amp + 0.5;
        fx.beginPath(); fx.arc(cx, cy, r0 * (1 + 2.1 * outCubic(q)), 0, 2 * Math.PI); fx.stroke();
      }
    }
  }
  // sparks
  fx.lineCap = 'round';
  for (const s of SPARKS) {
    const dt = t - s.t0;
    if (dt < 0 || dt > s.life) continue;
    let ox = s.x, oy = s.y;
    if (s.kind !== 'edge') {
      const [cx, cy] = coinScreenAt(s.t0), cr = 245;
      if (s.kind === 'rim') { ox = cx + Math.cos(s.a) * cr; oy = cy + Math.sin(s.a) * cr; }
      else { const a = Math.PI / 2 + s.u * 0.9; ox = cx + Math.cos(a) * cr; oy = cy + Math.sin(a) * cr; }
    }
    const pos = (u) => { const e = (1 - Math.exp(-s.k * u)) / s.k; return [ox + Math.cos(s.a) * s.v * e, oy + Math.sin(s.a) * s.v * e + 0.5 * s.g * u * u]; };
    const [x, y] = pos(dt), [xb, yb] = pos(Math.max(0, dt - 0.03));
    const a = 1 - dt / s.life;
    fx.strokeStyle = `rgba(${a > 0.5 ? '245,255,200' : '213,251,35'},${a.toFixed(3)})`;
    fx.lineWidth = 3.2 * a + 0.6;
    fx.beginPath(); fx.moveTo(xb, yb); fx.lineTo(x, y); fx.stroke();
  }
  // glints on the rim
  for (const [t0, ang, sz] of GLINTS) {
    const p = prog(t, t0 - 0.04, 0.42);
    if (p <= 0 || p >= 1) continue;
    const [cx, cy] = coinScreenAt(t0), r = coinRadiusPx() * 0.98;
    drawStar(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 260 * sz * bump(p), bump(p));
  }
  // twinkles on the logo after the reveal
  for (const [t0, x, y] of [[C.fall + 0.25, -0.62, 0.42], [C.title + 0.1, 0.55, 0.46], [C.final, -0.15, -0.5]]) {
    const p = prog(t, t0, 0.5);
    if (p <= 0 || p >= 1) continue;
    const s = logo.scale.x;
    const [sx, sy] = toScreen(logo.position.x + x * s, logo.position.y + y * s, LOGO_Z + 0.2);
    drawStar(sx, sy, 200 * bump(p), bump(p));
  }
  fx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- title (DOM)
const titleWord = document.querySelector('#title .word');
const letters = [];
for (const part of titleWord.children) {
  const text = part.textContent; part.textContent = '';
  for (const ch of text) { const s = document.createElement('span'); s.textContent = ch; s.style.display = 'inline-block'; part.appendChild(s); letters.push(s); }
}
const sub = document.querySelector('#sub span');
document.getElementById('title').style.display = CLEAN ? 'none' : 'block';
function renderTitle(t) {
  if (CLEAN) return;
  letters.forEach((el, i) => {
    const p = outExpo(prog(t, C.title + 0.04 + i * 0.035, 0.6));
    el.style.transform = `translateY(${((1 - p) * 110).toFixed(2)}%)`;
  });
  const pulse = 1 + 0.03 * decay(t, C.final, 6);
  titleWord.style.transform = `scale(${pulse.toFixed(4)})`;
  const ps = outCubic(prog(t, C.sub, 0.6));
  sub.style.opacity = ps.toFixed(3);
  sub.style.letterSpacing = `${(0.01 + 0.12 * (1 - ps)).toFixed(3)}em`;
  sub.style.transform = `translateY(${((1 - ps) * 18).toFixed(2)}px)`;
  sub.style.display = 'inline-block';
}

// ---------------------------------------------------------------- frame
function setState(t) {
  const [sx, sy] = shake(t);
  camera.position.set(camX(t) + sx, sy, camZ(t));
  camera.lookAt(sx * 0.3, sy * 0.3, 0);
  coin.visible = t > C.launch - 0.02 && coinY(t) > -4.5;
  coin.position.set(0, coinY(t), t > C.fall ? 0.8 * smooth(prog(t, C.fall, 0.6)) : 0);
  coin.rotation.set(0, tiltY(t), tiltZ(t));
  spinner.rotation.set(theta(t), 0, 0);
  // light: sweep a highlight across the face on the slow-mo snare; the studio turns slowly
  const sweep = inOutCubic(prog(t, C.sweep - 0.25, 0.7));
  scene.environmentRotation.set(0.15 * Math.sin(t * 0.4), t * 0.22 + 1.1 * sweep + 0.9 * inOutCubic(prog(t, C.title - 0.1, 0.9)), 0);
  key.position.set(-3 + 7 * sweep, 4 - 2 * sweep, 6);
  rim.position.set(0, -2.2, 1.5);
  rim.intensity = 10 * decay(t, C.launch, 3) * (1 - prog(t, C.stop - 0.25, 0.25));
  renderLogo(t);
}

const SHUTTER = 0.5; // 180°
function render(t) {
  const n = subframesAt(t);
  renderer.setRenderTarget(accumRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  accMat.uniforms.w.value = 1 / n;
  for (let k = 0; k < n; k++) {
    const ts = Math.max(0, t + ((k + 0.5) / n - 0.5) * (SHUTTER / C.fps));
    camera.setViewOffset(W, H, halton(k + 1, 2) - 0.5, halton(k + 1, 3) - 0.5, W, H);
    setState(ts);
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    accMat.uniforms.tex.value = sceneRT.texture;
    renderer.setRenderTarget(accumRT);
    renderer.render(quadScene, quadCam);
  }
  camera.clearViewOffset();
  setState(t);
  // hand the averaged HDR frame to bloom + tone mapping
  accMat.uniforms.tex.value = accumRT.texture;
  accMat.uniforms.w.value = 1;
  renderer.setRenderTarget(composer.readBuffer);
  renderer.clear();
  renderer.render(quadScene, quadCam);
  bloom.strength = 0.3 + 0.12 * decay(t, C.stop, 6) + 0.2 * decay(t, C.fall + 0.08, 3);
  composer.render();
  drawFX(t);
  renderTitle(t);
}

// motion-blur / anti-aliasing budget: sub-frames averaged per output frame
const BLUR = [
  [C.launch - 0.02, C.stop + 0.1, 12],      // launch: fastest spin + travel
  [C.kick2 - 0.1, C.kick2 + 0.45, 10],
  [C.spinUp, C.land + 0.12, 10],
  [C.fall - 0.02, C.fall + 0.75, 10],
  [C.stop, C.fall, 7],                      // hovering spin
];
function subframesAt(t) {
  let n = 4;
  for (const [a, b, k] of BLUR) if (t >= a && t <= b) n = Math.max(n, k);
  return n;
}

// ---------------------------------------------------------------- boot
async function boot() {
  await document.fonts.load('270px Schabo');
  await document.fonts.load('600 40px Geist');
  await document.fonts.load('500 48px Geist');
  await document.fonts.ready;
  buildCoin();
  buildLogo();
  window.__seek = (t) => render(t);
  window.__subframes = subframesAt;
  window.__duration = C.duration;
  window.__cues = C;
  render(parseFloat(params.get('t') || '0'));
  window.__ready = true;
  if (!RENDER && !params.has('t')) preview();
}

function preview() {
  document.body.classList.add('preview');
  const stage = document.getElementById('stage');
  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${s})`; stage.style.transformOrigin = '0 0'; };
  fit(); addEventListener('resize', fit);
  const audio = new Audio('out/soundtrack.wav');
  let t0 = null;
  const loop = (now) => {
    let t;
    if (!audio.paused) t = audio.currentTime;
    else { if (t0 == null) t0 = now; t = ((now - t0) / 1000) % C.duration; }
    render(Math.min(t, C.duration - 1 / C.fps));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); document.body.classList.add('playing'); });
  audio.addEventListener('ended', () => { audio.currentTime = 0; audio.play().catch(() => {}); });
}

boot().catch((e) => { console.error(e); window.__error = String(e && e.stack || e); });
