// Renders index.html to video.
//
//   node render.mjs                         → out/order-up-launch-1080p60.mp4 (final quality)
//   node render.mjs --fps 30 --blur 1       → quick preview, no motion blur
//
// Motion blur: every output frame is the average of several sub-frames spread
// over a 180° shutter centred on the frame time. The page decides how many
// (window.__subframes(t)): 5 normally, up to 16 where motion is extreme.
// Work is split into short blocks that a pool of headless Chromium workers pull
// from a queue; each block is encoded to a near-lossless chunk, then the chunks
// are concatenated, a whisper of film grain is added and the soundtrack
// (out/soundtrack.wav) is muxed in.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);

const W = 1920, H = 1080;
const FPS = Number(opt('fps', 60));
const BLUR = Number(opt('blur', 1));          // multiplier on the page's sub-frame budget; 0 or 1 sample = off
const SHUTTER = Number(opt('shutter', 0.5));  // fraction of the frame interval the shutter is open
const WORKERS = Number(opt('workers', Math.max(1, Math.min(4, os.cpus().length))));
const BLOCK = Number(opt('block', 24));
const START = Number(opt('start', 0));
const END = Number(opt('end', 15));
const CRF = String(opt('crf', 16));
const GRAIN = Number(opt('grain', 2));        // luma noise strength; >2 balloons the bitrate
const OUT = path.resolve(root, opt('out', `out/order-up-launch-1080p${FPS}.mp4`));
const AUDIO = path.resolve(root, opt('audio', 'out/soundtrack.wav'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const chunkDir = path.join(root, 'out', 'chunks');
rmSync(chunkDir, { recursive: true, force: true });
mkdirSync(chunkDir, { recursive: true });

const f0 = Math.round(START * FPS), f1 = Math.round(END * FPS);
const total = f1 - f0;
const blocks = [];
for (let a = f0, k = 0; a < f1; a += BLOCK, k++) blocks.push({ k, a, b: Math.min(f1, a + BLOCK) });
const started = Date.now();
let framesDone = 0, samples = 0, lastPct = -1;

function report(force) {
  const pct = Math.floor((framesDone / total) * 20) * 5;
  if (!force && pct === lastPct) return;
  lastPct = pct;
  const el = (Date.now() - started) / 1000;
  const eta = framesDone ? (el / framesDone) * (total - framesDone) : 0;
  console.log(`  ${String(pct).padStart(3)}%  frames ${framesDone}/${total}  samples ${samples}  ${(framesDone / el || 0).toFixed(2)} fps  eta ${eta.toFixed(0)}s`);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

function encoder(file) {
  const ff = spawn(FFMPEG, [
    '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '6',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + file)))));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

async function worker(id) {
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--disable-lcd-text'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto('file://' + path.join(root, 'index.html') + '?render=1');
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  const capture = async (t) => {
    await page.evaluate((t) => window.__seek(t), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    samples++;
    return sharp(Buffer.from(data, 'base64')).removeAlpha().raw().toBuffer();
  };
  const acc = new Uint32Array(W * H * 3);
  const out = Buffer.alloc(W * H * 3);

  for (let blk = blocks.shift(); blk; blk = blocks.shift()) {
    const enc = encoder(path.join(chunkDir, `chunk_${String(blk.k).padStart(3, '0')}.mkv`));
    for (let f = blk.a; f < blk.b; f++) {
      const tc = f / FPS;
      const n = BLUR > 0 ? Math.max(1, Math.round((await page.evaluate((t) => window.__subframes(t), tc)) * BLUR)) : 1;
      if (n === 1) {
        await enc.write(await capture(tc));
      } else {
        acc.fill(0);
        for (let s = 0; s < n; s++) {
          const t = tc + ((s + 0.5) / n - 0.5) * (SHUTTER / FPS);
          const px = await capture(Math.max(0, t));
          for (let i = 0; i < px.length; i++) acc[i] += px[i];
        }
        const half = n >> 1;
        for (let i = 0; i < out.length; i++) out[i] = ((acc[i] + half) / n) | 0;
        await enc.write(out);
      }
      framesDone++;
      report();
    }
    await enc.end();
  }
  await browser.close();
}

console.log(`Rendering ${total} frames @ ${FPS} fps, adaptive motion blur x${BLUR} (shutter ${SHUTTER * 360}°), ${WORKERS} workers, ${blocks.length} blocks`);
const nBlocks = blocks.length;
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
report(true);
console.log(`  rendered in ${((Date.now() - started) / 1000).toFixed(0)} s (${samples} samples)`);

const list = path.join(chunkDir, 'list.txt');
writeFileSync(list, Array.from({ length: nBlocks }, (_, k) => `file '${path.join(chunkDir, `chunk_${String(k).padStart(3, '0')}.mkv`)}'`).join('\n'));
const hasAudio = existsSync(AUDIO) && !flag('no-audio');
const vf = [GRAIN > 0 ? `noise=c0s=${GRAIN}:c0f=t` : null, 'format=yuv420p'].filter(Boolean).join(',');
await run(FFMPEG, [
  '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', list,
  ...(hasAudio ? ['-ss', String(START), '-t', String(END - START), '-i', AUDIO] : []),
  '-vf', vf,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-level', '4.2',
  '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-r', String(FPS), '-g', String(FPS), '-bf', '2',
  ...(hasAudio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest'] : []),
  '-movflags', '+faststart', OUT,
]);
console.log('wrote', path.relative(root, OUT), hasAudio ? '(with soundtrack)' : '(no audio)');
