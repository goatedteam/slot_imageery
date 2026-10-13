#!/usr/bin/env python3
"""Build out/soundtrack.wav for the Coinflip launch video.

1. Music: Mura Masa – Love$ick ft. A$AP Rocky from 0:46.754.
   - When the 10th coin lands (0:57.18, the hit before the drop), the music is cut and
     freezes into a reverb tail for two beats while the picture holds on 1,003.52×. A
     swell builds back in.
   - The same hit, the drop and the rest of the excerpt then carry on. It ends with a
     fade from the last bar line.
   - Only the excerpt used is kept in the repo; pass --src with the full track to re-cut it.
2. Sound design for the game panel, synthesised and timed from src/cues.js:
   - a tap on every Bet Heads / Bet Tails press, panned to the button;
   - a flick and a fluttering spin for every flip. The flutter follows the coin's
     on-screen rotation, so it slows down in the slow-motion 10th flip;
   - a clink on every landing, and a win chime that climbs the scale with the streak;
   - a bigger clink, chime and sparkle on the 10th.
3. Mix, normalise to -14 LUFS and soft-limit under -1 dBFS.

    python3 -P audio/build_soundtrack.py [--src full-track.mp3] [--no-sfx] [--sfx-gain dB]
"""
import argparse
import json
import pathlib
import subprocess

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 48000

ap = argparse.ArgumentParser()
ap.add_argument('--src', help='full track to cut the excerpt from')
ap.add_argument('--no-sfx', action='store_true', help='music edit only')
ap.add_argument('--sfx-gain', type=float, default=0.0, help='trim for the whole sound-design layer (dB)')
ap.add_argument('--out', default='out/soundtrack.wav')
ap.add_argument('--lufs', type=float, default=-14.0)
args = ap.parse_args()

# cue sheet + the coin's on-screen angle during the flips, straight from src/cues.js
NODE = r"""
global.window = {};
require('./src/cues.js');
const C = window.CUES;
const rate = 2000, t0 = C.toss.start[0] - 0.05, t1 = C.toss.lands[9] + 0.05;
const v = [];
for (let i = 0; t0 + i / rate <= t1; i++) v.push(+C.tossAt(t0 + i / rate).theta.toFixed(5));
process.stdout.write(JSON.stringify({ cues: C, theta: { t0, rate, v } }));
"""
data = json.loads(subprocess.check_output(['node', '-e', NODE], cwd=ROOT))
C, TH = data['cues'], data['theta']
M, TOSS = C['music'], C['toss']
N = int(round(C['duration'] * SR))
rng = np.random.default_rng(7)


def tag(sec):  # 46.754 → '0m46.754'
    return f'{int(sec // 60)}m{sec % 60:06.3f}'


# ---------------------------------------------------------------- music edit
song_len = round(C['duration'] - M['gap'], 3)
EXCERPT = ROOT / 'audio' / f"lovesick-{tag(M['srcStart'])}-{tag(M['srcStart'] + song_len)}.flac"
if args.src:
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(M['srcStart']), '-t', f'{song_len:.3f}', '-i', args.src,
                    '-ar', str(SR), '-ac', '2', '-c:a', 'flac', str(EXCERPT)], check=True)
    print('cut', EXCERPT.relative_to(ROOT))

x, sr = sf.read(EXCERPT, dtype='float64', always_2d=True)
assert sr == SR, f'expected {SR} Hz, got {sr}'
L = int(round(song_len * SR))
x = np.pad(x, ((0, max(0, L - len(x))), (0, 0)))[:L]


def at(t):
    return int(round(t * SR))


def bp(sig, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), sig, axis=0)


def hp(sig, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), sig, axis=0)


def lp(sig, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), sig, axis=0)


def env(n, attack, tau):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


def norm(sig):
    return sig / (np.abs(sig).max() + 1e-12)


def rms(sig):
    return np.sqrt(np.mean(sig ** 2) + 1e-20)


