# Coinflip teaser

A 10-second, 1920×1080, 60 fps teaser for Goated's next Original, **Coinflip**. A gold Goated coin bursts up from the bottom of a black screen, spinning. It stops dead in the middle, keeps spinning, lands heads-up, then falls away to reveal the Goated mark that was sitting behind it.

**Videos:**
- [`dist/coinflip-teaser-1080p60.mp4`](dist/coinflip-teaser-1080p60.mp4): ends on the mark with **COINFLIP** and "Coming soon".
- [`dist/coinflip-teaser-clean-1080p60.mp4`](dist/coinflip-teaser-clean-1080p60.mp4): ends on the mark alone.

## Beat map

The music is Mura Masa – Love$ick ft. A$AP Rocky, from 0:03 to 0:13. It runs at 89 BPM half-time, so a beat is 0.674 s and a bar is 2.696 s. Every hit below lands on the track.

| Time | Music | Picture |
|---|---|---|
| 0.27 | white-noise riser | a lime glow builds at the bottom edge |
| **0.61** | the beat drops | the coin bursts up from the bottom, spinning end over end, through a spray of sparks |
| **1.28** | snare | it stops dead in the centre, still spinning, with a shockwave and a glint on the rim |
| 2.63 | snare | a spin burst and another glint |
| 3.30 | bar 2 | slow motion: the camera pushes in and the spin eases right down |
| 3.98 | snare | light sweeps across the face square-on |
| 4.65 | — | the spin builds again |
| **5.33** | snare | it snaps face-on, heads up, and the Goated mark appears behind it, hidden |
| **6.00** | bar 3 | the coin falls off the bottom, tumbling, and uncovers the mark, which grows into place |
| 6.67 / 8.02 | snares | COINFLIP rises in, then "Coming soon" (main version only) |
| 8.70 | bar 4 | a final glint, then the track fades out |

## The coin

- **Built in three.js.** The faces are generated procedurally as relief, normal and roughness maps, giving a proof-coin finish: a mirror field with frosted relief. The face carries the Goated horns, a bead ring, a sunburst engraving, and a legend reading "GOATED ORIGINALS ✦ COINFLIP ✦". The edge is reeded.
- **Lighting:** a studio environment of light strips in a black room, including a lime strip, plus a key light that sweeps across the face on the slow-motion snare.
- **The mark behind the coin:** the same horns traced from the in-game card back, extruded in lime metal.

## Run it

Requires Node 18+, Python 3 and ffmpeg on `PATH`.

```bash
npm install
pip install -r audio/requirements.txt

npm run audio            # → out/soundtrack.wav (−14 LUFS)
npm run render           # → out/coinflip-teaser-1080p60.mp4 (~15 min on 4 cores, software WebGL)
npm run render:clean     # → out/coinflip-teaser-clean-1080p60.mp4 (re-renders only from 6 s, then splices)
npm run stills -- 1.29 5.4 6.3 --sheet   # review frames (add --clean or --look chrome|lime)
npm run preview          # http://localhost:8080 (click to play with sound)
```

## How it's built

- `src/cues.js`: the beat-locked timing.
- `src/main.js`: the scene. Every frame is a pure function of `t`.
  - `window.__seek(t)` renders a frame as the average of several jittered HDR sub-frames, for motion blur and anti-aliasing, then applies bloom and tone mapping once.
  - The spin is integrated from an angular-velocity curve, then bent through anchors so the face is tilted toward camera when the coin stops, square-on for the light sweep, and exactly heads-up on the landing.
- `render.mjs`: headless Chromium workers capture one frame each and pipe them to ffmpeg, which muxes in the soundtrack.
- `audio/build_soundtrack.py`: only the 10-second excerpt used is kept in the repo (`audio/lovesick-0m03-0m13.flac`). It gets a 40 ms fade-in, a 0.7 s fade-out, and is normalised to −14 LUFS.

Fonts: Schabo Condensed (title) and Geist (secondary). Licences are in `assets/fonts/`.
