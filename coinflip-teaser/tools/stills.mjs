// Render individual frames for review:  node tools/stills.mjs 0 1.3 6.2 [--clean] [--look gold] [--sheet]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import path from 'path';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const times = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--look'].includes(args[i - 1]))).map(Number);
const q = new URLSearchParams({ render: '1' });
if (args.includes('--clean')) q.set('clean', '1');
if (val('look')) q.set('look', val('look'));
const outDir = path.join(root, 'out', 'stills');
mkdirSync(outDir, { recursive: true });

const { server, url } = await serve(root);
const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`${url}/index.html?${q}`);
await page.waitForFunction('window.__ready === true || window.__error', null, { timeout: 120000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('page error:', err); process.exit(1); }
console.log(`ready in ${Date.now() - t0} ms`);
const files = [];
for (const t of times) {
  const a = Date.now();
  await page.evaluate((t) => window.__seek(t), t);
  const f = path.join(outDir, `t_${t.toFixed(2).padStart(5, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
  console.log(`t=${t}  ${Date.now() - a} ms`);
}
await browser.close();
server.close();
if (args.includes('--sheet') && files.length) {
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[1:]; cols=3; w,h=640,360; rows=(len(fs)+cols-1)//cols
S=Image.new('RGB',(cols*w,rows*(h+26))); d=ImageDraw.Draw(S)
for i,f in enumerate(fs):
    x=(i%cols)*w; y=(i//cols)*(h+26); S.paste(Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS),(x,y+26)); d.text((x+6,y+6),f.split('t_')[-1][:-4]+'s',fill=(213,251,35))
S.save('${path.join(outDir, 'sheet.png')}')`, ...files]);
  console.log('wrote out/stills/sheet.png');
}
