#!/usr/bin/env python3
"""Build out/soundtrack.wav for the Order Up launch film.

1. Cuts the supplied track (audio/order-up-drop.wav, 150 BPM) down to 15 s on bar
   lines so its drop lands on the 1000x reveal. Each join is an equal-power
   crossfade that finishes exactly on the downbeat, so the incoming transient
   stays intact.
2. Adds a light, synced sound-design layer (card flicks, UI ticks, the Bet
   click, whooshes, heartbeat, impact, payout shimmer), all procedurally
   synthesised from the same cue sheet the picture uses (src/cues.js).
3. Normalises to -14 LUFS with a -1 dBFS ceiling.

    python3 audio/build_soundtrack.py [--no-sfx] [--out out/soundtrack.wav]
"""
import argparse
import json
import pathlib
import subprocess

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 48000

ap = argparse.ArgumentParser()
ap.add_argument('--no-sfx', action='store_true', help='music edit only')
ap.add_argument('--out', default='out/soundtrack.wav')
ap.add_argument('--lufs', type=float, default=-14.0)
args = ap.parse_args()

cues = json.loads(subprocess.check_output(
    ['node', '-e', "global.window={}; require('./src/cues.js'); process.stdout.write(JSON.stringify(window.CUES))"],
    cwd=ROOT))
N = int(round(cues['duration'] * SR))
rng = np.random.default_rng(1234)

# ---------------------------------------------------------------- music edit
src, sr = sf.read(ROOT / 'audio' / 'order-up-drop.wav', dtype='float32', always_2d=True)
assert sr == SR, f'expected {SR} Hz, got {sr}'
music = np.zeros((N, 2), np.float32)
XF = int(0.012 * SR)  # 12 ms crossfade ending on the downbeat
segs = cues['music']['segments']
for k, seg in enumerate(segs):
    s0, d0, L = (int(round(seg[key] * SR)) for key in ('src', 'dst', 'len'))
    pre = XF if k > 0 else 0
    chunk = src[s0 - pre: s0 + L].copy()
    th = np.linspace(0, np.pi / 2, XF, dtype=np.float32)
    if pre:
        chunk[:XF] *= np.sin(th)[:, None]          # fade in under the previous tail
    if k < len(segs) - 1:
        chunk[-XF:] *= np.cos(th)[:, None]         # fade out into the next downbeat
    a = d0 - pre
    b = min(N, a + len(chunk))
    music[a:b] += chunk[: b - a]

fade = int(cues['music']['fadeOut'] * SR)
music[-fade:] *= (np.cos(np.linspace(0, np.pi / 2, fade)) ** 2)[:, None].astype(np.float32)

# ---------------------------------------------------------------- synth kit
def at(t):
    return int(round(t * SR))


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def env(n, attack, tau):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


def place(bus, t, mono, gain_db, pan=0.0):
    """Add a mono sound at time t (s) with constant-power pan (-1..1)."""
    g = 10 ** (gain_db / 20)
    th = (pan + 1) * np.pi / 4
    i = at(t)
    j = min(N, i + len(mono))
    if j <= i:
        return
    seg = mono[: j - i] * g
    bus[i:j, 0] += seg * np.cos(th)
    bus[i:j, 1] += seg * np.sin(th)


def norm(x):
    return x / (np.abs(x).max() + 1e-9)


def flick(bright=1.0):
    """Card snap: a short band-passed noise burst over a tiny body 'tok'."""
    n = int(0.06 * SR)
    snap = bp(rng.standard_normal(n), 1800 * bright, min(15000, 7000 * bright)) * env(n, 0.0006, 0.009)
    tok = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * env(n, 0.001, 0.018) * 0.35
    return norm(snap + tok)


def tick(freq=3500):
    n = int(0.03 * SR)
    click = bp(rng.standard_normal(n), freq * 0.7, freq * 1.4) * env(n, 0.0003, 0.004)
    tone = np.sin(2 * np.pi * freq * 0.5 * np.arange(n) / SR) * env(n, 0.0005, 0.007) * 0.5
    return norm(click + tone)


def mouse_click():
    n = int(0.05 * SR)
    x = np.zeros(n)
    for off, amp in ((0, 1.0), (int(0.007 * SR), 0.55)):
        m = int(0.012 * SR)
        x[off: off + m] += hp(rng.standard_normal(m), 2500) * env(m, 0.0002, 0.0018) * amp
    return norm(x)


def whoosh(dur, f0, f1, shape='rise'):
    """Noise through a band-pass whose centre glides f0 → f1 (processed in short blocks)."""
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 256
    for s in range(0, n, blk):
        p = s / n
        fc = f0 * (f1 / f0) ** p
        seg = x[max(0, s - 2048): s + blk]
        y = bp(seg, fc / 1.6, min(fc * 1.6, SR / 2 - 100))
        out[s: s + blk] = y[-len(out[s: s + blk]):]
    t = np.linspace(0, 1, n)
    if shape == 'rise':
        e = t ** 2.2 * (1 - np.clip((t - 0.97) / 0.03, 0, 1))
    elif shape == 'fall':
        e = np.clip(t / 0.08, 0, 1) * (1 - t) ** 1.6
    else:  # swell
        e = np.sin(np.pi * t) ** 1.5
    return norm(out * e)


