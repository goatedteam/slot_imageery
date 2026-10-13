#!/usr/bin/env python3
"""Sanity-check a rendered video: stream properties, loudness, A/V alignment
against out/soundtrack.wav, and a contact sheet of frames (out/verify_sheet.png).

    python3 -P tools/verify.py [out/coinflip-launch-1080x1350p60.mp4]
"""
import pathlib
import subprocess
import sys
import tempfile

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
video = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'out' / 'coinflip-launch-1080x1350p60.mp4')
ff = 'ffmpeg'

info = subprocess.run([ff, '-hide_banner', '-i', str(video)], capture_output=True, text=True).stderr
print('\n'.join(l.strip() for l in info.splitlines() if 'Duration' in l or 'Stream' in l))
cnt = subprocess.run([ff, '-v', 'error', '-i', str(video), '-map', '0:v', '-f', 'framecrc', '-'],
                     capture_output=True, text=True).stdout
print('video frames:', sum(1 for l in cnt.splitlines() if l and not l.startswith('#')))
print(f'file size: {video.stat().st_size / 1e6:.1f} MB')

with tempfile.TemporaryDirectory() as td:
    wav = pathlib.Path(td) / 'a.wav'
    subprocess.run([ff, '-v', 'error', '-y', '-i', str(video), '-map', '0:a', '-ac', '2', '-ar', '48000', str(wav)], check=True)
    a, sr = sf.read(wav, always_2d=True)
    print(f'audio: {len(a) / sr:.3f}s  {pyln.Meter(sr).integrated_loudness(a):.1f} LUFS  peak {20 * np.log10(np.abs(a).max()):.2f} dBFS')
    ref, _ = sf.read(ROOT / 'out' / 'soundtrack.wav', always_2d=True)
    x, y = a[: 5 * sr, 0], ref[: 5 * sr, 0]
    n = 1 << int(np.ceil(np.log2(len(x) + len(y))))
    xc = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(y, n)), n)
    lag = int(np.argmax(np.abs(xc)))
    lag = lag if lag < n // 2 else lag - n
    print(f'A/V: audio offset vs soundtrack.wav = {lag / sr * 1000:+.2f} ms')

    times = [0.05, 0.75, 1.75, 2.5, 3.0, 4.3, 5.45, 7.45, 8.15, 9.15, 9.7, 10.25,
             10.6, 11.3, 11.85, 12.25, 13.0, 13.7, 14.4, 15.05, 15.9, 16.8, 17.6, 18.3]
    tiles = []
    for t in times:
        p = pathlib.Path(td) / f'f_{t}.png'
        subprocess.run([ff, '-v', 'error', '-y', '-ss', str(t), '-i', str(video), '-frames:v', '1', '-vf', 'scale=270:338', str(p)], check=True)
        tiles.append((t, Image.open(p).convert('RGB')))
    cols, w, h = 6, 270, 338
    rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * (h + 22)))
    d = ImageDraw.Draw(S)
    for i, (t, im) in enumerate(tiles):
        x0, y0 = (i % cols) * w, (i // cols) * (h + 22)
        S.paste(im, (x0, y0 + 22))
        d.text((x0 + 6, y0 + 5), f'{t:.2f}s', fill=(213, 251, 35))
    S.save(ROOT / 'out' / 'verify_sheet.png')
    print('wrote out/verify_sheet.png')
