// Timing for the Coinflip teaser, locked to the supplied track
// (Mura Masa – Love$ick, used from 0:03 to 0:13; video t = song t − 3).
// The groove is 178 BPM double-time / 89 BPM half-time: a half-time beat is
// 0.674 s, a bar is 2.696 s. Downbeats land at 0.608, 3.304, 6.000, 8.696;
// snares (beats 2 and 4) every 1.348 s from 1.282.
(function (root) {
  const r = (x) => +x.toFixed(4);
  const BEAT = 0.674, BAR = 4 * BEAT, DOWN = 0.608;
  const down = (k) => r(DOWN + k * BAR);
  const snare = (k) => r(DOWN + BEAT + k * 2 * BEAT);

  root.CUES = {
    bpm: 89,
    beat: BEAT,
    bar: BAR,
    duration: 10,
    fps: 60,
    music: { srcStart: 3.0, fadeIn: 0.04, fadeOut: 0.7 },

    riser: 0.27,             // white-noise riser in the track
    launch: down(0),         // 0.608 drop: the coin bursts up from the bottom
    stop: snare(0),          // 1.282 it stops dead in the middle, still spinning
    kick2: snare(1),         // 2.630 spin burst + glint
    slowmo: down(1),         // 3.304 slow motion, camera pushes in
    sweep: snare(2),         // 3.978 light sweeps across the logo
    spinUp: r(down(1) + 2 * BEAT), // 4.652 spin builds again
    land: snare(3),          // 5.326 snaps face-on: heads
    fall: down(2),           // 6.000 falls off the bottom → logo behind it
    title: snare(4),         // 6.674 COINFLIP
    sub: snare(5),           // 8.022 Coming soon
    final: down(3),          // 8.696 last accent
  };
})(typeof window !== 'undefined' ? window : globalThis);