def reverb_ir(seconds, rt60, dark_hz, seed):
    """Stereo decaying-noise impulse response that darkens as it decays; unit energy per channel."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal((n, 2)) * np.exp(-6.91 * t / rt60)[:, None]
    w = np.clip(t / (rt60 * 0.5), 0, 1)[:, None]
    ir = ir * (1 - w) + lp(ir, dark_hz) * w
    a = int(0.006 * SR)
    ir[:a] *= np.linspace(0, 1, a)[:, None]
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def whoosh(dur, f0, f1, shape='rise'):
    """Noise through a band-pass whose centre glides f0 → f1 (processed in short blocks)."""
    n = int(dur * SR)
    src = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 256
    for s in range(0, n, blk):
        fc = f0 * (f1 / f0) ** (s / n)
        y = bp(src[max(0, s - 2048): s + blk], fc / 1.6, min(fc * 1.6, SR / 2 - 200))
        out[s: s + blk] = y[-len(out[s: s + blk]):]
    t = np.linspace(0, 1, n)
    e = t ** 2.4 * (1 - np.clip((t - 0.985) / 0.015, 0, 1)) if shape == 'rise' else np.sin(np.pi * t) ** 1.5
    return norm(out * e)


g, G = at(M['gapAt']), at(M['gap'])
music = np.zeros((N, 2))
pre, post = x[:g].copy(), x[g:].copy()
fo, fi = int(0.006 * SR), int(0.003 * SR)
pre[-fo:] *= np.linspace(1, 0, fo)[:, None]
post[:fi] *= np.linspace(0, 1, fi)[:, None]
music[:g] = pre
music[g + G: g + G + len(post)] = post[: N - g - G]

# the freeze: throw the last moment before the cut into a long reverb that rings over the hold
feed = pre[-int(0.4 * SR):].copy()
feed *= np.clip(np.linspace(0, 1, len(feed)) / 0.35, 0, 1)[:, None]  # send ramps up into the cut
ir = reverb_ir(2.2, 1.7, 3500, seed=3)
wet = hp(np.stack([fftconvolve(feed[:, c], ir[:, c]) for c in range(2)], 1), 160)
w0 = g - len(feed)
wet = wet[: g + G - w0]
k0 = g - w0
wet *= rms(pre[-int(0.15 * SR):]) / rms(wet[k0: k0 + int(0.15 * SR)]) * 10 ** (-3 / 20)
ft = int(0.3 * SR)
wet[-ft:] *= (np.cos(np.linspace(0, np.pi / 2, ft)) ** 2)[:, None]
music[w0: w0 + len(wet)] += wet

# a swell that pulls back into the returning hit (its onset sits 4 ms after the gap ends)
sw = whoosh(0.85, 350, 6500, 'rise') * rms(pre[-int(0.15 * SR):]) * 10 ** (4 / 20)  # peak a little over the break's level
s0 = g + G + int(0.004 * SR) - len(sw)
music[s0: s0 + len(sw)] += sw[:, None] * np.array([0.92, 1.0])

fa, fz = int(M['fadeIn'] * SR), int(M['fadeOut'] * SR)
music[:fa] *= np.linspace(0, 1, fa)[:, None]
music[-fz:] *= (np.cos(np.linspace(0, np.pi / 2, fz)) ** 2)[:, None]

meter = pyln.Meter(SR)
music *= 10 ** ((args.lufs - meter.integrated_loudness(music)) / 20)

# ---------------------------------------------------------------- sound design kit
def place(bus, t, mono, gain_db, pan=0.0):
    """Add a mono sound (peak-normalised) at time t (s), gain in dBFS, constant-power pan (-1..1)."""
    gain = 10 ** ((gain_db + args.sfx_gain) / 20)
    th = (pan + 1) * np.pi / 4
    i = at(t)
    j = min(N, i + len(mono))
    if j <= i:
        return
    seg = mono[: j - i] * gain
    bus[i:j, 0] += seg * np.cos(th)
    bus[i:j, 1] += seg * np.sin(th)


def coin_ring(f0, tau, seconds, bright=1.0):
    """Struck coin: inharmonic plate modes with their own decays, beating against a detuned twin."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, dk in ((1.0, 1.0, 1.0), (2.29, 0.55, 0.6), (3.92, 0.32, 0.38), (5.79, 0.16, 0.24)):
        if f0 * ratio > SR * 0.45:
            continue
        y += amp * (bright if ratio > 1 else 1.0) * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / (tau * dk))
    y += 0.35 * np.sin(2 * np.pi * f0 * 1.0035 * t) * np.exp(-t / tau)
    a = int(0.0008 * SR)
    y[:a] *= np.linspace(0, 1, a)
    return y


