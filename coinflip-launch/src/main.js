/* Coinflip launch video — 15 s, 1080×1350.
 * Every frame is a pure function of time: window.__seek(t) paints the frame at t
 * seconds (render.mjs captures it, averaging sub-frames for motion blur).
 */
(() => {
  'use strict';
  const C = window.CUES;
  const W = 1080, H = 1350;
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render');

  // ---------------------------------------------------------------- helpers
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, d) => clamp((t - t0) / d);
  const outCubic = (p) => 1 - Math.pow(1 - p, 3);
  const outQuart = (p) => 1 - Math.pow(1 - p, 4);
  const outExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
  const inCubic = (p) => p * p * p;
  const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const outBack = (p, s = 1.7) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
  const smooth = (p) => p * p * (3 - 2 * p);
  const bump = (p) => Math.sin(Math.PI * clamp(p));
  const decay = (t, t0, k) => (t < t0 ? 0 : Math.exp(-(t - t0) * k));
  const TAU = Math.PI * 2;
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const set = (e, prop, v) => { if (!e._c) e._c = {}; if (e._c[prop] !== v) { e._c[prop] = v; e.style[prop] = v; } };
  const setText = (e, v) => { if (e._t !== v) { e._t = v; e.textContent = v; } };
  const money = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMult = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';

  // ---------------------------------------------------------------- DOM setup
  const stage = $('#stage');
  const cam = document.createElement('div');
  cam.id = 'cam';
  cam.style.cssText = 'position:absolute;inset:0;transform-origin:540px 675px';
  for (const el of [...stage.children]) if (el.id !== 'vignette') cam.appendChild(el);
  stage.insertBefore(cam, $('#vignette'));

  function split(word) {
    const out = [];
    const walk = (node) => {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const c of ch.textContent) {
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = c === ' ' ? ' ' : c;
            frag.appendChild(s);
            out.push(s);
          }
          node.replaceChild(frag, ch);
        } else walk(ch);
      }
    };
    walk(word);
    return out;
  }
  const L = {
    title: split($('#title .word')),
    tag: split($('#tag .word')),
    callA: split($('#callA')),
    callB: split($('#callB')),
    one: split($('#hdrOne .word')),
    win: split($('#winTitle .word')),
    end: split($('#endTitle .word')),
  };
  const el = {};
  for (const id of ['bgIntro', 'bgUI', 'bgWin', 'bgEnd', 'rays', 'intro', 'chip', 'title', 'tag', 'tagBg', 'ui', 'hdrCall', 'hdrStreak', 'streakLabel',
    'mult', 'multEcho', 'hdrOne', 'panel', 'dots', 'btnHeads', 'btnTails', 'cashout', 'cashFill', 'cashAmt', 'dim', 'tap', 'win', 'winTitle', 'winAmt',
    'winPill', 'winRow', 'end', 'logo', 'endTitle', 'cta', 'legal', 'flash']) el[id] = document.getElementById(id);
  el.cashLbl = $('#cashout .lbl');
  el.winAmtWord = $('#winAmt .word');

  // streak dots + win row coins
  const dots = [];
  for (let i = 0; i < 20; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    d.style.left = (20 + i * (28 + 10.95)).toFixed(2) + 'px';
    const img = document.createElement('img');
    img.src = i < 10 ? `assets/coins/${C.calls[i] === 'H' ? 'heads' : 'tails'}.png` : '';
    d.appendChild(img);
    el.dots.appendChild(d);
    dots.push({ d, img });
  }
  const rowCoins = C.calls.map((c, i) => {
    const r = document.createElement('div');
    r.className = 'rcoin';
    r.style.left = i * 84 + 'px';
    const img = document.createElement('img');
    img.src = `assets/coins/${c === 'H' ? 'heads' : 'tails'}.png`;
    r.appendChild(img);
    el.winRow.appendChild(r);
    return r;
  });

  // ---------------------------------------------------------------- coins (2.5D)
  const IMG = { H: new Image(), T: new Image() };
  IMG.H.src = 'assets/coins/heads.png';
  IMG.T.src = 'assets/coins/tails.png';
  const EDGE = { H: ['#a35cf6', '#5b1fb0'], T: ['#ffcf2e', '#c27400'] };

  /** theta: flip about the horizontal axis. 0 → heads square to camera, π → tails. */
  function drawCoin(ctx, x, y, R, theta, o = {}) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const side = c >= 0 ? 'H' : 'T';
    const T = R * (o.thick ?? 0.17);
    const ac = Math.abs(c);
    const ry = Math.max(R * 0.012, R * ac);
    const off = (T / 2) * s * (c >= 0 ? 1 : -1); // visible face sits this far below the far face
    const yf = y + off, yb = y - off;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    // soft shadow underneath
    if (o.shadow) {
      const sh = o.shadow;
      ctx.save();
      ctx.globalAlpha *= sh.a;
      ctx.translate(x, sh.y);
      ctx.scale(1, 0.22);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * sh.s);
      g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R * sh.s, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // glow ring (wins)
    if (o.ring > 0.001) {
      ctx.save();
      ctx.globalAlpha *= o.ring;
      ctx.strokeStyle = '#2ee6a6';
      ctx.shadowColor = 'rgba(46,230,166,0.9)';
      ctx.shadowBlur = 30;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(x, y, R + 22, ry + 22 * Math.max(ac, 0.2), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // edge band
    if (Math.abs(off) > 0.3) {
      const g = ctx.createLinearGradient(0, Math.min(yf, yb) - ry, 0, Math.max(yf, yb) + ry);
      g.addColorStop(0, EDGE[side][0]); g.addColorStop(1, EDGE[side][1]);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, yb, R, ry, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x - R, Math.min(yf, yb), 2 * R, Math.abs(yf - yb));
      ctx.beginPath(); ctx.ellipse(x, yf, R, ry, 0, 0, TAU); ctx.fill();
      // fine ridges hint on the band
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, (yf + yb) / 2, R, ry, 0, 0, Math.PI); ctx.stroke();
    }
    // face
    ctx.save();
    ctx.translate(x, yf);
    ctx.scale(1, ac < 0.012 ? 0.012 : ac);
    ctx.drawImage(IMG[side], -R, -R, 2 * R, 2 * R);
    // shade with tilt + a sheen that slides as it turns
    ctx.beginPath(); ctx.arc(0, 0, R * 0.985, 0, TAU); ctx.clip();
    if (ac < 0.999) { ctx.fillStyle = `rgba(10,0,30,${(0.28 * (1 - ac)).toFixed(3)})`; ctx.fillRect(-R, -R, 2 * R, 2 * R); }
    const sp = ((theta / Math.PI) % 2 + 2) % 2; // 0..2
    const sx = lerp(-1.6, 1.6, (sp % 1)) * R;
    const sg = ctx.createLinearGradient(sx - R * 0.6, -R, sx + R * 0.6, R);
    const a = 0.10 + 0.22 * (1 - ac) + (o.sheen || 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);
    ctx.restore();
    ctx.restore();
  }

  function drawStar(ctx, x, y, s, a, col = '255,255,255') {
    if (a <= 0.003 || s < 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${col})`;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- choreography data
  const MULTS = Array.from({ length: 10 }, (_, k) => 0.98 * Math.pow(2, k + 1));
  // the flip schedule lives in cues.js, shared with the sound design
  const { lands: LANDS, dur: DUR, start: START, target: TARGET } = C.toss;
  const SLOT = { x: 540, y: 320 + 270, R: 140 };
  const INTRO = { x: 540, y: 904, R: 205 };

  const warp = C.warp;

  /** main coin state at time t */
  function mainCoin(t) {
    // intro: launch from below, land heads-up
    if (t < C.toUI) {
      const p = prog(t, C.coinUp, C.coinLand - C.coinUp);
      if (t < C.coinUp) return null;
      const y = lerp(H + 260, INTRO.y, outCubic(p)) + (t > C.coinLand ? -10 * bump(prog(t, C.coinLand, 0.18)) : 0);
      const theta = lerp(-5 * TAU, 0, outQuart(p)) + (t > C.coinLand ? 0.12 * Math.exp(-(t - C.coinLand) * 9) * Math.sin((t - C.coinLand) * 30) : 0);
      const R = INTRO.R * lerp(1.25, 1, outCubic(p)) * (1 + 0.06 * decay(t, C.burst, 9)); // pulses on the snare
      return { x: INTRO.x, y, R, theta, ring: 0, shadow: null };
    }
    // fly from the intro into the panel slot
    if (t < START[0]) {
      const p = inOutCubic(prog(t, C.toUI, 0.5));
      return { x: 540, y: lerp(INTRO.y, SLOT.y, p) - 60 * bump(p), R: lerp(INTRO.R, SLOT.R, p), theta: 0, ring: 0, shadow: { y: SLOT.y + SLOT.R + 16, s: 1.05, a: p } };
    }
    if (t >= C.bigWin) return null;
    // which toss are we in?
    let k = 0;
    while (k < 9 && t >= START[k + 1]) k++;
    const [th0, th1] = TARGET[k];
    let p = prog(t, START[k], DUR[k]);
    const last = k === 9;
    const pw = last ? warp(p) : p;
    const hop = last ? 118 : DUR[k] > 0.45 ? 110 : 66;
    const lift = 4 * pw * (1 - pw);
    const y = SLOT.y - hop * lift + (t > LANDS[k] ? -8 * bump(prog(t, LANDS[k], 0.16)) : 0);
    const R = SLOT.R * (1 + (last ? 0.22 : 0.14) * lift);
    const theta = lerp(th0, th1, pw) + (t > LANDS[k] ? 0.1 * Math.exp(-(t - LANDS[k]) * 10) * Math.sin((t - LANDS[k]) * 32) : 0);
    // win glow ring: appears on landing, dims while idle, gone when the next toss starts
    let ring = 0;
    if (t >= LANDS[k]) ring = 0.35 + 0.65 * Math.max(decay(t, LANDS[k], 4), k === 9 ? decay(t, C.rehit, 5) : 0);
    else if (k > 0) ring = (0.35 + 0.65 * decay(t, LANDS[k - 1], 4)) * (1 - prog(t, START[k], 0.08));
    return { x: 540, y, R, theta, ring, shadow: { y: SLOT.y + SLOT.R + 16, s: 1.05 - 0.35 * lift, a: 1 - 0.6 * lift }, sheen: last ? 0.1 * bump(prog(t, C.stop - 0.2, 0.5)) : 0 };
  }

  // ---------------------------------------------------------------- particles
  const R1 = rng(4);
  const STARS = Array.from({ length: 26 }, () => ({ x: R1() * W, y: R1() * H * 0.9, s: lerp(5, 14, R1()), ph: R1() * TAU, sp: lerp(1.5, 4, R1()), lime: R1() < 0.5 }));
  const RAIN = Array.from({ length: 34 }, (_, i) => ({
    x: R1() * W, y0: -120 - R1() * 900, v: lerp(520, 980, R1()), R: lerp(20, 50, R1()), w: lerp(4, 11, R1()) * (R1() < 0.5 ? -1 : 1),
    th0: R1() * TAU, drift: (R1() - 0.5) * 120, front: R1() < 0.35, side: R1() < 0.5 ? 0 : Math.PI,
  }));
  const CONF = Array.from({ length: 170 }, () => {
    const ang = R1() * TAU, sp = lerp(400, 1500, Math.pow(R1(), 0.7));
    return { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 500, size: lerp(9, 20, R1()), rot: R1() * TAU, spin: (R1() - 0.5) * 14, flut: lerp(6, 14, R1()),
      col: ['#d5fb23', '#d5fb23', '#9a4cf0', '#b77dff', '#1de165', '#ffffff', '#f4c20d'][(R1() * 7) | 0], delay: R1() * 0.12, front: R1() < 0.55 };
  });
  const BURST = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU + R1() * 0.2, len: lerp(60, 130, R1()), col: ['#d5fb23', '#ffffff', '#b77dff'][i % 3] }));

  const fxB = $('#fxBack').getContext('2d');
  const fxF = $('#fxFront').getContext('2d');
  const grid = $('#grid').getContext('2d');

  function drawGrid(t, a) {
    grid.clearRect(0, 0, W, H);
    if (a <= 0.001) return;
    const hy = 700, vx = 540;
    grid.save();
    grid.globalAlpha = a;
    // horizon glow
    const hg = grid.createLinearGradient(0, hy - 80, 0, hy + 140);
    hg.addColorStop(0, 'rgba(213,251,35,0)'); hg.addColorStop(0.45, 'rgba(213,251,35,0.10)'); hg.addColorStop(1, 'rgba(213,251,35,0)');
    grid.fillStyle = hg; grid.fillRect(0, hy - 80, W, 220);
    grid.lineWidth = 2;
    // receding horizontal lines, scrolling toward the viewer
    const scroll = (t * 0.9) % 1;
    for (let i = 0; i < 14; i++) {
      const z = 0.6 + (i + 1 - scroll) * 0.9;
      const y = hy + 560 / z;
      if (y > H + 4) continue;
      grid.strokeStyle = `rgba(213,251,35,${(0.42 * clamp((y - hy) / 260)).toFixed(3)})`;
      grid.beginPath(); grid.moveTo(0, y); grid.lineTo(W, y); grid.stroke();
    }
    // converging lines
    for (let i = -9; i <= 9; i++) {
      const xb = vx + i * 230;
      const g = grid.createLinearGradient(0, hy, 0, H);
      g.addColorStop(0, 'rgba(213,251,35,0)'); g.addColorStop(1, 'rgba(213,251,35,0.38)');
      grid.strokeStyle = g;
      grid.beginPath(); grid.moveTo(vx + i * 6, hy); grid.lineTo(xb, H); grid.stroke();
    }
    grid.restore();
  }

  // ---------------------------------------------------------------- scenes
  function letters(arr, t0, stagger, dur, from = 112, rot = 8) {
    arr.forEach((ch, i) => {
      const p = outExpo(prog(globalT, t0 + i * stagger, dur));
      set(ch, 'transform', `translateY(${((1 - p) * from).toFixed(2)}%) rotate(${((1 - p) * rot).toFixed(2)}deg)`);
    });
  }
  let globalT = 0, frameT = 0;
  function slam(arr, t0, stagger, dur) {
    arr.forEach((ch, i) => {
      const p = prog(globalT, t0 + i * stagger, dur);
      const s = lerp(1.6, 1, outBack(p, 1.6));
      set(ch, 'opacity', clamp(p * 5).toFixed(3));
      set(ch, 'transform', `translateY(${((1 - outExpo(p)) * -30).toFixed(2)}px) scale(${s.toFixed(4)})`);
    });
  }
  const center = (e, extra = '') => `translateX(-50%) ${extra}`;

  function renderIntro(t) {
    const out = outCubic(prog(t, C.toUI - 0.04, 0.2));
    set(el.intro, 'opacity', (1 - out).toFixed(3));
    set(el.intro, 'transform', `translateY(${(-50 * out).toFixed(2)}px) scale(${(1 + 0.14 * out).toFixed(4)})`);
    set(el.intro, 'display', out >= 1 ? 'none' : 'block');
    if (out >= 1) return;
    const pc = outExpo(prog(t, -0.04, 0.5));
    set(el.chip, 'opacity', clamp(pc * 1.4).toFixed(3));
    set(el.chip, 'transform', center(el.chip, `translateY(${((1 - pc) * -26).toFixed(2)}px)`));
    letters(L.title, -0.06, 0.018, 0.5);
    set(el.title, 'transform', `scale(${(1 + 0.08 * (1 - outExpo(prog(t, -0.06, 0.5)))).toFixed(4)})`);
    const pt = outExpo(prog(t, C.released - 0.05, 0.35));
    set(el.tagBg, 'transform', `skewX(-12deg) scaleX(${pt.toFixed(4)})`);
    set(el.tag, 'transform', center(el.tag, `scale(${(1 + 0.1 * decay(t, C.released, 7)).toFixed(4)})`));
    letters(L.tag, C.released - 0.02, 0.022, 0.45);
  }

  function renderUI(t) {
    const pin = outExpo(prog(t, C.toUI + 0.06, 0.55));
    const vis = t > C.toUI - 0.05 && t < C.bigWin + 0.05;
    set(el.ui, 'display', vis ? 'block' : 'none');
    if (!vis) return;
    set(el.ui, 'opacity', pin.toFixed(3));
    set(el.panel, 'transform', `translateY(${((1 - pin) * 220).toFixed(2)}px)`);

    // header: CALL IT. FLIP IT. → STREAK n / 20 → ONE MORE… → 10 IN A ROW
    const callOn = t < LANDS[0] - 0.08;
    set(el.hdrCall, 'visibility', callOn ? 'visible' : 'hidden');
    if (callOn) {
      letters(L.callA, C.callIt - 0.05, 0.022, 0.45);
      letters(L.callB, C.flipIt - 0.05, 0.022, 0.45);
    }
    // counters and the streak index follow the frame time, not the sub-frame time,
    // so motion blur never averages two different numbers into a smear
    let k = -1;
    for (let i = 0; i < 10; i++) if (frameT >= LANDS[i]) k = i;
    const oneOn = t >= C.oneMore - 0.02 && t < C.tenth;
    set(el.hdrOne, 'visibility', oneOn ? 'visible' : 'hidden');
    if (oneOn) letters(L.one, C.oneMore - 0.04, 0.025, 0.45);
    const streakOn = k >= 0 && !oneOn;
    set(el.hdrStreak, 'visibility', streakOn ? 'visible' : 'hidden');
    if (streakOn) {
      const tl = LANDS[k];
      setText(el.streakLabel, k === 9 ? '10 IN A ROW' : `STREAK ${k + 1} / 20`);
      set(el.streakLabel, 'color', k === 9 ? '#d5fb23' : '#cfccd9');
      setText(el.mult, fmtMult(MULTS[k]));
      setText(el.multEcho, fmtMult(MULTS[k]));
      const big = k === 9 ? 1.1 : 1;
      const punch = 1 + (k === 9 ? 0.5 : 0.28) * (1 - outExpo(prog(t, tl, 0.4))) + (k === 9 ? 0.16 * decay(t, C.rehit, 9) : 0);
      set(el.mult, 'transform', `scale(${(punch * big).toFixed(4)})`);
      if (k === 9 && t < C.rehit) {
        // the outline echo holds behind the number through the hold
        const pe = prog(t, tl, C.rehit - tl);
        set(el.multEcho, 'opacity', (0.9 * (1 - smooth(clamp((pe - 0.6) / 0.4)))).toFixed(3));
        set(el.multEcho, 'transform', `scale(${((1 + 0.17 * outQuart(prog(t, tl, 0.6)) + 0.04 * pe) * big).toFixed(4)})`);
      } else {
        const pe = prog(t, k === 9 ? C.rehit : tl, 0.55);
        set(el.multEcho, 'opacity', pe > 0 && pe < 1 ? (0.9 * (1 - pe)).toFixed(3) : '0');
        set(el.multEcho, 'transform', `scale(${((1 + 0.24 * outCubic(pe)) * big).toFixed(4)})`);
      }
      set(el.streakLabel, 'opacity', clamp((t - tl) / 0.12 + (k > 0 ? 1 : 0)).toFixed(3));
    }

    // dots fill with each result
    dots.forEach(({ img }, i) => {
      if (i > 9) return;
      const p = prog(t, LANDS[i], 0.3);
      set(img, 'opacity', p > 0 ? '1' : '0');
      set(img, 'transform', `scale(${(p > 0 ? 1 + 0.5 * (1 - outBack(p, 2)) : 0).toFixed(3)})`);
    });

    // taps + button presses
    let tap = null;
    C.calls.forEach((c, i) => {
      const tt = START[i] - 0.06;
      const p = prog(t, tt, 0.42);
      if (p > 0 && p < 1) tap = { c, p };
    });
    for (const [btn, c] of [[el.btnHeads, 'H'], [el.btnTails, 'T']]) {
      let press = 0;
      C.calls.forEach((cc, i) => { if (cc === c) press = Math.max(press, bump(prog(t, START[i] - 0.06, 0.16))); });
      set(btn, 'transform', `scale(${(1 - 0.045 * press).toFixed(4)})`);
      set(btn, 'filter', `brightness(${(1 + 0.25 * press).toFixed(3)})`);
    }
    if (tap) {
      set(el.tap, 'opacity', (0.95 * (1 - tap.p)).toFixed(3));
      set(el.tap, 'transform', `translate(${tap.c === 'H' ? 243 : 657}px, 601px) scale(${(0.45 + 0.9 * outCubic(tap.p)).toFixed(3)})`);
    } else set(el.tap, 'opacity', '0');

    // cash out
    const active = k >= 0;
    set(el.cashFill, 'opacity', active ? '1' : '0');
    set(el.cashout, 'color', active ? '#14121c' : '#6f6b7d');
    if (active) {
      const prev = k > 0 ? MULTS[k - 1] * 10 : 0;
      const v = lerp(prev, MULTS[k] * 10, outCubic(prog(frameT, LANDS[k], 0.22)));
      setText(el.cashAmt, money(v));
      set(el.cashout, 'transform', `scale(${(1 + 0.03 * decay(t, LANDS[k], 9)).toFixed(4)})`);
    } else setText(el.cashAmt, '');

    // dim the controls while the last flip hangs in the air
    const dim = smooth(prog(t, C.oneMore, 0.25)) * (1 - smooth(prog(t, C.tenth, 0.2)));
    set(el.dim, 'opacity', dim.toFixed(3));
  }

  function renderWin(t) {
    const vis = t > C.bigWin - 0.02 && t < C.end + 0.12;
    set(el.win, 'display', vis ? 'block' : 'none');
    if (!vis) return;
    const out = outCubic(prog(t, C.end - 0.03, 0.12));
    set(el.win, 'opacity', (1 - out).toFixed(3));
    set(el.win, 'transform', `scale(${(1 + 0.08 * out).toFixed(4)})`);
    slam(L.win, C.bigWin + 0.02, 0.03, 0.4);
    const pulse = 1 + 0.06 * decay(t, C.pulse, 7) + 0.04 * decay(t, C.amountDone, 8);
    set(el.winTitle, 'transform', `scale(${pulse.toFixed(4)})`);
    const pa = prog(frameT, C.bigWin + 0.12, C.amountDone - C.bigWin - 0.12);
    setText(el.winAmtWord, money(10035.2 * outCubic(pa)));
    set(el.winAmt, 'opacity', clamp((t - C.bigWin - 0.1) / 0.08).toFixed(3));
    set(el.winAmt, 'transform', `scale(${(pulse * (1 + 0.08 * (1 - outExpo(prog(t, C.bigWin + 0.1, 0.4))))).toFixed(4)})`);
    const pp = prog(t, C.pill, 0.45);
    set(el.winPill, 'opacity', clamp(pp * 4).toFixed(3));
    set(el.winPill, 'transform', center(el.winPill, `translateY(${((1 - outExpo(pp)) * 24).toFixed(2)}px) scale(${(0.8 + 0.2 * outBack(pp, 2)).toFixed(4)})`));
    rowCoins.forEach((r, i) => {
      const p = prog(t, C.row + i * 0.045, 0.4);
      set(r, 'opacity', clamp(p * 4).toFixed(3));
      set(r, 'transform', `scale(${(0.2 + 0.8 * outBack(p, 2.2)).toFixed(4)}) rotateX(${((1 - outCubic(p)) * 180).toFixed(1)}deg)`);
    });
  }

  function renderEnd(t) {
    const vis = t > C.end - 0.3;
    set(el.end, 'display', vis ? 'block' : 'none');
    if (!vis) return;
    const pl = outExpo(prog(t, C.end + 0.17, 0.6)); // after the coin has dropped past it
    set(el.logo, 'opacity', clamp(pl * 1.3).toFixed(3));
    set(el.logo, 'transform', center(el.logo, `translateY(${((1 - pl) * -28).toFixed(2)}px)`));
    letters(L.end, C.end + 0.18, 0.035, 0.55);
    set(el.endTitle, 'transform', `scale(${(1 + 0.04 * decay(t, C.cta, 7)).toFixed(4)})`);
    const pc = prog(t, C.cta - 0.04, 0.5);
    set(el.cta, 'opacity', clamp(pc * 4).toFixed(3));
    set(el.cta, 'transform', center(el.cta, `translateY(${((1 - outExpo(pc)) * 26).toFixed(2)}px) scale(${(0.82 + 0.18 * outBack(pc, 2.2) + 0.015 * Math.sin((t - C.cta) * 5) * prog(t, C.cta + 0.4, 0.3)).toFixed(4)})`));
    set(el.legal, 'opacity', (0.95 * outCubic(prog(t, C.cta + 0.2, 0.5))).toFixed(3));
  }

  function renderBackgrounds(t) {
    const ui = smooth(prog(t, C.toUI - 0.04, 0.26));
    const win = t >= C.bigWin ? 1 : 0;
    const end = smooth(prog(t, C.end - 0.03, 0.12));
    set(el.bgIntro, 'opacity', (1 - ui).toFixed(3));
    set(el.bgUI, 'opacity', (ui * (1 - win)).toFixed(3));
    set(el.bgWin, 'opacity', (win * (1 - end)).toFixed(3));
    set(el.bgEnd, 'opacity', end.toFixed(3));
    set(el.rays, 'transform', `rotate(${(t * 7).toFixed(2)}deg) scale(${(1 + 0.06 * decay(t, C.pulse, 5)).toFixed(4)})`);
    drawGrid(t, 1 - ui);
  }

  function renderFX(t) {
    fxB.clearRect(0, 0, W, H);
    fxF.clearRect(0, 0, W, H);
    // twinkles in the intro and the end card
    const starA = (1 - smooth(prog(t, C.toUI - 0.05, 0.3))) + smooth(prog(t, C.end, 0.4));
    if (starA > 0.01) for (const s of STARS) drawStar(fxB, s.x, s.y, s.s * (0.6 + 0.4 * Math.sin(t * s.sp + s.ph)), starA * (0.35 + 0.35 * Math.sin(t * s.sp * 1.3 + s.ph)), s.lime ? '213,251,35' : '255,255,255');

    // ring burst from the coin on the snare
    const pr = prog(t, C.burst - 0.02, 0.6);
    if (pr > 0 && pr < 1 && t < C.toUI + 0.2) {
      fxB.save();
      fxB.strokeStyle = `rgba(213,251,35,${(0.9 * (1 - pr)).toFixed(3)})`;
      fxB.lineWidth = 10 * (1 - pr) + 1.5;
      fxB.beginPath(); fxB.arc(INTRO.x, INTRO.y, INTRO.R * (1.05 + 1.0 * outCubic(pr)), 0, TAU); fxB.stroke();
      fxB.restore();
    }

    // the main coin
    const mc = mainCoin(t);
    if (mc) {
      drawCoin(fxF, mc.x, mc.y, mc.R, mc.theta, { ring: mc.ring, shadow: mc.shadow, sheen: mc.sheen });
      // landing sparkle in the intro
      const ps = prog(t, C.coinLand, 0.4);
      if (ps > 0 && ps < 1 && t < C.toUI) drawStar(fxF, INTRO.x + INTRO.R * 0.62, INTRO.y - INTRO.R * 0.62, 34 * bump(ps), bump(ps));
    }

    // the 10th flip: win burst
    // bursts out fast, then lingers and drifts through the hold so the frame stays lit, fading into the drop
    const pb = prog(t, C.tenth, C.bigWin - C.tenth);
    if (pb > 0 && pb < 1) {
      const pr = 0.74 * outQuart(prog(t, C.tenth, 0.7)) + 0.12 * pb;
      const fade = 1 - smooth(clamp((pb - 0.6) / 0.4));
      for (const b of BURST) {
        const r0 = SLOT.R + 30 + 120 * pr, r1 = r0 + b.len * (1 - 0.5 * pr);
        fxF.strokeStyle = b.col;
        fxF.globalAlpha = fade;
        fxF.lineWidth = 5;
        fxF.lineCap = 'round';
        fxF.beginPath();
        fxF.moveTo(SLOT.x + Math.cos(b.a) * r0, SLOT.y + Math.sin(b.a) * r0);
        fxF.lineTo(SLOT.x + Math.cos(b.a) * r1, SLOT.y + Math.sin(b.a) * r1);
        fxF.stroke();
      }
      fxF.globalAlpha = 1;
      fxF.strokeStyle = `rgba(46,230,166,${(0.9 * fade).toFixed(3)})`;
      fxF.lineWidth = 8 * (1 - pr) + 3;
      fxF.beginPath(); fxF.arc(SLOT.x, SLOT.y, SLOT.R + 40 + 200 * pr, 0, TAU); fxF.stroke();
    }
    // a second, quicker ring when the hit returns after the hold
    const ph = prog(t, C.rehit, 0.4);
    if (ph > 0 && ph < 1) {
      fxF.strokeStyle = `rgba(46,230,166,${(0.75 * (1 - ph)).toFixed(3)})`;
      fxF.lineWidth = 6 * (1 - ph) + 1.5;
      fxF.beginPath(); fxF.arc(SLOT.x, SLOT.y, SLOT.R + 30 + 170 * outCubic(ph), 0, TAU); fxF.stroke();
    }

    // BIG WIN: top coin, raining coins, confetti
    if (t >= C.bigWin && t < C.end + 0.12) {
      const wa = 1 - outCubic(prog(t, C.end - 0.03, 0.12));
      for (const r of RAIN) {
        const s = t - C.bigWin;
        const y = r.y0 + r.v * s;
        if (y < -80 || y > H + 80) continue;
        drawCoin(r.front ? fxF : fxB, r.x + Math.sin(s * 2 + r.th0) * r.drift * 0.3, y, r.R, r.th0 + r.side + r.w * s, { thick: 0.2, alpha: wa * (r.front ? 1 : 0.85) });
      }
      const pt = outBack(prog(t, C.bigWin, 0.45), 1.4);
      drawCoin(fxF, 540, lerp(-160, 270, pt), 120, (t - C.bigWin) * 8 + Math.PI, { alpha: wa, sheen: 0.1 });
      for (const c of CONF) {
        const s = t - C.bigWin - c.delay;
        if (s < 0) continue;
        const k = 1.6, e = (1 - Math.exp(-k * s)) / k;
        const x = 540 + c.vx * e, y = 560 + c.vy * e + 380 * s * s;
        if (y > H + 40) continue;
        const ctx = c.front ? fxF : fxB;
        ctx.save();
        ctx.globalAlpha = wa;
        ctx.translate(x, y);
        ctx.rotate(c.rot + c.spin * s);
        ctx.scale(Math.cos(c.flut * s), 1);
        ctx.fillStyle = c.col;
        ctx.fillRect(-c.size / 2, -c.size * 0.28, c.size, c.size * 0.56);
        ctx.restore();
      }
    }

    // end card coin: flips in and settles tails-up (gold)
    if (t >= C.end - 0.05) {
      const p = prog(t, C.end - 0.05, 0.55);
      const y = lerp(-200, 470, outBack(p, 1.15));
      const th = lerp(Math.PI + 4 * TAU, Math.PI, outQuart(p)) + (t > C.end + 0.5 ? 0.06 * Math.sin((t - C.end - 0.5) * 3) : 0);
      drawCoin(fxF, 540, y + (t > C.end + 0.5 ? 6 * Math.sin((t - C.end - 0.5) * 2.4) : 0), 150, th, { sheen: 0.05 });
      const pg = prog(t, C.end + 0.5, 0.45);
      if (pg > 0 && pg < 1) drawStar(fxF, 540 + 150 * 0.66, 470 - 150 * 0.66, 40 * bump(pg), bump(pg));
    }
  }

  // camera shake on the hits
  const HITS = [[C.title, 6, 9], [C.released, 4, 10], [C.coinLand, 7, 9], [C.burst, 6, 9], ...LANDS.slice(0, 9).map((l) => [l, 2.5, 12]), [C.tenth, 9, 7], [C.rehit, 4, 10], [C.bigWin, 14, 5], [C.end + 0.5, 4, 9]];
  function shake(t) {
    let a = 0;
    for (const [t0, amp, k] of HITS) a += amp * decay(t, t0, k);
    return [a * (Math.sin(t * 91) * 0.6 + Math.sin(t * 57 + 1) * 0.4), a * (Math.sin(t * 79 + 2) * 0.6 + Math.sin(t * 133) * 0.4), a];
  }

  function render(t) {
    globalT = t;
    frameT = Math.round(t * C.fps) / C.fps;
    const [sx, sy, a] = shake(t);
    const push = t >= C.tenth && t < C.bigWin ? 0.06 * inCubic(prog(t, C.tenth + 0.2, C.bigWin - C.tenth - 0.2)) : 0;
    set(cam, 'transform', `translate(${sx.toFixed(2)}px, ${(sy + push * 245).toFixed(2)}px) scale(${(1 + a * 2.2 / 1080 + push).toFixed(4)})`);
    renderBackgrounds(t);
    renderIntro(t);
    renderUI(t);
    renderWin(t);
    renderEnd(t);
    renderFX(t);
    const fl = Math.max(0.92 * (t >= C.bigWin ? 1 - outExpo(prog(t, C.bigWin, 0.45)) : 0), 0.6 * (t >= C.end - 0.02 ? 1 - outExpo(prog(t, C.end - 0.02, 0.36)) : 0));
    set(el.flash, 'opacity', fl.toFixed(3));
  }

  // motion-blur budget (render.mjs averages this many sub-frames per frame)
  const BLUR = [
    [C.coinUp - 0.02, C.coinLand + 0.15, 10], [C.burst - 0.05, C.burst + 0.25, 8], [C.toUI - 0.05, C.toUI + 0.5, 8],
    ...LANDS.map((l, k) => [START[k] - 0.02, l + 0.12, k === 9 ? 10 : 10]),
    [C.rehit - 0.02, C.rehit + 0.3, 6], [C.bigWin - 0.02, C.end, 6], [C.end - 0.05, C.end + 0.6, 10],
    [-1, 0.2, 6], [C.released - 0.05, C.released + 0.2, 6],
  ];
  function subframesAt(t) {
    let n = 3;
    for (const [a, b, k] of BLUR) if (t >= a && t <= b) n = Math.max(n, k);
    return n;
  }

  async function boot() {
    await Promise.all([IMG.H.decode(), IMG.T.decode(), ...[...document.images].map((i) => (i.src ? i.decode().catch(() => {}) : null))]);
    await document.fonts.load('200px Schabo');
    await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 30px Geist`)));
    await document.fonts.ready;
    window.__seek = render;
    window.__subframes = subframesAt;
    window.__duration = C.duration;
    render(parseFloat(params.get('t') || '0'));
    window.__ready = true;
    if (!RENDER && !params.has('t')) preview();
  }
  function preview() {
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
    addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); });
  }
  boot().catch((e) => { window.__error = String(e && e.stack || e); console.error(e); });
})();
