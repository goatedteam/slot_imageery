// Timing for the Coinflip launch video, locked to the supplied track
// (Mura Masa – Love$ick from 0:46.754; video t = song t − 46.754 up to the 10th landing).
// 89 BPM half-time: a beat is 0.674 s, an 8th 0.337 s, a bar 2.696 s.
// Bars land at 0, 2.696, 5.392 and 8.088. Then the 10th coin lands on the hit before the
// drop, and the music freezes for two beats (`hold`) while the picture holds on
// 1,003.52×. The hit returns and the drop lands on BIG WIN, a bar after 8.088 plus the
// hold. The end card holds for an extra two seconds (`endHold`).
// Loaded by the page (classic script) and by Node (render.mjs, audio/build_soundtrack.py).
(function (root) {
  const r = (x) => +x.toFixed(4);
  const E = 0.337, BEAT = 2 * E, BAR = 8 * E;
  const HOLD = 2 * BEAT, END_HOLD = 2;
  const bar = (k) => r(k * BAR);
  const at = (k, beats = 0, eighths = 0) => r(k * BAR + beats * BEAT + eighths * E);
  const after = (x) => r(x + HOLD); // cues after the freeze shift by the hold

  const C = (root.CUES = {
    duration: r(Math.round((15 + HOLD + END_HOLD) * 60) / 60), // whole frames: 18.35 s
    fps: 60,
    beat: BEAT,
    eighth: E,
    bar: BAR,
    hold: HOLD,

    // 1 — NEW ORIGINAL RELEASED, the coin lands and rings out on the snare
    title: bar(0),            // section downbeat
    released: at(0, 1),       // snare
    coinUp: at(0, 1, 1),      // coin launches from below
    coinLand: at(0, 2, 1),    // lands on the 8th before the snare
    burst: at(0, 3),          // snare: a ring bursts from the coin

    // 2 — the game UI
    toUI: bar(1),
    callIt: at(1, 1),
    flipIt: at(1, 2),

    // 3 — the streak: flips land on the grid, accelerating to 8ths
    lands: [at(2, 0), at(2, 1), at(2, 2), at(2, 3), at(2, 3, 1), at(3, 0), at(3, 0, 1), at(3, 1), at(3, 1, 1)],
    calls: ['H', 'T', 'H', 'H', 'T', 'H', 'T', 'T', 'H', 'H'],

    // 4 — ONE MORE… over the track's stop; the 10th flip lands on the hit before the drop
    oneMore: at(3, 2),
    stop: 9.95,
    tenth: 10.432,             // song 0:57.186
    rehit: r(10.432 + HOLD),   // after the hold, the same hit returns

    // 5 — BIG WIN on the bass drop
    bigWin: after(bar(4)),
    pill: after(at(4, 1)),
    row: after(at(4, 2) - 0.1),
    amountDone: after(at(4, 2)),
    pulse: after(at(4, 3)),

    // 6 — end card, held for END_HOLD more seconds
    end: after(bar(5)),
    cta: after(at(5, 1)),
  });
  C.music = {
    srcStart: 46.754,
    gapAt: 10.428,      // cut 4 ms before the hit so its transient survives the edit
    gap: HOLD,
    fadeIn: 0.012,
    fadeOut: r(C.duration - (C.end + BAR)), // fade from the last bar line to the end
  };

  // ---- the ten flips: when each is tapped, launched and lands, and how far it turns
  const TAU = Math.PI * 2;
  const LANDS = [...C.lands, C.tenth];
  const DUR = LANDS.map((l, k) => (k === 9 ? l - (C.oneMore + 0.09) : k === 0 ? 0.62 : LANDS[k] - LANDS[k - 1] > 0.5 ? 0.5 : 0.29));
  const START = LANDS.map((l, k) => l - DUR[k]);
  const TARGET = [];
  let th = 0; // landed heads in the intro
  C.calls.forEach((c, k) => {
    const want = c === 'H' ? 0 : Math.PI;
    const turns = k === 9 ? 6 : DUR[k] > 0.45 ? 3 : 2;
    let tgt = Math.floor(th / TAU) * TAU + turns * TAU + want;
    if (tgt - th < turns * TAU - 0.01) tgt += TAU;
    TARGET.push([th, tgt]);
    th = tgt;
  });
  C.toss = { lands: LANDS, dur: DUR, start: START, target: TARGET, taps: START.map((s) => r(s - 0.06)) };

  /** slow-motion time warp for the last flip: fast up, hang over the track's stop, fast down */
  C.warp = function (p) {
    const a = 0.32, b = 0.8; // rise ends at a, fall starts at b
    if (p < a) return 0.42 * (1 - Math.pow(1 - p / a, 3));
    if (p < b) return 0.42 + 0.16 * ((p - a) / (b - a));
    return 0.58 + 0.42 * Math.pow((p - b) / (1 - b), 3);
  };
  /** the flip in progress at t (or the last one started): index, raw and warped progress, angle */
  C.tossAt = function (t) {
    let k = 0;
    while (k < 9 && t >= START[k + 1]) k++;
    const p = Math.min(1, Math.max(0, (t - START[k]) / DUR[k]));
    const pw = k === 9 ? C.warp(p) : p;
    return { k, p, pw, theta: TARGET[k][0] + (TARGET[k][1] - TARGET[k][0]) * pw };
  };
})(typeof window !== 'undefined' ? window : globalThis);
