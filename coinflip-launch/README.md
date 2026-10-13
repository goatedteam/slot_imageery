# Coinflip launch video

A 15-second, 1080×1350 (4:5), 60 fps launch video for the Goated Original **Coinflip**. It recreates the live Coinflip promo shot for shot, with every frame re-spaced and the edit synced to Mura Masa – Love$ick ft. A$AP Rocky.

**Video:** [`dist/coinflip-launch-1080x1350p60.mp4`](dist/coinflip-launch-1080x1350p60.mp4). Poster frames are in `dist/`: [title](dist/poster-title.jpg), [BIG WIN](dist/poster-bigwin.jpg), [end card](dist/poster-endcard.jpg).

## Changes from the original promo

- **Synced to Love$ick.** Every scene change, coin landing and hit falls on the track's beat grid (see the beat map below).
- **Spacing.** Each scene is laid out on the 1080×1350 frame with even gaps between its blocks:
  - Opening: the chip, NEW ORIGINAL, RELEASED, the coin and COINFLIP! are stacked top to bottom without touching.
  - Game: the header (CALL IT. FLIP IT. → the streak multiplier → ONE MORE…) has its own band above the panel. The tossed coin never reaches the header text.
  - BIG WIN: the top coin, title, amount, pill and the row of ten coins are stacked evenly.
  - End card: GOATED, the coin, COINFLIP and the button are spaced evenly. The button moves up into the gap the removed line left.
- **End card:** the COINFLIP title is flat lime with no purple drop shadow, and the "Call it. Flip it. Chain it up to 1,027,604×" line is gone. "Play now on goated.com →" and "18+ · Play responsibly" stay.

The coin faces are the supplied art in `assets/coins/`: the purple gem is heads and the gold shuriken is tails.

## Beat map

The music is Love$ick from 0:46.754 to 1:01.754. That window opens on a section downbeat, stops dead just before 10 s, and drops into the track's heaviest bass at 10.78 s, right where BIG WIN lands. At 89 BPM half-time, a beat is 0.674 s and a bar is 2.696 s.

| Time | Music | Picture |
|---|---|---|
| **0.00** | bar 1 | NEW ORIGINAL rises in letter by letter over a scrolling lime grid, under the GOATED ORIGINALS chip |
| 0.67 | beat | the RELEASED tag wipes in |
| 1.01 → 1.69 | off-beats | the coin launches from below, spinning, and lands heads-up with a glint |
| 2.02 | beat | COINFLIP! slams in with a ring burst |
| **2.70** | bar 2 | the opening clears, the game panel rises and the coin flies into its slot |
| 3.37 / 4.04 | beats | CALL IT. / FLIP IT. |
| **5.39** | bar 3 | first flip lands: streak 1 / 20, 1.96×, Cash Out lights up |
| 6.07 → 9.10 | beats, then eighths | flips 2–9 land on the beat, then twice as fast: 3.92× → 501.76× |
| 9.44 | beat | ONE MORE…: the controls dim and the 10th flip goes up in slow motion |
| 9.95 | the track stops dead | the coin hangs at the top of its arc |
| 10.46 | riser | the 10th flip lands: 10 IN A ROW, 1,003.52× |
| **10.78** | bass drop | lime flash, then BIG WIN! with raining coins and confetti; the amount counts up to $10,035.20 |
| 11.46 | beat | the "1,003.52× • 10 flips in a row" pill |
| 12.13 | beat | the count lands on $10,035.20 as the row of ten winning coins flips in |
| **13.48** | bar 6 | flash to the end card: the coin drops in tails-up, then GOATED and COINFLIP |
| 14.15 | beat | Play now on goated.com →, then the 18+ line, as the track fades out |

## Run it

Requires Node 18+, Python 3 and ffmpeg on `PATH`.

```bash
npm install
pip install -r audio/requirements.txt   # tools/verify.py also needs Pillow

npm run audio            # → out/soundtrack.wav (−14 LUFS)
npm run render           # → out/coinflip-launch-1080x1350p60.mp4 (~6 min on 4 cores)
npm run verify           # frame count, loudness, A/V offset, out/verify_sheet.png
npm run stills -- 5.4 10.9 14.9 --sheet   # review frames → out/stills/
npm run preview          # http://localhost:8080 (click to play with sound)
```

## How it's built

- `src/cues.js`: the beat-locked timing.
- `src/main.js`: the scene. Every frame is a pure function of `t`.
  - Type and UI are DOM.
  - The coins, particles and grid are drawn on two canvases.
  - The coin is 2.5D. The face art is squashed by cos θ as it flips, over a shaded rim, with a sheen that tracks the angle.
  - Counters follow the frame time, not the sub-frame time, so motion blur never smears the digits.
- `render.mjs`: a pool of headless Chromium workers. Each frame is the average of 3–10 sub-frames over a 180° shutter, with more on the tosses and hits. Frames are encoded in near-lossless chunks, then joined, given light grain so the purple gradients don't band, and muxed with the soundtrack.
- `audio/build_soundtrack.py`: only the 15-second excerpt used is kept in the repo (`audio/lovesick-0m46.754-1m01.754.flac`). It gets a 12 ms fade-in and a 0.6 s fade-out, is normalised to −14 LUFS, and is soft-limited under −1 dBFS.

Fonts: Schabo Condensed (titles) and Geist (UI and secondary). Licences are in `assets/fonts/`.
