/* PDF ↔ HTML 逐像素对照 + 过渡中间帧 + 区域分解。
   需要 examples/out/ 已经编译好，以及 poppler(pdftoppm) 和 ImageMagick(compare)。
   用法：node tools/verify.mjs            （截图落在 tools/shots/）           */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT  = join(HERE, '..', 'examples', 'out');
const SHOT = join(HERE, 'shots');
rmSync(SHOT, { recursive: true, force: true });
mkdirSync(SHOT, { recursive: true });

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const url = 'file://' + join(OUT, 'demo.html');
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const VP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const bare = p => p.evaluate(() => { const b = document.querySelector('.vt-bar'); if (b) b.remove(); });

/* ── 1. 静止帧，用来和 PDF 比 ───────────────────────────────────────── */
const n = await (async () => {
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await bare(p);
  const n = await p.evaluate(() => window.vtslides.total);
  for (let i = 0; i < n; i++) {
    await p.evaluate(i => window.vtslides.go(i), i);
    await p.waitForTimeout(900);
    /* PDF 是静止的页面：元素动画走到头（PDF 取最后一个状态），连续动画取消（PDF 取静止状态） */
    await p.evaluate(() => { window.vtslides.step = window.vtslides.steps; });
    await p.waitForTimeout(900);
    await p.evaluate(() => document.querySelector('.vt-slide.is-active').getAnimations({ subtree: true }).forEach(a => a.cancel()));
    await p.waitForTimeout(100);
    await p.screenshot({ path: join(SHOT, `html-${i + 1}.png`) });
  }
  await p.close();
  return n;
})();

execFileSync('pdftoppm', ['-png', '-r', '96', '-scale-to-x', '1280', '-scale-to-y', '720',
  join(OUT, 'demo.pdf'), join(SHOT, 'pdf')]);

/* 判据只能是「差异全是空心的字形轮廓」——位移或漏字会给出实心色块。
   mean 本身只是量级：两个光栅化器的抗锯齿差异在 1 上下，把同一页平移
   2px 再比是 2 倍以上，所以 1.5 是条能分开这两种情况的线。比之前先各模糊 1px：
   提升出来的区域是独立的盒子，浏览器把盒子的位置吸附到整像素（最多差半个像素），
   一块满是小字的定理框光是这半个像素就能把 mean 顶到 2.3——不是位移，是抗锯齿；
   模糊掉亚像素之后它回到 1.1，而真平移 2px 的还有 2.5。真正的证据是 diff-N.png，
   肉眼一看就知道是轮廓还是重影。 */
const LIMIT = 1.5;
console.log(`PDF vs HTML（模糊 1px 后的 mean，满分 255；上限 ${LIMIT}）`);
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
  console.log(`  第 ${i} 页  ${mean.toFixed(3)}`);
}
console.log(`  最差     ${worst.toFixed(3)}  ${worst < LIMIT ? '✓' : '✗'}   差异图 diff-N.png 应当只有空心轮廓`);

/* ── 2. 区域分解：底图挖洞 / 只剩区域 / 只剩一个区域 ─────────────────── */
{
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await bare(p);
  await p.evaluate(() => window.vtslides.go(5));      // A/B 包围盒重叠那页
  await p.waitForTimeout(900);
  await p.screenshot({ path: join(SHOT, 'v-full.png') });
  await p.evaluate(() => document.querySelectorAll('.vt-mark').forEach(m => m.style.visibility = 'hidden'));
  await p.screenshot({ path: join(SHOT, 'v-base.png') });
  await p.evaluate(() => {
    document.querySelectorAll('.vt-mark').forEach(m => m.style.visibility = '');
    document.querySelectorAll('.vt-page > svg:not(.vt-mark)').forEach(s => s.style.visibility = 'hidden');
  });
  await p.screenshot({ path: join(SHOT, 'v-regions.png') });
  await p.evaluate(() => document.querySelectorAll('.vt-mark').forEach(m => {
    if (m.style.viewTransitionName !== 'm-A') m.style.visibility = 'hidden';
  }));
  await p.screenshot({ path: join(SHOT, 'v-onlyA.png') });
  await p.close();
}

/* ── 3. 冻结的中间帧 ────────────────────────────────────────────────
   别用 waitForTimeout + 截图：截图有上百毫秒延迟，动画会看着像瞬移。   */
for (const [tag, t] of [['morph', 0], ['morph', 130], ['morph', 260], ['morph', 700]]) {
  const p = await b.newPage(VP);
  await p.goto(url); await p.waitForTimeout(500); await bare(p);
  await p.evaluate(async t => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides.go(1); await vt.ready;
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; });
  }, t);
  await p.screenshot({ path: join(SHOT, `${tag}-${t}.png`) });
  await p.close();
}
await b.close();
console.log('截图：tools/shots/');
