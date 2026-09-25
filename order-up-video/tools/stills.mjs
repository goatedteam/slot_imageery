// Render individual frames for review:  node tools/stills.mjs 0 0.5 1.4 ...  (seconds)
// Writes out/stills/t_<time>.png and, with --sheet, a contact sheet out/stills/sheet.png
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const sheet = args.includes('--sheet');
const times = args.filter((a) => !a.startsWith('--')).map(Number);
const outDir = path.join(root, 'out', 'stills');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(root, 'index.html') + '?render=1');
await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
const files = [];
for (const t of times) {
  await page.evaluate((t) => window.__seek(t), t);
  const f = path.join(outDir, `t_${t.toFixed(2).padStart(5, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
  console.log('wrote', path.relative(root, f));
}
await browser.close();

if (sheet && files.length) {
  const { execFileSync } = await import('child_process');
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
files=sys.argv[1:]
cols=3; w,h=640,360
rows=(len(files)+cols-1)//cols
S=Image.new('RGB',(cols*w,rows*(h+28)),(0,0,0))
d=ImageDraw.Draw(S)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS)
    x=(i%cols)*w; y=(i//cols)*(h+28)
    S.paste(im,(x,y+28)); d.text((x+8,y+6),f.split('t_')[-1][:-4]+'s',fill=(213,251,35))
S.save('${path.join(outDir, 'sheet.png')}')
`, ...files]);
  console.log('wrote out/stills/sheet.png');
}