def thump(f0=62, f1=38, dur=0.22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.05)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return norm(np.sin(ph) * env(n, 0.002, dur / 3.2))


def crash(dur=1.4):
    n = int(dur * SR)
    return norm(hp(rng.standard_normal(n), 4500) * env(n, 0.001, 0.32))


def shimmer(t0, dur, count, seed):
    """A spray of short high pings: coins / sparkle."""
    r = np.random.default_rng(seed)
    n = int((dur + 0.2) * SR)
    x = np.zeros((n, 2))
    for _ in range(count):
        st = int(r.uniform(0, dur) * SR)
        f = r.uniform(3200, 8200)
        m = int(0.09 * SR)
        tt = np.arange(m) / SR
        ping = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt)) * env(m, 0.0004, r.uniform(0.012, 0.035))
        pan = r.uniform(-0.8, 0.8)
        th = (pan + 1) * np.pi / 4
        e = min(n, st + m)
        x[st:e, 0] += ping[: e - st] * np.cos(th) * r.uniform(0.4, 1)
        x[st:e, 1] += ping[: e - st] * np.sin(th) * r.uniform(0.4, 1)
    return x / (np.abs(x).max() + 1e-9)


# ---------------------------------------------------------------- sound design
sfx = np.zeros((N, 2))
C = cues

# kinetic type: a soft weight under each word
for i, t in enumerate(C['words']):
    place(sfx, t, thump(78, 46, 0.25), -17)
    place(sfx, t, flick(1.3), -23, pan=0.0)

# zoom through the O: riser whoosh into the 808
place(sfx, C['zoomStart'] - 0.05, whoosh(C['zoomEnd'] - C['zoomStart'] + 0.05, 500, 7000, 'rise'), -15)

# title cards dealt + flipped
for i, t in enumerate(C['titleFlips']):
    place(sfx, t, flick(1.0 + i * 0.04), -21, pan=-0.55 + i * 0.157)

# pull back into the UI
place(sfx, C['toUI'] - 0.02, whoosh(0.65, 5000, 500, 'fall'), -19)
for i, t in enumerate(C['flipBack']):
    place(sfx, t + 0.1, flick(0.9), -28, pan=-0.5 + i * 0.14)

# tiles 3 → 8, then the paytable values land
for i, t in enumerate(C['tileSteps']):
    place(sfx, t, tick(2600 + i * 450), -24, pan=-0.45)
for i in range(8):
    place(sfx, C['payReveal'] + i * 0.045, tick(4200 + i * 250), -31, pan=-0.3 + i * 0.1)

# the Bet click and the camera whip to the cards
place(sfx, C['click'], mouse_click(), -17, pan=-0.35)
place(sfx, C['click'] + 0.03, whoosh(0.38, 900, 4200, 'swell'), -23)

# the run: every card snaps up a little brighter than the last
for i, t in enumerate(C['flips']):
    place(sfx, t, flick(1.0 + i * 0.12), -19 + i * 0.6, pan=-0.5 + i * 0.14)

# the standoff on card 8
for t in C['heartbeats']:
    place(sfx, t, thump(58, 36, 0.3), -15)

# 1000x
place(sfx, C['reveal'], flick(1.8), -15, pan=0.5)
place(sfx, C['reveal'], thump(52, 30, 0.9), -16)
place(sfx, C['reveal'], crash(1.6), -24)
sh = shimmer(C['payout'], 0.7, 46, 7)
i = at(C['payout'])
sfx[i: i + len(sh)] += sh[: N - i] * 10 ** (-27 / 20)

# flip into the end card, the mini cards, the final hit
place(sfx, C['endFlip'] - 0.2, whoosh(0.34, 700, 5200, 'swell'), -21)
for i, t in enumerate(C['endCards']):
    place(sfx, t, flick(1.1), -29, pan=-0.35 + i * 0.1)

mix = music.astype(np.float64)
if not args.no_sfx:
    mix += sfx

# ---------------------------------------------------------------- loudness + ceiling
meter = pyln.Meter(SR)
gain = args.lufs - meter.integrated_loudness(mix)
mix *= 10 ** (gain / 20)
ceiling = 10 ** (-1.0 / 20)
peak = np.abs(mix).max()
if peak > ceiling:
    # soft-knee limiter: smooth gain envelope from a 5 ms look-ahead peak follower
    look = int(0.005 * SR)
    amp = np.abs(mix).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(amp, 1e-9))
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * look + 1)
    g = sosfilt(butter(1, 60, fs=SR, output='sos'), g[::-1])[::-1]  # release smoothing, zero-lag-ish
    g = np.minimum(g, minimum_filter1d(need, size=2 * look + 1))
    mix *= g[:, None]
mix = np.clip(mix, -ceiling, ceiling)

out = ROOT / args.out
out.parent.mkdir(parents=True, exist_ok=True)
sf.write(out, mix.astype(np.float32), SR, subtype='PCM_24')
print(f'wrote {out.relative_to(ROOT)}  {N / SR:.2f}s  {meter.integrated_loudness(mix):.1f} LUFS  '
      f'peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS  sfx={"off" if args.no_sfx else "on"}')
