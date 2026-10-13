#!/usr/bin/env python3
"""Build out/soundtrack.wav for the Coinflip teaser.

The supplied track (Mura Masa – Love$ick ft. A$AP Rocky) is used from 0:03 to 0:13.
Only that 10 s excerpt is kept in the repo (audio/lovesick-0m03-0m13.flac); pass
--src with the full file to re-cut it.

    python3 audio/build_soundtrack.py [--src path/to/full-track.mp3]
"""
import argparse
import json
import pathlib
import subprocess

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 48000
EXCERPT = ROOT / 'audio' / 'lovesick-0m03-0m13.flac'

ap = argparse.ArgumentParser()
ap.add_argument('--src', help='full track to cut the excerpt from')
ap.add_argument('--out', default='out/soundtrack.wav')
ap.add_argument('--lufs', type=float, default=-14.0)
args = ap.parse_args()

cues = json.loads(subprocess.check_output(
    ['node', '-e', "global.window={}; require('./src/cues.js'); process.stdout.write(JSON.stringify(window.CUES))"], cwd=ROOT))
m = cues['music']
dur = cues['duration']

if args.src:
    # decode with ffmpeg (handles the mp3 encoder delay) and keep only the window we use
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(m['srcStart']), '-t', str(dur), '-i', args.src,
                    '-ar', str(SR), '-ac', '2', '-c:a', 'flac', str(EXCERPT)], check=True)
    print('cut', EXCERPT.relative_to(ROOT))

x, sr = sf.read(EXCERPT, dtype='float64', always_2d=True)
assert sr == SR
N = int(round(dur * SR))
x = np.pad(x, ((0, max(0, N - len(x))), (0, 0)))[:N]

fi, fo = int(m['fadeIn'] * SR), int(m['fadeOut'] * SR)
x[:fi] *= np.linspace(0, 1, fi)[:, None]
x[-fo:] *= (np.cos(np.linspace(0, np.pi / 2, fo)) ** 2)[:, None]

meter = pyln.Meter(SR)
x *= 10 ** ((args.lufs - meter.integrated_loudness(x)) / 20)
ceiling = 10 ** (-1 / 20)
peak = np.abs(x).max()
if peak > ceiling:  # gentle soft-clip only above the ceiling
    x = np.where(np.abs(x) > ceiling * 0.9, np.sign(x) * (ceiling * 0.9 + (ceiling * 0.1) * np.tanh((np.abs(x) - ceiling * 0.9) / (ceiling * 0.1))), x)

out = ROOT / args.out
out.parent.mkdir(parents=True, exist_ok=True)
sf.write(out, x.astype(np.float32), SR, subtype='PCM_24')
print(f'wrote {out.relative_to(ROOT)}  {N / SR:.2f}s  {meter.integrated_loudness(x):.1f} LUFS  peak {20 * np.log10(np.abs(x).max()):.2f} dBFS')
