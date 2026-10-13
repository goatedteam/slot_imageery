// Renders the teaser to video.
//
//   node render.mjs                 → out/coinflip-teaser-1080p60.mp4
//   node render.mjs --clean         → out/coinflip-teaser-clean-1080p60.mp4 (logo-only ending)
//   node render.mjs --start 5 --end 7 --no-audio   → a section, for review
//
// Motion blur and anti-aliasing are done inside the page (window.__seek renders a
// frame as the average of several jittered HDR sub-frames), so each frame is a
// single capture. A pool of headless Chromium workers pulls short blocks of
// frames from a queue and pipes them to ffmpeg; the blocks are then joined and
// muxed with out/soundtrack.wav (npm run audio).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import { serve } from './tools/serve.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);

const W = 1920, H = 1080;
const FPS = Number(opt('fps', 60));
const CLEAN = flag('clean');
const WORKERS = Number(opt('workers', Math.max(1, Math.min(4, os.cpus().length))));
const BLOCK = Number(opt('block', 20));
const START = Number(opt('start', 0));
const END = Number(opt('end', 10));
const CRF = String(opt('crf', 15));
const OUT = path.resolve(root, opt('out', `out/coinflip-teaser${CLEAN ? '-clean' : ''}-1080p${FPS}.mp4`));
const AUDIO = path.resolve(root, opt('audio', 'out/soundtrack.wav'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const chunkDir = path.join(root, 'out', `chunks${CLEAN ? '-clean' : ''}`);
rmSync(chunkDir, { recursive: true, force: true });
mkdirSync(chunkDir, { recursive: true });

const f0 = Math.round(START * FPS), f1 = Math.round(END * FPS);
const total = f1 - f0;
const blocks = [];
for (let a = f0, k = 0; a < f1; a += BLOCK, k++) blocks.push({ k, a, b: Math.min(f1, a + BLOCK) });
const nBlocks = blocks.length;
const started = Date.now();
let framesDone = 0, lastPct = -1;

function report(force) {
  const pct = Math.floor((framesDone / total) * 20) * 5;
  if (!force && pct === lastPct) return;
  lastPct = pct;
  const el = (Date.now() - started) / 1000;
  const eta = framesDone ? (el / framesDone) * (total - framesDone) : 0;
  console.log(`  ${String(pct).padStart(3)}%  frames ${framesDone}/${total}  ${(framesDone / el || 0).toFixed(2)} fps  eta ${eta.toFixed(0)}s`);
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
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '6',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + file)))));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

const { server, url } = await serve(root);

async function worker() {
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`${url}/index.html?render=1${CLEAN ? '&clean=1' : ''}`);
  await page.waitForFunction('window.__ready === true || window.__error', null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  const cdp = await page.context().newCDPSession(page);
  for (let blk = blocks.shift(); blk; blk = blocks.shift()) {
    const enc = encoder(path.join(chunkDir, `chunk_${String(blk.k).padStart(3, '0')}.mkv`));
    for (let f = blk.a; f < blk.b; f++) {
      await page.evaluate((t) => window.__seek(t), f / FPS);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      await enc.write(Buffer.from(data, 'base64'));
      framesDone++;
      report();
    }
    await enc.end();
  }
  await browser.close();
}

console.log(`Rendering ${total} frames @ ${FPS} fps${CLEAN ? ' (clean ending)' : ''}, ${WORKERS} workers, ${nBlocks} blocks`);
await Promise.all(Array.from({ length: WORKERS }, () => worker()));
server.close();
report(true);
console.log(`  rendered in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const list = path.join(chunkDir, 'list.txt');
writeFileSync(list, Array.from({ length: nBlocks }, (_, k) => `file '${path.join(chunkDir, `chunk_${String(k).padStart(3, '0')}.mkv`)}'`).join('\n'));
const hasAudio = existsSync(AUDIO) && !flag('no-audio');
await run(FFMPEG, [
  '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', list,
  ...(hasAudio ? ['-ss', String(START), '-t', String(END - START), '-i', AUDIO] : []),
  '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-level', '4.2',
  '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-r', String(FPS), '-g', String(FPS), '-bf', '2',
  ...(hasAudio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest'] : []),
  '-movflags', '+faststart', OUT,
]);
console.log('wrote', path.relative(root, OUT), hasAudio ? '(with soundtrack)' : '(no audio)');
