/* Order Up — 15 s launch film.
 *
 * Every frame is a pure function of time: window.__seek(t) paints the frame at
 * t seconds, so frames can be rendered in any order, in parallel, and at
 * sub-frame times for motion blur (see render.mjs). No timeline state, no
 * CSS animations — keyframes are evaluated directly from `t`.
 */
(() => {
  'use strict';

  const C = window.CUES;
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render');

  // ---------- game data ----------
  const NUMBERS = [6, 14, 27, 39, 52, 71, 88, 97];
  const LETTERS = ['O', 'R', 'D', 'E', 'R', 'U', 'P', '!'];
  const PAY = [0, 0, 0, 17.2, 35, 90, 240, 1000];
  const PAY_LABEL = ['0x', '0x', '0x', '17.2x', '35x', '90x', '240x', '1000x'];
  const BET = 10;

  // ---------- world geometry (game UI units, window is 1600 × 919) ----------
  const CW = 105, CH = 146, GAP = 15, ROW_X = 572, ROW_Y = 350;
  const WORD_GAP = 30; // space between ORDER and UP! while the cards spell the title
  const slotX = (i) => ROW_X + i * (CW + GAP);
  const ROW_CX = ROW_X + (8 * CW + 7 * GAP) / 2;
  const CARD8_X = slotX(7) + CW / 2;
  const PAY_CELL = 1050 / 8;
  const titleRight = (i) => (i < 0 ? 0 : slotX(i) + CW + (i >= 5 ? WORD_GAP : 0) - ROW_X);
  const gameRight = (i) => (i < 0 ? 0 : slotX(i) + CW - ROW_X);

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, d) => clamp((t - t0) / d);
  const EZ = {};
  const E = (name, p) => (EZ[name] || (EZ[name] = gsap.parseEase(name)))(clamp(p));
  const bump = (p) => Math.sin(Math.PI * clamp(p));
  const decay = (t, t0, k) => (t < t0 ? 0 : Math.exp(-(t - t0) * k));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], p))).join(',')})`; };

  /** Piecewise keyframes: [[time, value, easeIntoThisKey], ...]; value = number | number[] */
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (t <= k[0]) {
        const a = keys[i - 1];
        const p = E(k[2] || 'none', (t - a[0]) / (k[0] - a[0]));
        return Array.isArray(k[1]) ? k[1].map((v, j) => lerp(a[1][j], v, p)) : lerp(a[1], k[1], p);
      }
    }
    return keys[keys.length - 1][1];
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const set = (e, prop, v) => { if (e._c === undefined) e._c = {}; if (e._c[prop] !== v) { e._c[prop] = v; e.style[prop] = v; } };
  const setText = (e, v) => { if (e._t !== v) { e._t = v; e.textContent = v; } };
  const fmtX = (v) => {
    if (v >= 100) return Math.round(v) + 'X';
    const s = (Math.round(v * 10) / 10).toFixed(1);
    return (s.endsWith('.0') ? s.slice(0, -2) : s) + 'X';
  };
  const fmtUsd = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // =====================================================================
  // Build DOM
  // =====================================================================
  const goatSvg = '<svg><use href="#goat"/></svg>';

  // game cards
  const cardsEl = $('#cards');
  const cards = [];
  for (let i = 0; i < 8; i++) {
    const slot = mk('div', 'slot', cardsEl);
    const halo = mk('div', 'halo', slot);
    const card = mk('div', 'card', slot);
    mk('div', 'face back', card, goatSvg);
    const front = mk('div', 'face front', card);
    const gL = mk('div', 'g letter', front, `<span>${LETTERS[i]}</span>`);
    const gN = mk('div', 'g num', front, `<span>${NUMBERS[i]}</span>`);
    const dim = mk('div', 'dim', slot);
    const ring = mk('div', 'ring', slot);
    cards.push({ slot, card, gL, gN, dim, ring, halo });
  }

  // paytable
  const payEl = $('#paytable');
  const payCells = [];
  for (let i = 0; i < 8; i++) {
    const c = mk('div', 'pcell', payEl);
    const idx = mk('div', 'idx', c, String(i + 1));
    const mul = mk('div', 'mul', c, '–');
    payCells.push({ c, idx, mul });
  }
  const payHi = $('#payHi');

  // history pills: newest result is added on the right
  const pillsEl = $('#pills');
  const PILLS = ['0x', '17.2x', '0x', '0x', '0x', '1000x'];
  const pills = PILLS.map((txt, i) => {
    const p = mk('div', 'pill' + (txt !== '0x' ? ' win' : ''), pillsEl, txt);
    return p;
  });

  // scene 1 words, split into letters
  function splitWord(word) {
    const text = word.textContent;
    word.textContent = '';
    return [...text].map((ch) => mk('span', 'ch', word, ch === ' ' ? '&nbsp;' : ch));
  }
  const rows = ['#row1', '#row2', '#row3'].map((sel) => {
    const row = $(sel);
    const word = row.querySelector('.word');
    return { row, word, letters: splitWord(word), tag: row.querySelector('.tagbg') };
  });
  const endWord = $('#endTitle .word');
  const endLetters = splitWord(endWord);
  endLetters.slice(6).forEach((ch) => ch.classList.add('up')); // "UP!" in lime

  // decorative depth cards (scene 1 + end card)
  function decoCards(parent, specs) {
    return specs.map((s) => {
      const d = mk('div', 'deco ' + (s.n ? 'up' : 'down'), parent, s.n ? `<span>${s.n}</span>` : goatSvg);
      return { d, s };
    });
  }
  const s1Deco = decoCards($('#s1deco'), [
    { x: 150, y: 170, r: -16, n: 97, blur: 2.5, sc: 1.0, dir: 1 },
    { x: 1660, y: 150, r: 13, n: 0, blur: 6, sc: 0.92, dir: -1 },
    { x: 70, y: 640, r: 11, n: 0, blur: 9, sc: 1.25, dir: 1 },
    { x: 1700, y: 640, r: -9, n: 6, blur: 3, sc: 1.08, dir: -1 },
    { x: 360, y: 880, r: 22, n: 52, blur: 12, sc: 0.8, dir: -1 },
    { x: 1450, y: 900, r: -20, n: 0, blur: 14, sc: 0.85, dir: 1 },
  ]);
  const endDeco = decoCards($('#endDeco'), [
    { x: 150, y: 130, r: -14, n: 88, blur: 3, sc: 1.05, dir: 1 },
    { x: 1640, y: 110, r: 12, n: 0, blur: 7, sc: 0.95, dir: -1 },
    { x: 60, y: 610, r: 9, n: 0, blur: 10, sc: 1.2, dir: 1 },
    { x: 1690, y: 600, r: -11, n: 97, blur: 3, sc: 1.1, dir: -1 },
    { x: 330, y: 860, r: 20, n: 14, blur: 12, sc: 0.8, dir: -1 },
    { x: 1440, y: 880, r: -18, n: 0, blur: 14, sc: 0.85, dir: 1 },
  ]);

  // end-card mini cards
  const endCardsEl = $('#endCards');
  const endCards = NUMBERS.map((n, i) => {
    const slot = mk('div', 'eslot', endCardsEl);
    slot.style.left = i * 104 + 'px';
    const card = mk('div', 'card', slot);
    mk('div', 'face back', card, goatSvg);
    mk('div', 'face front', card, `<div class="g num"><span>${n}</span></div>`);
    return { slot, card };
  });

  // world-anchored type positions (centred on these world points)
  const W_CHIP = [ROW_CX + WORD_GAP / 2, 283];
  const W_TAG = [ROW_CX + WORD_GAP / 2, 566];
  const W_CAP = [ROW_CX, 648];
  const W_READOUT = [ROW_CX, 648];
  const W_BEAT88 = [CARD8_X, 318];
  const BET_BTN = [244, 515];

  // =====================================================================
  // Grain tiles (static per output frame so sub-frame blur keeps it crisp)
  // =====================================================================
  const grainCv = $('#grain'), grainCtx = grainCv.getContext('2d');
  const grainTiles = [];
  {
    const R = rng(7);
    for (let k = 0; k < 6; k++) {
      const img = grainCtx.createImageData(960, 540);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = (R() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      grainTiles.push(img);
    }
  }

  // =====================================================================
  // Scene 1 hole: the counter of the "O" in ORIGINAL becomes a window
  // into the next scene, then we zoom through it.
  // =====================================================================
  let zoomOrigin = [960, 540];
  function buildHole() {
    const oSpan = rows[1].letters[0];
    const probe = mk('span', '', rows[1].word);
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    const penX = oSpan.getBoundingClientRect().left;
    const baseY = probe.getBoundingClientRect().top;
    probe.remove();

    const fs = 330, S = 700, ox = 100, oy = 520;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    g.font = `${fs}px Schabo`;
    g.fillStyle = '#fff';
    g.fillText('O', ox, oy);
    const a = g.getImageData(0, 0, S, S).data;
    const ink = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) ink[i] = a[i * 4 + 3] > 110 ? 1 : 0;
    // flood-fill the outside; whatever empty space is left is the counter
    const outside = new Uint8Array(S * S);
    const stack = [0];
    outside[0] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % S, y = (p / S) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < S - 1 ? p + 1 : -1, y > 0 ? p - S : -1, y < S - 1 ? p + S : -1];
      for (const q of nb) if (q >= 0 && !outside[q] && !ink[q]) { outside[q] = 1; stack.push(q); }
    }
    let hole = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) hole[i] = !ink[i] && !outside[i] ? 1 : 0;
    // erode 3px so the (magnified) mask edge always hides under the glyph's ink
    for (let it = 0; it < 3; it++) {
      const n = new Uint8Array(S * S);
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        const p = y * S + x;
        n[p] = hole[p] && hole[p - 1] && hole[p + 1] && hole[p - S] && hole[p + S] ? 1 : 0;
      }
      hole = n;
    }
    let x0 = S, y0 = S, x1 = 0, y1 = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (hole[y * S + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }

    const mcv = document.createElement('canvas');
    mcv.width = 1920; mcv.height = 1080;
    const mg = mcv.getContext('2d');
    mg.fillStyle = '#000';
    mg.fillRect(0, 0, 1920, 1080);
    const md = mg.getImageData(0, 0, 1920, 1080);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!hole[y * S + x]) continue;
      const px = Math.round(penX + x - ox), py = Math.round(baseY + y - oy);
      if (px >= 0 && px < 1920 && py >= 0 && py < 1080) md.data[(py * 1920 + px) * 4 + 3] = 0;
    }
    mg.putImageData(md, 0, 0);
    const url = mcv.toDataURL('image/png');
    const s1bg = $('#s1bg');
    for (const k of ['webkitMaskImage', 'maskImage']) s1bg.style[k] = `url(${url})`;
    for (const k of ['webkitMaskSize', 'maskSize']) s1bg.style[k] = '1920px 1080px';
    for (const k of ['webkitMaskRepeat', 'maskRepeat']) s1bg.style[k] = 'no-repeat';
    zoomOrigin = [penX + ((x0 + x1) / 2 - ox), baseY + ((y0 + y1) / 2 - oy)];
  }

  // =====================================================================
  // Camera (world → screen). Framings are [x, y, zoom, rotX, rotY, rotZ].
  // =====================================================================
  const F = {
    title: [ROW_CX + WORD_GAP / 2, 428, 1.7, 0, -2.5, 0],
    titleEnd: [ROW_CX + WORD_GAP / 2, 428, 1.79, 0, 2.5, 0],
    full: [800, 468, 1.05, 7, -9, 0],
    pick: [840, 478, 1.12, 2.5, 5, 0],
    pickEnd: [840, 478, 1.16, 2, 4, 0],
    bet: [690, 470, 1.38, 1.5, 6, 0],
    betEnd: [690, 472, 1.43, 1.5, 6, 0],
    game: [ROW_CX, 632, 1.42, 0, 0, 0],
    gameEnd: [ROW_CX, 632, 1.52, 0, 0, -0.6],
    card8: [CARD8_X, 410, 2.45, 0, 0, -2],
    card8End: [CARD8_X, 410, 2.55, 0, 0, -2.4],
    win: [ROW_CX, 590, 1.2, 0, 0, 0],
    winEnd: [ROW_CX, 590, 1.27, 0, 0, 0.6],
  };
  const CAM = [
    [0, F.title], [C.toUI, F.titleEnd],
    [C.toUI + 0.72, F.full, 'expo.out'],
    [5.35, F.pick, 'power2.inOut'],
    [C.hitBet, F.pickEnd],
    [7.25, F.bet, 'power2.inOut'],
    [C.click + 0.02, F.betEnd],
    [C.flips[0] + 0.02, F.game, 'power3.inOut'],
    [10.45, F.gameEnd],
    [11.12, F.card8, 'power2.inOut'],
    [C.reveal, F.card8End],
    [C.reveal + 0.7, F.win, 'expo.out'],
    [C.endFlip, F.winEnd],
  ];
  const w2s = (wx, wy, c) => {
    const dx = (wx - c[0]) * c[2], dy = (wy - c[1]) * c[2], a = (c[5] * Math.PI) / 180;
    return [960 + dx * Math.cos(a) - dy * Math.sin(a), 540 + dx * Math.sin(a) + dy * Math.cos(a)];
  };

  // screen shake: [time, amplitude px, decay rate]
  const SHAKES = [
    [C.words[0], 9, 10], [C.words[1], 9, 10], [C.words[2], 11, 10],
    [C.zoomEnd, 12, 7], [C.tagline, 4, 9], [C.toUI, 7, 8], [C.click, 5, 10],
    ...C.flips.map((t, i) => [t, 2.5 + i * 0.7, 11]),
    [C.reveal, 28, 4.2], [C.payout, 6, 8], [C.pulses[0], 5, 9], [C.pulses[1], 5, 9],
    [C.endFlip + 0.25, 6, 8], [C.final, 9, 7],
  ];
  function shake(t) {
    let a = 0;
    for (const [t0, amp, k] of SHAKES) a += amp * decay(t, t0, k);
    return [
      a * (Math.sin(t * 91.7) * 0.55 + Math.sin(t * 57.3 + 1.7) * 0.45),
      a * (Math.sin(t * 83.3 + 0.4) * 0.55 + Math.sin(t * 121.1 + 2.2) * 0.45),
      a * 0.035 * Math.sin(t * 67.9 + 3.1),
      a,
    ];
  }

  // =====================================================================
  // Particles (deterministic, analytic ballistic motion with drag)
  // =====================================================================
  const COLORS = ['#d5fb23', '#d5fb23', '#d5fb23', '#ffffff', '#ffffff', '#1de165', '#1de165', '#b7a8ff', '#fc325c'];
  const particles = [];
  function burst(seed, n, o) {
    const R = rng(seed);
    for (let i = 0; i < n; i++) {
      const ang = o.ang != null ? o.ang + (R() - 0.5) * o.spread : R() * Math.PI * 2;
      const sp = lerp(o.v0, o.v1, Math.pow(R(), 0.7));
      particles.push({
        t0: o.t0 + R() * (o.jitter || 0), x: o.x + (R() - 0.5) * (o.w || 0), y: o.y + (R() - 0.5) * (o.h || 0),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.lift || 0),
        k: o.drag || 1.6, g: o.g || 1500, size: lerp(9, 22, R()), ar: lerp(0.35, 0.65, R()),
        rot: R() * 6.28, spin: (R() - 0.5) * 18, flut: lerp(5, 13, R()), ph: R() * 6.28,
        col: COLORS[(R() * COLORS.length) | 0], back: R() < (o.backShare || 0), life: o.life || 3,
        kind: o.kind || 'conf',
      });
    }
  }
  burst(11, 200, { t0: C.hero, x: 960, y: 440, w: 500, h: 120, v0: 650, v1: 2100, lift: 520, drag: 1.7, backShare: 0.45 });
  burst(12, 110, { t0: C.payout - 0.04, jitter: 0.16, x: 30, y: 1110, w: 60, ang: -Math.PI * 0.31, spread: 0.8, v0: 1300, v1: 2900, drag: 1.25, backShare: 0.35 });
  burst(13, 110, { t0: C.payout - 0.04, jitter: 0.16, x: 1890, y: 1110, w: 60, ang: -Math.PI * 0.69, spread: 0.8, v0: 1300, v1: 2900, drag: 1.25, backShare: 0.35 });
  burst(14, 60, { t0: C.reveal, x: 960, y: 540, v0: 1400, v1: 3400, drag: 5, g: 300, life: 0.55, kind: 'spark' });
  burst(15, 60, { t0: C.pulses[0], x: 960, y: 430, w: 900, h: 200, v0: 300, v1: 1200, lift: 700, drag: 1.4, backShare: 0.5 });

  const fxB = $('#fxBack').getContext('2d'), fxF = $('#fxFront').getContext('2d');
  function pos(p, s) {
    const e = Math.exp(-p.k * s), f = (1 - e) / p.k;
    return [p.x + p.vx * f, p.y + (p.vy + p.g / p.k) * f - (p.g / p.k) * s];
  }
  function drawFX(t, cam) {
    fxB.clearRect(0, 0, 1920, 1080);
    fxF.clearRect(0, 0, 1920, 1080);
    if (t < C.reveal - 0.01 || t > C.endFlip + 0.05) { drawFlipSparks(t, cam); return; }
    // shockwave rings at card 8 (camera is centred on it at the reveal)
    for (const [d, w, col] of [[0, 34, 'rgba(213,251,35,'], [0.07, 10, 'rgba(255,255,255,']]) {
      const p = prog(t, C.reveal + d, 0.75);
      if (p > 0 && p < 1) {
        fxF.beginPath();
        fxF.arc(960, 540, 60 + 1500 * E('power2.out', p), 0, Math.PI * 2);
        fxF.lineWidth = w * (1 - p);
        fxF.strokeStyle = col + (0.85 * (1 - p)).toFixed(3) + ')';
        fxF.stroke();
      }
    }
    const fade = 1 - prog(t, C.endFlip - 0.25, 0.25);
    for (const p of particles) {
      const s = t - p.t0;
      if (s < 0 || s > p.life) continue;
      const ctx = p.back ? fxB : fxF;
      const [x, y] = pos(p, s);
      if (p.kind === 'spark') {
        const [xb, yb] = pos(p, Math.max(0, s - 0.045));
        const a = (1 - s / p.life) * fade;
        ctx.strokeStyle = `rgba(230,255,120,${a.toFixed(3)})`;
        ctx.lineWidth = 4 * (1 - s / p.life) + 1;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(x, y); ctx.stroke();
        continue;
      }
      if (y > 1160 || x < -80 || x > 2000) continue;
      const sz = p.size * (p.back ? 0.7 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * s);
      ctx.scale(Math.cos(p.ph + p.flut * s), 1);
      ctx.globalAlpha = (p.back ? 0.55 : 1) * fade * (1 - prog(s, p.life - 0.4, 0.4));
      ctx.fillStyle = p.col;
      ctx.fillRect(-sz / 2, -sz * p.ar / 2, sz, sz * p.ar);
      ctx.restore();
    }
  }
  // little lime sparks when a card lands in rising order
  const FLIP_SPARKS = [];
  {
    const R = rng(21);
    C.flips.forEach((t0, i) => {
      for (let k = 0; k < 16; k++) {
        const ang = -Math.PI / 2 + (R() - 0.5) * 2.6;
        FLIP_SPARKS.push({ t0: t0 + 0.05, i, ang, sp: lerp(260, 900, R()), len: lerp(10, 26, R()) });
      }
    });
  }
  function drawFlipSparks(t, cam) {
    if (t < C.flips[0] || t > C.reveal) return;
    fxF.lineCap = 'round';
    for (const s of FLIP_SPARKS) {
      const dt = t - s.t0;
      if (dt < 0 || dt > 0.35) continue;
      const [cx, cy] = w2s(slotX(s.i) + CW / 2, ROW_Y, cam);
      const d = (s.sp * (1 - Math.exp(-6 * dt))) / 6;
      const x = cx + Math.cos(s.ang) * (d + 20), y = cy + Math.sin(s.ang) * (d + 10);
      const a = 1 - dt / 0.35;
      fxF.strokeStyle = `rgba(213,251,35,${a.toFixed(3)})`;
      fxF.lineWidth = 3.5 * a + 0.5;
      fxF.beginPath();
      fxF.moveTo(x, y);
      fxF.lineTo(x - Math.cos(s.ang) * s.len * a, y - Math.sin(s.ang) * s.len * a);
      fxF.stroke();
    }
  }

  // =====================================================================
  // RENDER
  // =====================================================================
  const el = {
    planes: $('#planes'), main: $('#mainPlane'), end: $('#endPlane'), bg: $('#bg'),
    orbL: $('.orb-lime'), orbV: $('.orb-violet'), camera: $('#camera'),
    uiWin: $('#uiWin'), sidebar: $('#sidebar'), sbItems: [...document.querySelectorAll('#sidebar .sb-item')],
    tileHi: $('#tileHi'), betBtn: $('#betBtn'), ripple: $('#ripple'), profitVal: $('#profitVal'), profitUsd: $('#profitUsd'),
    pills: pillsEl, payEl, underline: $('#underline'),
    chip: $('#titleChip'), tag: $('#titleTag'),
    capPick: $('#capPick'), capPickIn: $('#capPick .capIn'), capBet: $('#capBet'), capBetIn: $('#capBet .capIn'),
    readout: $('#readout'), readoutIn: $('#readoutIn'), beat88: $('#beat88'),
    cursor: $('#cursorWrap'), cursorSvg: $('#cursorSvg'), clickRing: $('#clickRing'),
    s1: $('#s1'), s1text: $('#s1text'),
    focus: $('#focusVignette'), scrim: $('#scrim'), hero: $('#hero'), heroRays: $('#heroRays'), heroGlow: $('#heroGlow'),
    heroStack: $('#heroStack'), heroText: $('#heroText'), heroShine: $('#heroShine'), heroTop: $('#heroTop'), echoes: [...document.querySelectorAll('.heroEcho')],
    heroSub: $('#heroSub'), heroLabel: $('#heroLabel'), heroPayout: $('#heroPayout'), flash: $('#flash'),
    endBrand: $('#endBrand'), endTitle: $('#endTitle'), endRow: $('#endRow'), endUnder: $('#endUnder'),
    endCta: $('#endCta'), endBg: $('.end-bg'),
  };

  function render(t) {
    const sh = shake(t);
    const over = 1 + (sh[3] * 2.4) / 1080; // overscan so a shake never shows the edge
    set(el.planes, 'transform', `translate(${sh[0].toFixed(2)}px, ${sh[1].toFixed(2)}px) rotate(${sh[2].toFixed(3)}deg) scale(${over.toFixed(4)})`);

    const cam = kf(t, CAM);
    renderPlanes(t);
    if (t < C.endFlip + 0.02) {
      renderBackground(t, cam);
      renderScene1(t);
      renderCamera(t, cam);
      renderUI(t);
      renderCards(t);
      renderWorldType(t);
      renderOverlays(t);
      drawFX(t, cam);
    }
    if (t > C.endFlip - 0.02) renderEnd(t);
    // grain: fixed per output frame
    if (!RENDER) {
      const fi = Math.floor(t * C.fps + 1e-6);
      if (grainCv._f !== fi) { grainCv._f = fi; grainCtx.putImageData(grainTiles[((fi % 6) + 6) % 6], 0, 0); }
    }
  }

  // ---------- full-screen card flip into the end card ----------
  function renderPlanes(t) {
    const pOut = E('power2.in', prog(t, C.endFlip - 0.2, 0.2));
    const pIn = E('power2.out', prog(t, C.endFlip, 0.3));
    const aMain = 90 * pOut, aEnd = -90 * (1 - pIn);
    set(el.main, 'transform', `rotateY(${aMain.toFixed(3)}deg) scale(${(1 - 0.1 * pOut).toFixed(4)})`);
    set(el.main, 'visibility', aMain > 89.5 ? 'hidden' : 'visible');
    set(el.end, 'transform', `rotateY(${aEnd.toFixed(3)}deg) scale(${(0.9 + 0.1 * pIn).toFixed(4)})`);
    set(el.end, 'visibility', aEnd < -89.5 ? 'hidden' : 'visible');
  }

  function renderBackground(t, cam) {
    const px = -(cam[0] - 900) * 0.05, py = -(cam[1] - 450) * 0.05;
    set(el.bg, 'transform', `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`);
    const beat = decay(t, C.zoomEnd, 3) + 0.6 * decay(t, C.toUI, 3);
    set(el.orbL, 'transform', `translate(${(Math.sin(t * 0.7) * 60).toFixed(1)}px, ${(Math.cos(t * 0.5) * 40).toFixed(1)}px) scale(${(1 + 0.15 * beat).toFixed(3)})`);
    set(el.orbV, 'transform', `translate(${(Math.cos(t * 0.6) * 70).toFixed(1)}px, ${(Math.sin(t * 0.45) * 50).toFixed(1)}px)`);
  }

  // ---------- scene 1: NEW / ORIGINAL / RELEASED → through the O ----------
  function renderScene1(t) {
    const vis = t < C.zoomEnd + 0.01;
    set(el.s1, 'display', vis ? 'block' : 'none');
    if (!vis) return;
    // anticipation, then accelerate through the counter of the O
    const pre = E('power2.out', prog(t, 1.02, C.zoomStart - 1.02));
    const zp = prog(t, C.zoomStart, C.zoomEnd - C.zoomStart);
    const s = (1 - 0.035 * pre) * (1 + 110 * E('expo.in', zp));
    const [ox, oy] = zoomOrigin;
    set(el.s1, 'transform', `translate(${ox}px, ${oy}px) scale(${s.toFixed(4)}) translate(${-ox}px, ${-oy}px)`);

    rows.forEach((r, ri) => {
      const T = C.words[ri] - 0.05;
      const punch = t < T ? 1.12 : 1 + 0.12 * (1 - E('expo.out', prog(t, T, 0.5)));
      set(r.row, 'transform', `scale(${punch.toFixed(4)})`);
      r.letters.forEach((ch, j) => {
        const p = E('expo.out', prog(t, T + j * 0.018, 0.45));
        set(ch, 'transform', `translateY(${((1 - p) * 112).toFixed(2)}%) rotate(${((1 - p) * 9).toFixed(2)}deg)`);
      });
      if (r.tag) set(r.tag, 'transform', `scaleX(${E('expo.out', prog(t, -0.08, 0.32)).toFixed(4)})`);
    });
    // the O's ink goes lime just before we fly through it
    const lime = E('power2.inOut', prog(t, 1.1, 0.14));
    set(rows[1].word, 'color', mixHex('#ffffff', '#d5fb23', lime));
    set(rows[2].word, 'color', mixHex('#ffffff', '#d5fb23', lime));

    s1Deco.forEach(({ d, s }, i) => {
      const pin = E('expo.out', prog(t, 0.02 + i * 0.05, 0.9));
      const fl = s.dir * (1 - pin);
      const x = s.x + fl * 260 + Math.sin(t * 0.9 + i) * 10;
      const y = s.y + (1 - pin) * 120 + Math.cos(t * 0.8 + i * 1.7) * 12;
      const r = s.r + fl * 30 + s.dir * t * 4;
      set(d, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${s.sc})`);
      set(d, 'filter', `blur(${s.blur}px)`);
      set(d, 'opacity', (pin * (s.blur > 8 ? 0.45 : 0.8)).toFixed(3));
    });
  }

  function renderCamera(t, cam) {
    set(el.camera, 'transform',
      `translate3d(960px, 540px, 0) rotateX(${cam[3].toFixed(3)}deg) rotateY(${cam[4].toFixed(3)}deg) rotateZ(${cam[5].toFixed(3)}deg) scale(${cam[2].toFixed(4)}) translate(${(-cam[0]).toFixed(2)}px, ${(-cam[1]).toFixed(2)}px)`);
  }

  // ---------- the game UI assembling + the interaction ----------
  function renderUI(t) {
    const T = C.toUI;
    const pw = E('expo.out', prog(t, T + 0.05, 0.7));
    set(el.uiWin, 'opacity', pw.toFixed(3));
    set(el.uiWin, 'transform', `scale(${(0.94 + 0.06 * pw).toFixed(4)})`);
    const ps = E('expo.out', prog(t, T + 0.08, 0.6));
    set(el.sidebar, 'opacity', ps.toFixed(3));
    set(el.sidebar, 'transform', `translateX(${((1 - ps) * -40).toFixed(2)}px)`);
    el.sbItems.forEach((it, i) => {
      const p = E('expo.out', prog(t, T + 0.14 + i * 0.035, 0.55));
      set(it, 'opacity', p.toFixed(3));
      set(it, 'transform', `translateX(${((1 - p) * -30).toFixed(2)}px)`);
    });

    // tiles: 3 → 8 on the 8th notes
    let tile = 0;
    C.tileSteps.forEach((ts, k) => { tile = lerp(tile, k + 1, E('power3.out', prog(t, ts - 0.02, 0.14))); });
    if (t < C.pick - 0.2) tile = 5; // assembled showing 8, snaps to 3 when the caption lands
    else if (t < C.pick) tile = lerp(5, 0, E('power3.inOut', prog(t, C.pick - 0.2, 0.2)));
    set(el.tileHi, 'transform', `translateX(${(tile * 65.33).toFixed(2)}px)`);

    // bet button hover / press
    const hover = E('power2.out', prog(t, C.hover - 0.1, 0.25)) * (1 - prog(t, C.click + 0.35, 0.3));
    const press = bump(prog(t, C.click - 0.02, 0.16));
    set(el.betBtn, 'transform', `scale(${(1 - 0.035 * press).toFixed(4)})`);
    set(el.betBtn, 'boxShadow', `0 0 0 ${(4 * hover).toFixed(2)}px rgba(209,254,0,.28), 0 0 ${(46 * hover).toFixed(1)}px rgba(209,254,0,${(0.55 * hover).toFixed(3)})`);
    const rp = prog(t, C.click, 0.5);
    set(el.ripple, 'opacity', rp > 0 && rp < 1 ? (0.6 * (1 - rp)).toFixed(3) : '0');
    set(el.ripple, 'transform', `scale(${(1 + 11 * E('expo.out', rp)).toFixed(3)})`);

    // profit on win
    const pv = t < C.reveal ? 0 : (BET * 1000 - BET) * E('power2.out', prog(t, C.reveal + 0.1, 0.5));
    const pvs = pv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setText(el.profitVal, pvs);
    setText(el.profitUsd, pvs + ' USD');

    // paytable
    const pp = E('expo.out', prog(t, T + 0.18, 0.6));
    set(el.payEl, 'opacity', pp.toFixed(3));
    set(el.payEl, 'transform', `translateY(${((1 - pp) * 40).toFixed(2)}px)`);
    payCells.forEach((c, i) => {
      const pr = prog(t, C.payReveal + i * 0.045, 0.3);
      setText(c.mul, pr > 0 ? PAY_LABEL[i] : '–');
      const e = E('back.out(2)', pr);
      set(c.mul, 'transform', pr > 0 ? `translateY(${((1 - e) * -10).toFixed(2)}px)` : 'none');
      set(c.mul, 'opacity', (pr > 0 ? clamp(pr * 3) : 0.35).toFixed(3));
      const dimmed = t > C.pick - 0.1 && t < (C.tileSteps[i - 3] ?? 0) + 0.05 && i >= 3;
      set(c.c, 'opacity', dimmed ? '0.35' : '1');
    });
    // active cell follows the run
    let hx = 0, hon = 0, lime = 0, hpop = 0;
    const hits = [...C.flips, C.reveal];
    hits.forEach((ht, i) => {
      const p = E('power3.out', prog(t, ht + 0.08, 0.16));
      if (p > 0) { hx = lerp(hx, i, p); hon = 1; }
      if (i >= 3 && t >= ht + 0.08) { lime = 1; hpop = Math.max(hpop, 1 - E('expo.out', prog(t, ht + 0.08, 0.4))); }
    });
    if (t > C.endFlip) hon = 0;
    set(payHi, 'opacity', String(hon));
    set(payHi, 'transform', `translateX(${(hx * PAY_CELL).toFixed(2)}px) scale(${(1 + 0.12 * hpop).toFixed(4)})`);
    set(payHi, 'background', lime ? '#d5fb23' : '#3b374a');
    set(payHi, 'boxShadow', lime ? `0 0 ${(24 + 40 * hpop).toFixed(1)}px rgba(213,251,35,${(0.45 + 0.4 * hpop).toFixed(3)})` : 'none');
    const cur = Math.round(hx);
    payCells.forEach((c, i) => c.c.classList.toggle('lime', !!(lime && hon && i === cur)));
    // the 1000x cell flashes when the values land
    const f1000 = decay(t, C.payReveal + 7 * 0.045 + 0.05, 5) * (t < C.flips[0] ? 1 : 0);
    set(payCells[7].c, 'boxShadow', f1000 > 0.01 ? `inset 0 0 0 2px rgba(213,251,35,${f1000.toFixed(3)}), 0 0 ${(40 * f1000).toFixed(1)}px rgba(213,251,35,${(0.6 * f1000).toFixed(3)})` : 'none');
    set(payCells[7].mul, 'color', f1000 > 0.01 ? mixHex('#ffffff', '#d5fb23', f1000) : '');

    // history pills: new 1000x result slides in on the win
    const pl = E('power3.out', prog(t, C.reveal + 0.15, 0.4));
    const pin = E('power2.out', prog(t, T + 0.3, 0.5));
    pills.forEach((p, i) => {
      const x = i * 87 - 87 * pl;
      const extra = i === 5 ? (1 - pl) * 30 : 0;
      set(p, 'transform', `translate(${(x + extra).toFixed(2)}px, ${((1 - pin) * -20).toFixed(2)}px) scale(${i === 5 ? (0.6 + 0.4 * pl).toFixed(3) : 1})`);
      set(p, 'opacity', (i === 0 ? 1 - pl : i === 5 ? pl : 1) * pin + '');
    });

    // cursor
    const cp = E('power3.inOut', prog(t, 6.3, 0.85));
    const cx = lerp(1180, BET_BTN[0] + 24, cp), cy = lerp(760, BET_BTN[1] + 8, cp) + 12 * bump(cp) * -1;
    const cOp = prog(t, 6.3, 0.12) * (1 - prog(t, C.click + 0.25, 0.2));
    set(el.cursor, 'opacity', cOp.toFixed(3));
    set(el.cursor, 'transform', `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`);
    set(el.cursorSvg, 'transform', `scale(${(1 - 0.18 * press).toFixed(3)})`);
    const cr = prog(t, C.click, 0.4);
    set(el.clickRing, 'opacity', cr > 0 && cr < 1 ? (1 - cr).toFixed(3) : '0');
    set(el.clickRing, 'transform', `scale(${(0.4 + 1.6 * E('expo.out', cr)).toFixed(3)})`);
  }

  // ---------- cards ----------
  function renderCards(t) {
    const showNum = t > 6.0;
    cards.forEach((c, i) => {
      // dealt in during the zoom-through
      const pd = E('expo.out', prog(t, C.deal[i], 0.6));
      let dx = (1 - pd) * 980, dy = (1 - pd) * -160, rz = (1 - pd) * 26, sc = 1;
      if (i >= 5) dx += WORD_GAP * (1 - E('expo.out', prog(t, C.toUI, 0.6)));

      let rot = 0, lift = 0, tilt = 0;
      // title: flip to letter
      { const p = prog(t, C.titleFlips[i], 0.4); rot += 180 * E('back.out(1.6)', p); lift += 70 * bump(p * 1.3); tilt += (i % 2 ? 4 : -4) * bump(p); }
      // pulse when the bass comes back in
      sc += 0.05 * (t >= C.tagline ? 1 - E('expo.out', prog(t, C.tagline + i * 0.02, 0.5)) : 0);
      // back to the goat side for the game
      { const p = prog(t, C.flipBack[i], 0.42); rot += 180 * E('power3.inOut', p); lift += 40 * bump(p); }
      // the run
      if (i < 7) {
        const p = prog(t, C.flips[i], 0.36);
        rot += 180 * E('back.out(1.5)', p);
        lift += 80 * bump(p * 1.3);
        tilt += (i % 2 ? 3 : -3) * bump(p);
      } else {
        // card 8: slow-motion creep, then snap on the drop
        const creep = E('power2.in', prog(t, C.slowFlip, C.reveal - 0.03 - C.slowFlip));
        const snap = E('back.out(1.25)', prog(t, C.reveal - 0.03, 0.28));
        rot += 84 * creep + 96 * snap;
        const tense = prog(t, C.suspense, C.reveal - C.suspense) * (t < C.reveal ? 1 : 0);
        tilt += Math.sin(t * 74) * 2.6 * tense + Math.sin(t * 51 + 1) * 1.2 * tense;
        lift += 50 * E('power2.out', prog(t, C.suspense, 0.4)) * (1 - E('power2.out', prog(t, C.reveal, 0.35))) + 60 * bump(prog(t, C.reveal - 0.03, 0.3));
        let hb = 0;
        C.heartbeats.forEach((hbT) => { hb = Math.max(hb, decay(t, hbT, 7)); });
        sc += 0.035 * hb * (t < C.reveal ? 1 : 0);
        set(c.halo, 'opacity', ((0.25 * tense + 0.6 * hb) * (t < C.reveal ? 1 : 0) + 1.0 * decay(t, C.reveal, 3)).toFixed(3));
      }
      // win: ring + bounce wave
      const pw = prog(t, C.reveal + 0.02 + i * 0.035, 0.42);
      dy += -24 * bump(pw);
      set(c.ring, 'opacity', E('power2.out', prog(t, C.reveal + 0.02 + i * 0.035, 0.2)).toFixed(3));
      // tile sweep dims cards 4–8 until they're picked
      let dim = 0;
      if (i >= 3) {
        const on = E('power2.out', prog(t, 4.45, 0.2));
        const off = E('power2.out', prog(t, C.tileSteps[i - 3] - 0.02, 0.12));
        dim = on * (1 - off) * 0.78;
        sc += 0.1 * bump(prog(t, C.tileSteps[i - 3] - 0.02, 0.3));
      }
      set(c.dim, 'opacity', dim.toFixed(3));
      set(c.slot, 'transform', `translate(${(slotX(i) + dx).toFixed(2)}px, ${(ROW_Y + dy).toFixed(2)}px) rotate(${rz.toFixed(2)}deg) scale(${sc.toFixed(4)})`);
      set(c.card, 'transform', `translateZ(${lift.toFixed(2)}px) rotateY(${rot.toFixed(2)}deg) rotateZ(${tilt.toFixed(2)}deg)`);
      set(c.gL, 'display', showNum ? 'none' : 'grid');
      set(c.gN, 'display', showNum ? 'grid' : 'none');
    });

    // rising-order underline
    let w = 0;
    C.titleFlips.forEach((ft, i) => { const p = prog(t, ft + 0.06, 0.2); if (p > 0) w = lerp(titleRight(i - 1), titleRight(i), E('power3.out', p)); });
    w *= 1 - E('power2.in', prog(t, C.toUI, 0.3));
    C.flips.forEach((ft, i) => { const p = prog(t, ft + 0.06, 0.2); if (p > 0) w = lerp(gameRight(i - 1), gameRight(i), E('power3.out', p)); });
    { const p = prog(t, C.reveal + 0.02, 0.22); if (p > 0) w = lerp(gameRight(6), gameRight(7), E('power3.out', p)); }
    set(el.underline, 'width', w.toFixed(2) + 'px');
    const g = decay(t, C.reveal, 2.2) + 0.5 * decay(t, C.tagline, 4);
    set(el.underline, 'boxShadow', `0 0 ${(14 + 40 * g).toFixed(1)}px rgba(213,251,35,${(0.55 + 0.45 * g).toFixed(3)})`);
  }

  // ---------- chip, tagline, captions, readout ----------
  function renderWorldType(t) {
    const pos = (e, [x, y], dy = 0, s = 1) => set(e, 'transform', `translate(${x}px, ${(y + dy).toFixed(2)}px) translate(-50%, -50%) scale(${s.toFixed(4)})`);
    const out = 1 - E('power2.in', prog(t, C.toUI - 0.1, 0.25));
    const pc = E('expo.out', prog(t, C.chip, 0.6));
    set(el.chip, 'opacity', (pc * out).toFixed(3));
    pos(el.chip, W_CHIP, (1 - pc) * 18);
    const pt = E('expo.out', prog(t, C.tagline, 0.6));
    set(el.tag, 'opacity', (pt * out).toFixed(3));
    pos(el.tag, W_TAG, (1 - pt) * 16);

    // captions: slide up through a mask
    const capAnim = (wrap, inner, tIn, tOut) => {
      const i = E('expo.out', prog(t, tIn, 0.5)), o = E('power3.in', prog(t, tOut, 0.3));
      set(wrap, 'visibility', t > tIn - 0.01 && o < 1 ? 'visible' : 'hidden');
      pos(wrap, W_CAP);
      set(inner, 'transform', `translateY(${((1 - i) * 105 - o * 105).toFixed(2)}%)`);
    };
    capAnim(el.capPick, el.capPickIn, C.pick, C.hitBet - 0.05);
    capAnim(el.capBet, el.capBetIn, C.hitBet + 0.05, C.click + 0.12);

    // multiplier readout
    let v = 0, prev = 0, tHit = -1, first = -1;
    for (let i = 0; i < 7; i++) if (t >= C.flips[i] + 0.06) { prev = v; v = PAY[i]; tHit = C.flips[i] + 0.06; if (first < 0) first = tHit; }
    if (t >= C.reveal) { prev = v; v = 1000; tHit = C.reveal; }
    if (tHit < 0) {
      set(el.readout, 'opacity', '0');
    } else {
      const shown = lerp(prev, v, E('power2.out', prog(t, tHit, 0.2)));
      setText(el.readoutIn, fmtX(shown));
      const pays = v > 0;
      set(el.readoutIn, 'color', pays ? '#d5fb23' : '#4a4658');
      set(el.readoutIn, 'textShadow', pays ? '0 0 40px rgba(213,251,35,.25)' : 'none');
      const punch = 1 + (pays ? 0.3 : 0.08) * (1 - E('expo.out', prog(t, tHit, 0.45)));
      const focus = t > C.suspense && t < C.reveal ? 1 - 0.7 * E('power2.out', prog(t, C.suspense, 0.3)) : 1;
      const handoff = 1 - prog(t, C.hero, 0.12);
      set(el.readout, 'opacity', (clamp((t - first) / 0.08) * focus * handoff).toFixed(3));
      pos(el.readout, W_READOUT, 0, punch);
    }

    // "BEAT 88" over the last card
    let hb = 0;
    C.heartbeats.forEach((h) => { hb = Math.max(hb, decay(t, h, 8)); });
    const pb = E('expo.out', prog(t, C.suspense + 0.05, 0.4)) * (1 - prog(t, C.reveal - 0.06, 0.08));
    set(el.beat88, 'opacity', pb.toFixed(3));
    pos(el.beat88, W_BEAT88, (1 - pb) * 12, 1 + 0.08 * hb);
  }

  // ---------- focus vignette, flash, 1000x hero ----------
  function renderOverlays(t) {
    const fv = E('power2.inOut', prog(t, C.suspense, 0.55)) * (1 - E('power2.out', prog(t, C.reveal, 0.3)));
    set(el.focus, 'opacity', fv.toFixed(3));

    const fl = Math.max(
      0.8 * (t >= C.reveal ? 1 - E('expo.out', prog(t, C.reveal, 0.5)) : 0),
      0.2 * (t >= C.zoomEnd ? 1 - E('expo.out', prog(t, C.zoomEnd, 0.22)) : 0),
    );
    set(el.flash, 'opacity', fl.toFixed(3));

    set(el.scrim, 'opacity', E('power2.out', prog(t, C.reveal + 0.02, 0.35)).toFixed(3));
    const ph = prog(t, C.hero, 0.34);
    set(el.hero, 'opacity', clamp((t - C.hero) / 0.05).toFixed(3));
    if (t < C.hero) return;
    let pulse = 0;
    C.pulses.forEach((p) => { pulse = Math.max(pulse, t >= p ? 1 - E('expo.out', prog(t, p, 0.35)) : 0); });
    const s = lerp(2.3, 1, E('expo.out', ph)) + 0.06 * pulse + 0.03 * prog(t, C.hero, 1.6);
    set(el.heroStack, 'transform', `scale(${s.toFixed(4)})`);
    set(el.heroRays, 'opacity', E('power2.out', prog(t, C.hero + 0.04, 0.5)).toFixed(3));
    set(el.heroRays, 'transform', `rotate(${(t * 11).toFixed(2)}deg) scale(${(1 + 0.05 * pulse).toFixed(3)})`);
    set(el.heroGlow, 'opacity', (0.7 + 0.3 * pulse + 0.3 * decay(t, C.hero, 4)).toFixed(3));
    // light sweeps across the numerals on the beats
    let sweep = 150;
    for (const st of [C.hero + 0.26, C.pulses[1] - 0.04]) { const p = prog(t, st, 0.5); if (p > 0 && p < 1) sweep = lerp(150, -50, E('power2.inOut', p)); }
    set(el.heroShine, 'backgroundPosition', `${sweep.toFixed(2)}% 0`);
    const pt = prog(t, C.hero + 0.14, 0.4);
    set(el.heroTop, 'opacity', clamp(pt * 4).toFixed(3));
    set(el.heroTop, 'transform', `translateY(${((1 - E('expo.out', pt)) * -30).toFixed(2)}px) scale(${(0.7 + 0.3 * E('back.out(2.2)', pt) + 0.04 * pulse).toFixed(4)})`);
    // outline echoes emitted on every beat
    el.echoes.forEach((e, k) => {
      let best = null;
      for (let n = 0; n < 12; n++) {
        const te = C.hero + 0.05 + n * 0.4;
        if (n % 3 === k && t >= te) best = te;
      }
      if (best == null) { set(e, 'opacity', '0'); return; }
      const p = prog(t, best, 1.1);
      set(e, 'opacity', (0.7 * (1 - p)).toFixed(3));
      set(e, 'transform', `scale(${(1 + 0.42 * E('power2.out', p)).toFixed(4)})`);
    });
    // payout
    const pp = prog(t, C.payout, 0.55);
    set(el.heroSub, 'opacity', clamp((t - C.payout) / 0.08).toFixed(3));
    set(el.heroSub, 'transform', `translateY(${((1 - E('expo.out', pp)) * 40).toFixed(2)}px) scale(${(1 + 0.06 * pulse).toFixed(4)})`);
    setText(el.heroPayout, fmtUsd(BET * 1000 * E('power2.out', prog(t, C.payout, 0.55))));
  }

  // ---------- end card ----------
  function renderEnd(t) {
    const T = C.endFlip;
    const drift = 1 + 0.03 * prog(t, T, 15 - T);
    const fin = t >= C.final ? 1 - E('expo.out', prog(t, C.final, 0.5)) : 0;
    const pb = E('expo.out', prog(t, T + 0.12, 0.6));
    set(el.endBrand, 'opacity', pb.toFixed(3));
    set(el.endBrand, 'transform', `translateY(${((1 - pb) * -26).toFixed(2)}px) scale(${drift.toFixed(4)})`);
    endLetters.forEach((ch, j) => {
      const p = E('expo.out', prog(t, T + 0.04 + j * 0.03, 0.55));
      set(ch, 'transform', `translateY(${((1 - p) * 112).toFixed(2)}%) rotate(${((1 - p) * 8).toFixed(2)}deg)`);
    });
    set(el.endTitle, 'transform', `scale(${(drift + 0.05 * fin).toFixed(4)})`);
    endCards.forEach((c, i) => {
      const p = prog(t, C.endCards[i], 0.42);
      const rot = 180 * E('back.out(1.6)', p);
      const lift = 45 * bump(p * 1.3);
      const hop = -14 * bump(prog(t, C.final + i * 0.03, 0.35));
      set(c.card, 'transform', `translateZ(${lift.toFixed(2)}px) rotateY(${rot.toFixed(2)}deg)`);
      set(c.slot, 'transform', `translateY(${hop.toFixed(2)}px)`);
    });
    let uw = 0;
    C.endCards.forEach((ct, i) => { const p = prog(t, ct + 0.05, 0.18); if (p > 0) uw = lerp(i * 104, i * 104 + 90, E('power3.out', p)); });
    set(el.endUnder, 'width', uw.toFixed(2) + 'px');
    set(el.endUnder, 'boxShadow', `0 0 ${(14 + 30 * fin).toFixed(1)}px rgba(213,251,35,${(0.55 + 0.45 * fin).toFixed(3)})`);
    const ra = E('expo.out', prog(t, T + 0.3, 0.6));
    set(el.endRow, 'opacity', ra.toFixed(3));
    set(el.endRow, 'transform', `translateY(${((1 - ra) * 30).toFixed(2)}px) scale(${drift.toFixed(4)})`);
    const pc = E('back.out(1.7)', prog(t, C.cta, 0.5));
    set(el.endCta, 'opacity', clamp((t - C.cta) / 0.12).toFixed(3));
    set(el.endCta, 'transform', `translateY(${((1 - pc) * 24).toFixed(2)}px) scale(${(0.9 + 0.1 * pc + 0.04 * fin).toFixed(4)})`);
    set(el.endBg, 'opacity', (0.85 + 0.15 * fin).toFixed(3));
    endDeco.forEach(({ d, s }, i) => {
      const pin = E('expo.out', prog(t, T + 0.1 + i * 0.05, 0.9));
      const fl = s.dir * (1 - pin);
      const x = s.x + fl * 220 + Math.sin(t * 0.9 + i) * 10;
      const y = s.y + (1 - pin) * 100 + Math.cos(t * 0.8 + i * 1.7) * 12;
      set(d, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(s.r + fl * 25 + s.dir * (t - T) * 4).toFixed(2)}deg) scale(${s.sc})`);
      set(d, 'filter', `blur(${s.blur}px)`);
      set(d, 'opacity', (pin * (s.blur > 8 ? 0.4 : 0.75)).toFixed(3));
    });
  }

  // =====================================================================
  // Motion-blur budget: how many sub-frames the renderer averages per frame.
  // Extra samples only where things move fast enough to strobe.
  // =====================================================================
  const BLUR = [
    [C.zoomStart - 0.04, C.zoomEnd + 0.04, 16],            // zoom through the O
    [C.reveal - 0.05, C.reveal + 0.25, 14],                // card 8 snaps, 1000x slams in
    [C.endFlip - 0.22, C.endFlip + 0.32, 10],              // full-screen flip to the end card
    [C.click, C.flips[0] + 0.06, 10],                      // whip from the Bet button to the cards
    [C.toUI, C.toUI + 0.4, 8],                             // pull back into the UI
    [C.deal[0], C.deal[0] + 0.5, 8],                       // cards dealt in
    ...C.titleFlips.map((t) => [t, t + 0.16, 8]),
    ...C.flips.map((t) => [t, t + 0.16, 8]),
    ...C.words.map((t) => [t - 0.05, t + 0.12, 8]),
    [C.final, C.final + 0.12, 8],
  ];
  function subframesAt(t) {
    let n = 5;
    for (const [a, b, k] of BLUR) if (t >= a && t <= b) n = Math.max(n, k);
    return n;
  }

  // =====================================================================
  // boot
  // =====================================================================
  async function boot() {
    await document.fonts.load('330px Schabo');
    await Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 20px Geist`)));
    await document.fonts.ready;
    buildHole();
    window.__seek = (t) => render(t);
    window.__subframes = subframesAt;
    window.__duration = C.duration;
    window.__cues = C;
    render(parseFloat(params.get('t') || '0'));
    window.__ready = true;
    if (!RENDER && !params.has('t')) startPreview();
  }

  function startPreview() {
    document.body.classList.add('preview');
    const audio = new Audio('out/soundtrack.wav');
    let t0 = null;
    const fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); $('#stage').style.transform = `scale(${s})`; $('#stage').style.transformOrigin = '0 0'; };
    fit(); addEventListener('resize', fit);
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

  boot();
})();