def tap():
    """Bet button press: a crisp plastic 'tk' with a little body."""
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    click = bp(rng.standard_normal(n), 1800, 7000) * env(n, 0.0002, 0.004)
    body = (np.sin(2 * np.pi * 1400 * t) * env(n, 0.0004, 0.010) * 0.5
            + np.sin(2 * np.pi * 2800 * t) * env(n, 0.0003, 0.005) * 0.25
            + np.sin(2 * np.pi * 170 * t) * env(n, 0.001, 0.016) * 0.25)
    return norm(click + body)


def flick(f0):
    """Thumb flick: a tick and a short metallic ting as the coin leaves."""
    n = int(0.45 * SR)
    tick = hp(rng.standard_normal(n), 2800) * env(n, 0.0001, 0.0012)
    return norm(0.55 * tick + coin_ring(f0, 0.07, 0.45, bright=0.85))


TH_V = np.array(TH['v'])
TH_T = TH['t0'] + np.arange(len(TH_V)) / TH['rate']


def spin(k):
    """Airy flutter while the coin turns: one pulse per face, band brightness follows the spin speed."""
    s0, s1 = TOSS['start'][k], TOSS['lands'][k]
    n = int((s1 - s0) * SR)
    ts = s0 + np.arange(n) / SR
    th = np.interp(ts, TH_T, TH_V)
    om = np.abs(np.gradient(th) * SR)
    flutter = 0.18 + 0.82 * np.abs(np.cos(th)) ** 3
    fc = np.clip(900 + 4300 * om / (2 * np.pi * 7), 650, 6800)
    src = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 240
    for s in range(0, n, blk):
        y = bp(src[max(0, s - 2048): s + blk], fc[s] / 1.5, min(fc[s] * 1.5, SR / 2 - 200))
        out[s: s + blk] = y[-len(out[s: s + blk]):]
    p = np.linspace(0, 1, n)
    shape = np.clip(p / 0.06, 0, 1) * np.clip((1 - p) / 0.1, 0, 1)
    return norm(out * flutter * shape)


def clink(f0, big=False):
    """Landing: a soft impact, a damped ring and two tiny rattles as it settles."""
    n = int((0.9 if big else 0.45) * SR)
    t = np.arange(n) / SR
    impact = lp(rng.standard_normal(n), 2400) * env(n, 0.0004, 0.010 if big else 0.006)
    fbody = 140 + 70 * np.exp(-t / 0.02)
    body = np.sin(2 * np.pi * np.cumsum(fbody) / SR) * env(n, 0.0008, 0.05 if big else 0.03)
    y = 0.7 * impact + (0.6 if big else 0.4) * body + coin_ring(f0, 0.11 if big else 0.05, n / SR)
    for dt, a in ((0.034, 0.32), (0.061, 0.16)):
        i = int(dt * SR)
        r = coin_ring(f0 * 1.03, 0.02, 0.12)
        y[i: i + len(r)] += a * r[: n - i]
    return norm(y)


