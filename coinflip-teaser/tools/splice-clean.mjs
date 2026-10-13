// Builds the logo-only version without re-rendering the shared opening:
// frames before --split come from the main render's chunks (out/chunks), the rest
// from `node render.mjs --clean --start <split>` (out/chunks-clean). Both renders
// must use the same --block size so the split lands on a chunk boundary.
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const FPS = Number(opt('fps', 60)), BLOCK = Number(opt('block', 20)), SPLIT = Number(opt('split', 6));
const OUT = path.resolve(root, opt('out', `out/coinflip-teaser-clean-1080p${FPS}.mp4`));
const AUDIO = path.join(root, 'out', 'soundtrack.wav');

const firstFrame = Math.round(SPLIT * FPS);
if (firstFrame % BLOCK) throw new Error(`split ${SPLIT}s is not on a ${BLOCK}-frame chunk boundary`);
const head = Array.from({ length: firstFrame / BLOCK }, (_, k) => path.join(root, 'out', 'chunks', `chunk_${String(k).padStart(3, '0')}.mkv`));
for (const f of head) if (!existsSync(f)) throw new Error(`missing ${f}; run the main render first`);
const tail = readFileSync(path.join(root, 'out', 'chunks-clean', 'list.txt'), 'utf8').trim().split('\n');
const list = path.join(root, 'out', 'chunks-clean', 'spliced.txt');
writeFileSync(list, [...head.map((f) => `file '${f}'`), ...tail].join('\n'));

await new Promise((resolve, reject) => {
  const p = spawn('ffmpeg', [
    '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', AUDIO,
    '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level', '4.2',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(FPS), '-g', String(FPS), '-bf', '2',
    '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c))));
});
console.log('wrote', path.relative(root, OUT));
