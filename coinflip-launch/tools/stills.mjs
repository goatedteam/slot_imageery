// Render frames for review:  node tools/stills.mjs 0.5 2.3 7.6 [--sheet]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const times = args.filter((a) => !a.startsWith('--')).map(Number);
const outDir = path.join(root, 'out', 'stills');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto('file://' + path.join(root, 'index.html') + '?render=1');
await page.waitForFunction('window.__ready === true || window.__error', null, { timeout: 60000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('page error:', err); process.exit(1); }
const files = [];
for (const t of times) {
  await page.evaluate((t) => window.__seek(t), t);
  const f = path.join(outDir, `t_${t.toFixed(2).padStart(5, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
if (args.includes('--sheet')) {
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[1:]; cols=4; w,h=360,450; rows=(len(fs)+cols-1)//cols
S=Image.new('RGB',(cols*w,rows*(h+22))); d=ImageDraw.Draw(S)
for i,f in enumerate(fs):
    x=(i%cols)*w; y=(i//cols)*(h+22); S.paste(Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS),(x,y+22)); d.text((x+5,y+5),f.split('t_')[-1][:-4]+'s',fill=(213,251,35))
S.save('${path.join(outDir, 'sheet.png')}')`, ...files]);
}
console.log('ok', files.length);