def bell(f, length):
    """Soft bell: harmonic-ish partials, each a slightly detuned pair."""
    n = int(length * 3.2 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, dk in ((1.0, 1.0, 1.0), (2.0, 0.42, 0.62), (3.0, 0.2, 0.42), (4.07, 0.1, 0.28), (5.4, 0.05, 0.18)):
        if f * ratio > SR * 0.45:
            continue
        for det in (-0.0009, 0.0009):
            y += 0.5 * amp * np.sin(2 * np.pi * f * ratio * (1 + det) * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / (length * dk))
    a = int(0.002 * SR)
    y[:a] *= np.linspace(0, 1, a)
    return y


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def chime(midi, length=0.42):
    """Win 'bling': the note, then its fifth 50 ms later."""
    a, b = bell(hz(midi), length), bell(hz(midi + 7), length * 0.8)
    d = int(0.05 * SR)
    y = np.zeros(max(len(a), d + len(b)))
    y[: len(a)] += a
    y[d: d + len(b)] += 0.6 * b
    return norm(y)


def big_chime():
    """10 in a row: a rising open-fifth arpeggio that rings across the hold."""
    y = np.zeros(int(2.4 * SR))
    for i, mn in enumerate((80, 87, 92, 99)):  # G#5 D#6 G#6 D#7
        b = bell(hz(mn), 0.75)
        d = int(i * 0.055 * SR)
        m = min(len(b), len(y) - d)
        y[d: d + m] += b[:m] * 0.9 ** i
    return norm(y)


def glitter(seconds=1.0, count=34):
    """Sparkle: tiny high pings scattered over a second, thinning out."""
    n = int(seconds * SR)
    y = np.zeros(n)
    m = int(0.03 * SR)
    tt = np.arange(m) / SR
    for i in range(count):
        t0 = (rng.random() ** 1.7) * (seconds - 0.04)
        f = rng.uniform(4200, 8800)
        i0 = int(t0 * SR)
        y[i0: i0 + m] += (1 - t0 / seconds) * np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.008)
    return norm(y)


# G# minor pentatonic, climbing with the streak: G#5 B5 C#6 D#6 F#6 G#6 B6 C#7 D#7
NOTES = (80, 83, 85, 87, 90, 92, 95, 97, 99)

sfx = np.zeros((N, 2))
if not args.no_sfx:
    for k in range(10):
        big = k == 9
        land = TOSS['lands'][k]
        place(sfx, TOSS['taps'][k], tap(), -16, pan=-0.4 if C['calls'][k] == 'H' else 0.4)
        place(sfx, TOSS['start'][k], flick(2350 * (1 + 0.02 * rng.standard_normal())), -20)
        place(sfx, TOSS['start'][k] + 0.004, spin(k), -24 if big else -26)
        place(sfx, land, clink(2900 * (1 + 0.015 * rng.standard_normal()), big), -9 if big else -13)
        if big:
            place(sfx, land + 0.012, big_chime(), -11)
            place(sfx, land + 0.03, glitter(), -22)
        else:
            place(sfx, land + 0.012, chime(NOTES[k]), -19 + 0.3 * k)
    # a little room so the synthesised sounds sit in the same space as the track
    room = reverb_ir(0.6, 0.35, 6000, seed=11)
    sfx += 10 ** (-13 / 20) * np.stack([fftconvolve(sfx[:, c], room[:, c])[:N] for c in range(2)], 1)

# ---------------------------------------------------------------- mix + master
game = slice(at(C['toUI']), at(C['tenth']))
if not args.no_sfx:
    print(f"music {meter.integrated_loudness(music[game]):.1f} LUFS vs sound design {meter.integrated_loudness(sfx[game]):.1f} LUFS "
          f"over the game ({C['toUI']}–{C['tenth']} s); sound design peak {20 * np.log10(np.abs(sfx).max()):.1f} dBFS")
mix = music + sfx
mix *= 10 ** ((args.lufs - meter.integrated_loudness(mix)) / 20)
ceiling = 10 ** (-1 / 20)
knee = ceiling * 0.9
over = np.abs(mix) > knee  # soft-clip only what pokes above the knee
mix[over] = np.sign(mix[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(mix[over]) - knee) / (ceiling - knee)))

out = ROOT / args.out
out.parent.mkdir(parents=True, exist_ok=True)
sf.write(out, mix.astype(np.float32), SR, subtype='PCM_24')
print(f'wrote {out.relative_to(ROOT)}  {N / SR:.2f}s  {meter.integrated_loudness(mix):.1f} LUFS  peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS')
