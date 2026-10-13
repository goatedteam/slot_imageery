#!/usr/bin/env python3
"""Build out/soundtrack.wav for the Coinflip launch video.

The supplied track (Mura Masa – Love$ick ft. A$AP Rocky) is used from 0:46.754 to
1:01.754: it opens on a section downbeat, falls to a dead stop at 0:56.70 and drops
into its heaviest bass at 0:57.54, which lands on the BIG WIN. Only that 15 s
excerpt is kept in the repo; pass --src with the full track to re-cut it.

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
EXCERPT = ROOT / 'audio' / 'lovesick-0m46.754-1m01.754.flac'

ap = argparse.ArgumentParser()
ap.add_argument('--src', help='full track to cut the excerpt from')
ap.add_argument('--out', default='out/soundtrack.wav')
ap.add_argument('--lufs', type=float, default=-14.0)
args = ap.parse_args()

cues = json.loads(subprocess.check_output(
    ['node', '-e', "global.window={}; require('./src/cues.js'); process.stdout.write(JSON.stringify(window.CUES))"], cwd=ROOT))
m, dur = cues['music'], cues['duration']

if args.src:
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
knee = ceiling * 0.9
over = np.abs(x) > knee  # soft-clip only what pokes above the knee
x[over] = np.sign(x[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(x[over]) - knee) / (ceiling - knee)))

out = ROOT / args.out
out.parent.mkdir(parents=True, exist_ok=True)
sf.write(out, x.astype(np.float32), SR, subtype='PCM_24')
print(f'wrote {out.relative_to(ROOT)}  {N / SR:.2f}s  {meter.integrated_loudness(x):.1f} LUFS  peak {20 * np.log10(np.abs(x).max()):.2f} dBFS')
