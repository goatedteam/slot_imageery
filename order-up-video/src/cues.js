// Single source of truth for timing, locked to the supplied track
// (order-up-drop, 150 BPM: beat = 0.4 s, bar = 1.6 s, downbeats on multiples of 1.6 s).
//
// The 15 s cut of the song (built by audio/build_soundtrack.py):
//   video 0.0–6.4   ← song 0.0–6.4    intro plucks, riser, 808 hit on 1.6, groove
//   video 6.4–14.4  ← song 22.4–30.4  groove, 2-bar build (8.0–11.2), DROP at 11.2
//   video 14.4–15.0 ← song 36.8–37.4  the song's final 808 hit, faded out
(function (root) {
  const r = (x) => +x.toFixed(4);
  const range = (n, f) => Array.from({ length: n }, (_, i) => r(f(i)));

  root.CUES = {
    bpm: 150,
    beat: 0.4,
    bar: 1.6,
    duration: 15,
    fps: 60,

    music: {
      segments: [
        { src: 0.0, dst: 0.0, len: 6.4 },
        { src: 22.4, dst: 6.4, len: 8.0 },
        { src: 36.8, dst: 14.4, len: 0.6 },
      ],
      fadeOut: 0.4,
    },

    // Scene 1: NEW / ORIGINAL / RELEASED on the intro plucks, zoom through the "O" on the riser
    words: [0.0, 0.4, 0.8],
    zoomStart: 1.2,
    zoomEnd: 1.6,

    // Scene 2: "ORDER UP!" on the game's own cards. 808 hit on 1.6, flips on the 8th-note stabs
    deal: range(8, (i) => 1.1 + i * 0.035),
    titleFlips: range(8, (i) => 1.6 + i * 0.2),
    chip: 2.4,
    tagline: 3.2,

    // Scene 3: bass drops back in at 4.0, so pull back into the live game UI
    toUI: 4.0,
    flipBack: range(8, (i) => 4.06 + i * 0.035),
    pick: 4.8,
    tileSteps: range(5, (i) => 5.0 + i * 0.2),
    payReveal: 6.0,
    hitBet: 6.4,
    hover: 7.2,
    click: 7.6,

    // Scene 4: the 2-bar build. One card per beat, every card higher than the last
    flips: range(7, (i) => 8.0 + i * 0.4),
    suspense: 10.5,
    heartbeats: [10.6, 10.8, 10.95, 11.05, 11.13],
    slowFlip: 10.7,
    reveal: 11.2,

    // Scene 5: 1000x on the drop
    hero: 11.21,
    payout: 11.6,
    pulses: [12.0, 12.4],

    // Scene 6: end card on the next bar, final hit at 14.4
    endFlip: 12.8,
    endCards: range(8, (i) => 13.22 + i * 0.05),
    cta: 13.6,
    final: 14.4,
  };
})(typeof window !== 'undefined' ? window : globalThis);
