// Timing for the Coinflip launch video, locked to the supplied track
// (Mura Masa – Love$ick, used from 0:46.754 to 1:01.754; video t = song t − 46.754).
// 89 BPM half-time: a beat is 0.674 s, an 8th 0.337 s, a bar 2.696 s.
// Bars land at 0, 2.696, 5.392, 8.088, 10.784 (the heavy bass drop), 13.48.
(function (root) {
  const r = (x) => +x.toFixed(4);
  const E = 0.337, BEAT = 2 * E, BAR = 8 * E;
  const bar = (k) => r(k * BAR);
  const at = (k, beats = 0, eighths = 0) => r(k * BAR + beats * BEAT + eighths * E);

  root.CUES = {
    duration: 15,
    fps: 60,
    beat: BEAT,
    eighth: E,
    bar: BAR,
    music: { srcStart: 46.754, fadeIn: 0.012, fadeOut: 0.6 },

    // 1 — NEW ORIGINAL RELEASED, the coin lands, COINFLIP!
    title: bar(0),            // section downbeat
    released: at(0, 1),       // snare
    coinUp: at(0, 1, 1),      // coin launches from below
    coinLand: at(0, 2, 1),    // lands on the 8th before the snare
    coinflip: at(0, 3),       // snare: ring burst + COINFLIP!

    // 2 — the game UI
    toUI: bar(1),
    callIt: at(1, 1),
    flipIt: at(1, 2),
    firstTap: at(1, 3) - 0.38,

    // 3 — the streak: flips land on the grid, accelerating to 8ths
    lands: [at(2, 0), at(2, 1), at(2, 2), at(2, 3), at(2, 3, 1), at(3, 0), at(3, 0, 1), at(3, 1), at(3, 1, 1)],
    calls: ['H', 'T', 'H', 'H', 'T', 'H', 'T', 'T', 'H', 'H'],

    // 4 — ONE MORE… over the track's stop + riser, the 10th flip lands on the riser hit
    oneMore: at(3, 2),
    stop: 9.95,
    tenth: 10.46,

    // 5 — BIG WIN on the bass drop
    bigWin: bar(4),
    amountDone: at(4, 2),
    pill: at(4, 1),
    row: at(4, 2) - 0.1,
    pulse: at(4, 3),

    // 6 — end card
    end: bar(5),
    cta: at(5, 1),
  };
})(typeof window !== 'undefined' ? window : globalThis);
