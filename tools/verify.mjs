/* PDF ↔ HTML pixel comparison + frozen mid-transition frames + region decomposition.
   Needs examples/tutorial.{html,pdf} compiled, plus poppler (pdftoppm) and ImageMagick (compare).
   Usage: node tools/verify.mjs            (screenshots land in tools/shots/)      */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'examples');
const SHOT = join(HERE, 'shots');
rmSync(SHOT, { recursive: true, force: true });
mkdirSync(SHOT, { recursive: true });

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const url = 'file://' + join(OUT, 'tutorial.html');
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const VP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
/* the deck opens on the desk; everything here is about the page being presented */
const present = async p => {
  await p.waitForFunction(() => document.querySelector('.vit-deck')?.hasAttribute('data-ready'), null, { timeout: 60000 });
  await p.evaluate(() => { window.vit.mode = 'present'; });
  for (const f of p.frames()) if (f !== p.mainFrame()) await f.waitForLoadState('load').catch(() => { });
};
const bare = p => p.evaluate(() => { const b = document.querySelector('.vit-bar'); if (b) b.remove(); });
/* move and wait for it to be over: vit:move-done pairs one for one with
   vit:move-here, so the listener goes on before the move and nothing is
   guessed */
const move = (p, what, arg) => p.evaluate(([what, arg]) => new Promise(res => {
  const deck = document.querySelector('.vit-deck');
  const go = what === 'go' ? () => window.vit.go(arg) : () => { window.vit.step = arg === 'end' ? window.vit.steps : arg; };
  if ((what === 'go' && window.vit.index === arg) || (what === 'step' && window.vit.steps === 0)) return res();
  deck.addEventListener('vit:move-done', () => res(), { once: true });
  go();
}), [what, arg]);

/* ── 1. frames at rest, compared with the PDF ─────────────────────────── */
const n = await (async () => {
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await present(p); await bare(p);
  const n = await p.evaluate(() => window.vit.total);
  for (let i = 0; i < n; i++) {
    await move(p, 'go', i);
    /* the PDF is the page at rest: step element animations to the end (the PDF shows the last state), cancel continuous ones (the PDF shows the rest state) */
    await move(p, 'step', 'end');
    await p.evaluate(() => document.querySelector('.vit-slide.is-active').getAnimations({ subtree: true }).forEach(a => a.cancel()));
    await p.waitForTimeout(100);
    await p.screenshot({ path: join(SHOT, `html-${i + 1}.png`) });
  }
  await p.close();
  return n;
})();

execFileSync('pdftoppm', ['-png', '-r', '96', '-scale-to-x', '1280', '-scale-to-y', '720',
  join(OUT, 'tutorial.pdf'), join(SHOT, 'pdf')]);

/* The only valid criterion is "the difference is nothing but hollow glyph
   outlines" — a shift or a missing glyph produces solid blobs. The mean is just
   a magnitude: the anti-aliasing difference between two rasterisers sits around
   1, the same page shifted by 2px is more than twice that. Both images are
   blurred by 1px first: a hoisted region is its own box and the browser snaps
   its position to whole pixels (up to half a pixel off), and a theorem box full
   of small text pushes the mean to 2.3 on that half pixel alone —
   anti-aliasing, not displacement; blurred, it drops to 1.1 while a real 2px
   shift stays at 2.5. The densest page (theorem, definition and proof, the
   bodies in italic) sits at 1.65 on that half pixel, and rolling it by a whole
   2px scores 2.9, so 2 still separates a rasteriser from a displacement. The
   real evidence is diff-N.png: outlines or ghosting is obvious to the eye. */
const LIMIT = 2;
console.log(`PDF vs HTML (mean after a 1px blur, out of 255; limit ${LIMIT})`);
let worst = 0;
for (let i = 1; i <= n; i++) {
  const pad = String(i).padStart(String(n).length, '0');
  const pdf = join(SHOT, `pdf-${pad}.png`), html = join(SHOT, `html-${i}.png`);
  const soft = f => { const o = f.replace(/\.png$/, '.soft.png'); execFileSync('convert', [f, '-blur', '0x1', o]); return o; };
  const a = soft(pdf), h = soft(html);
  let out;
  try {
    execFileSync('compare', ['-metric', 'MAE', a, h, 'null:'], { stdio: ['ignore', 'ignore', 'pipe'] });
    out = '0';
  } catch (e) { out = e.stderr.toString(); }
  rmSync(a); rmSync(h);
  execFileSync('convert', [pdf, html, '-compose', 'difference', '-composite',
    '-auto-level', join(SHOT, `diff-${i}.png`)]);
  const mean = (parseFloat(out) / 65535) * 255;
  worst = Math.max(worst, mean);
  console.log(`  page ${i}  ${mean.toFixed(3)}`);
}
console.log(`  worst   ${worst.toFixed(3)}  ${worst < LIMIT ? '✓' : '✗'}   diff-N.png should show hollow outlines only`);

/* ── 2. region decomposition: base with holes / regions only / one region only ── */
{
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await present(p); await bare(p);
  await move(p, 'go', 5);                       // the page where the A/B boxes overlap
  await p.screenshot({ path: join(SHOT, 'v-full.png') });
  await p.evaluate(() => document.querySelectorAll('.vit-mark').forEach(m => m.style.visibility = 'hidden'));
  await p.screenshot({ path: join(SHOT, 'v-base.png') });
  await p.evaluate(() => {
    document.querySelectorAll('.vit-mark').forEach(m => m.style.visibility = '');
    document.querySelectorAll('.vit-page > svg:not(.vit-mark)').forEach(s => s.style.visibility = 'hidden');
  });
  await p.screenshot({ path: join(SHOT, 'v-regions.png') });
  await p.evaluate(() => document.querySelectorAll('.vit-mark').forEach(m => {
    if (m.style.viewTransitionName !== 'm-A') m.style.visibility = 'hidden';
  }));
  await p.screenshot({ path: join(SHOT, 'v-onlyA.png') });
  await p.close();
}

/* ── 3. frozen mid-transition frames ──────────────────────────────────
   Never waitForTimeout + screenshot: a screenshot lags by hundreds of ms and
   the animation looks like a jump.                                        */
for (const [tag, t] of [['morph', 0], ['morph', 130], ['morph', 260], ['morph', 700]]) {
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await present(p); await bare(p);
  await p.evaluate(async t => {
    const orig = document.startViewTransition.bind(document); let vit;
    document.startViewTransition = a => (vit = orig(a));
    window.vit.go(1); await vit.ready;
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; });
  }, t);
  await p.screenshot({ path: join(SHOT, `${tag}-${t}.png`) });
  await p.close();
}
await b.close();
console.log('screenshots: tools/shots/');
