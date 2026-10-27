// Renders render.html frame by frame with a headless browser and pipes the frames into ffmpeg.
//
//   cd <repo root> && python3 -m http.server 8765 &
//   node video-source/render.mjs                       # full video -> video-source/build/frames.mp4 (silent)
//   node video-source/render.mjs --preview 5,12.5,40   # PNG stills for checking
//
// Then mux with the narration (see README in this folder).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, TOTAL = 90;
const url = process.env.RENDER_URL || 'http://localhost:8765/video-source/render.html';
const previewArg = process.argv.indexOf('--preview');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => window.ready);
const canvas = page.locator('#c');
mkdirSync(path.join(here, 'build'), { recursive: true });

if (previewArg > 0) {
  const times = process.argv[previewArg + 1].split(',').map(Number);
  for (const t of times) {
    await page.evaluate((t) => window.renderFrame(t), t);
    await canvas.screenshot({ path: path.join(here, 'build', `preview_${t.toFixed(2)}.png`) });
  }
  console.log('previews written');
} else {
  const out = path.join(here, 'build', 'frames.mp4');
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = FPS * TOTAL;
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.renderFrame(t), i / FPS);
    const buf = await canvas.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  writeFileSync(path.join(here, 'build', 'render-done.txt'), new Date().toISOString());
  console.log('done', out);
}
await browser.close();
