# Order Up launch video

A 15-second, 1920×1080, 60 fps motion-graphics spot announcing **Order Up**, the new Goated Original.

**Final video:** [`dist/order-up-launch-1080p60.mp4`](dist/order-up-launch-1080p60.mp4). Poster frames are in [`dist/`](dist).

The spot is built as code: an HTML page whose every frame is a pure function of time, rendered frame by frame in headless Chromium with real sub-frame motion blur, then cut to the supplied music track.

## Storyboard

The picture is locked to the music: 150 BPM, so one beat is 0.4 s and one bar is 1.6 s.

| Time | Music | Picture |
|---|---|---|
| 0.0–1.2 | Intro plucks | **NEW / ORIGINAL / RELEASED** slam in on the beats (Schabo 330) |
| 1.2–1.6 | Riser | The type turns lime and the camera zooms *through the counter of the "O"* |
| 1.6–4.0 | 808 hit, stabs | Eight game cards are dealt and flip on the 8th notes to spell **ORDER UP!**. The lime rising-order underline grows under them, with "A new Goated Original" above and "Pick 3 to 8 cards. Get paid when they rise in order." below |
| 4.0–4.8 | Bass returns | Camera pulls back. The title cards flip to their goat backs and become the game's card row while the Order Up UI assembles around them in 3D |
| 4.8–6.4 | Groove | **PICK 3 TO 8 CARDS**: the Tiles control steps 3 → 8 on the 8ths, cards light up, and the paytable lands with the 1000x cell flashing |
| 6.4–8.0 | Groove, then a gap | **HIT BET**: the cursor clicks Bet on the stab at 7.6 and the camera whips to the cards |
| 8.0–10.4 | 2-bar build | One card per beat: 6, 14, 27, 39, 52, 71, 88. The readout climbs 0X → 17.2X → 35X → 90X → 240X and the paytable highlight turns lime |
| 10.5–11.2 | Build peaks | Standoff: the camera pushes in on card 8 ("BEAT 88"), heartbeat pulses, and the card creeps over in slow motion |
| **11.2** | **Drop** | Card 8 snaps to **97**. Flash, shockwave and sparks, then **1000X** slams in with MAX WIN, echoes, rays, confetti, and a payout count to $10,000.00 |
| 12.8–15.0 | Final bar and final hit | A full-screen card flip reveals the end card: GOATED ORIGINALS, ORDER UP!, the winning run, "Now live. Play at goated.com", and 18+ · Please play responsibly |

The UI is rebuilt from the screen recording using the game's sampled palette. The card-back goat mark is traced from the in-game card back ([`assets/goat.svg`](assets/goat.svg)).

## Music edit

The supplied track (`audio/order-up-drop.wav`, 38.4 s) is cut on bar lines so its drop lands on the 1000x reveal:

| Video | Song | Content |
|---|---|---|
| 0.0–6.4 s | 0.0–6.4 s | intro, riser, 808 hit, groove |
| 6.4–14.4 s | 22.4–30.4 s | groove, build (24.0–27.2), **drop at 27.2 → video 11.2** |
| 14.4–15.0 s | 36.8–37.4 s | the song's final 808 hit, faded out |

The joins were chosen for continuity: the bars on either side of the 6.4 s join are 99.7% chroma-similar. Each join is a 12 ms equal-power crossfade that finishes exactly on the downbeat, so the incoming transient is untouched.

A light sound-design layer is synthesised from the same cues: card flicks, UI ticks, the Bet click, whooshes, heartbeat, impact and payout shimmer. The mix is normalised to −14 LUFS with a −1 dBFS ceiling. Run `python3 audio/build_soundtrack.py --no-sfx` for music only.

## Run it

Requires Node 18+, Python 3 and ffmpeg on `PATH`.

```bash
npm install
pip install -r audio/requirements.txt

npm run audio            # → out/soundtrack.wav
npm run render           # → out/order-up-launch-1080p60.mp4 (~12 min on 4 cores)
npm run render:preview   # → out/preview-30fps.mp4, no motion blur, ~2 min
npm run stills -- 1.4 11.3 14.9 --sheet   # review individual frames
npm run preview          # live preview at http://localhost:8080 (click to play with sound)
```

Useful `render.mjs` flags: `--start/--end` (seconds), `--fps`, `--blur` (sub-frame multiplier, 0 = off), `--workers`, `--crf`, `--grain`, `--no-audio`.

## How it's built

- `src/cues.js`: the single timing source. The picture and the soundtrack builder both read it, so moving a cue moves both.
- `src/main.js`: evaluates every element's keyframes directly from `t` (GSAP is used only for its easing curves), so any frame renders identically in any order. `window.__seek(t)` paints a frame; `window.__subframes(t)` sets the motion-blur budget, which is 5 samples normally and up to 16 on the zoom-through and the 1000x slam.
- `render.mjs`: a pool of headless Chromium workers pulls frame blocks from a queue. Each frame averages its sub-frames over a 180° shutter, and blocks are encoded near-lossless, concatenated, given light luma grain, and muxed with the soundtrack.
- `src/style.css`: Schabo uses typo metrics, so caps sit 0.1 em above the line-box centre. Every Schabo box sets `line-height = box height + 0.2em` to centre them.

## Fonts

- **Schabo Condensed** (primary, all display type). Free for commercial use; see `assets/fonts/Schabo-LICENSE.txt`.
- **Geist** (secondary: UI, captions, CTA). SIL Open Font License; see `assets/fonts/Geist-LICENSE.txt`.
