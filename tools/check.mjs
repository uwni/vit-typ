/* 每页提升出来的区域、几何、console 错误。
   几何用的是百分比，所以**必须在多个窗口尺寸下完全一致**——
   getCTM 的目标空间各浏览器不同，只在 1280×720 下测的话正好看不见那个 bug。 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'out', 'demo.html');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const SIZES = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
               { width: 900, height: 600 }, { width: 1440, height: 900 }];
const errs = [];
const seen = [];

for (const vp of SIZES) {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(400);
  seen.push(await p.evaluate(() =>
    [...document.querySelectorAll('.vt-slide')].map(s =>
      [...s.querySelectorAll('.vt-mark')].map(m =>
        m.style.viewTransitionName + ' ' +
        [m.style.left, m.style.top, m.style.width, m.style.height]
          .map(v => (+v.replace('%', '')).toFixed(2)).join(' ')))));
  await p.close();
}

seen[0].forEach((marks, i) => {
  console.log('slide ' + (i + 1) + ':');
  marks.forEach(m => console.log('   ' + m));
});

const ref = JSON.stringify(seen[0]);
const drift = SIZES.map((vp, k) => [vp, JSON.stringify(seen[k]) === ref]).filter(x => !x[1]);
console.log('分辨率无关: ' + (drift.length
  ? '✗ ' + drift.map(d => d[0].width + 'x' + d[0].height).join(', ') + ' 与 1280x720 不一致'
  : '✓ ' + SIZES.map(v => v.width + 'x' + v.height).join(' / ') + ' 完全一致'));
/* ── 同一个 key 连着好几页：每一次过渡的起点必须等于上一次的终点 ──────
   这是「连续变化」的判据。配对是每次独立算的（往前跟下一帧配、往回跟上一
   帧配），但只要几何链接得上，看到的就是一个对象在连着走。 */
{
  const p = await b.newPage({ viewport: SIZES[0] });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(400);
  const total = await p.evaluate(() => window.vtslides.total);
  const steps = [];
  for (let i = 1; i < total; i++) {
    await p.evaluate(i => window.vtslides.go(i - 1), i);
    await p.waitForTimeout(760);
    steps.push(await p.evaluate(async i => {
      const rest = document.querySelectorAll('.vt-mark').length;
      const orig = document.startViewTransition.bind(document); let vt;
      document.startViewTransition = a => (vt = orig(a));
      window.vtslides.go(i); await vt.ready;
      const seen = {};
      document.getAnimations().forEach(a => {
        const pe = a.effect && a.effect.pseudoElement; if (!pe) return;
        const m = /^::view-transition-(old|new|group)\(m-(.+)\)$/.exec(pe);
        if (m) (seen[m[2]] = seen[m[2]] || {})[m[1]] = a;
      });
      const out = {};
      Object.keys(seen).forEach(k => {
        const s = seen[k];
        if (!s.old || !s.new) { out[k] = s.old ? '离场' : '入场'; return; }
        const kf = s.group && s.group.effect.getKeyframes();
        if (!kf || kf.length < 2) { out[k] = '配对'; return; }
        /* 两端的 width/height 字符串精度不一样（27.5312px vs 27.531px），
           要先归一化再比，否则链会假断。 */
        const num = v => Math.round(parseFloat(v) * 100) / 100;
        const box = f => num(f.width) + 'x' + num(f.height) + ' @' +
          (f.transform || '').replace(/matrix\(|\)/g, '').split(',').slice(4)
            .map(v => Math.round(+v)).join(',');
        out[k] = [box(kf[0]), box(kf[kf.length - 1])];
      });
      const during = document.querySelectorAll('.vt-mark').length;
      /* 只快进过渡（伪元素上的）；slide(anim:) 的连续动画是无限循环，finish 会抛 */
      document.getAnimations().forEach(a => { if (a.effect && a.effect.pseudoElement) a.finish(); });
      await new Promise(r => setTimeout(r, 200));
      return {
        marks: out,
        克隆: during - rest,
        收干净: document.querySelectorAll('.vt-mark').length === rest,
        唯一: [...document.querySelectorAll('.vt-slide')].every(sl => {
          const n = [...sl.querySelectorAll('.vt-mark')].map(m => m.style.viewTransitionName);
          return n.length === new Set(n).size;      // 只在**同时渲染**的元素之间要求唯一
        }),
      };
    }, i));
  }
  await p.close();

  const dirty = steps.map((s, i) => (!s.收干净 || !s.唯一) ? (i + 1) + '→' + (i + 2) : null).filter(Boolean);
  const cloned = steps.map((s, i) => s.克隆 ? (i + 1) + '→' + (i + 2) + ' 复制 ' + s.克隆 + ' 份' : null).filter(Boolean);
  console.log('分裂/归并: ' + (cloned.length ? cloned.join('，') : '本 deck 无数量变化'));
  console.log('克隆收尾: ' + (dirty.length ? '✗ ' + dirty.join(', ') + ' 之后没收干净或重名' : '✓ 每次过渡后都回到静息状态，且同页内名字唯一'));

  /* 数量变化的那次过渡里名字是按位置重新分配的（`m-cell-2` 这次是克隆、
     下次是第二个真元素），所以名字不是跨过渡的身份，链在这里断开是对的。
     把这种过渡两侧都排除，剩下的才该严格链接。 */
  const last = {}, breaks = [], runs = {};
  let prevCloned = false, skipped = 0;
  steps.forEach((st, i) => {
    const cut = st.克隆 > 0 || prevCloned;
    if (cut) skipped++;
    Object.keys(st.marks).forEach(k => {
      const v = st.marks[k];
      if (!Array.isArray(v)) { delete last[k]; return; }
      if (!cut && last[k] !== undefined) {
        if (last[k] !== v[0]) breaks.push('m-' + k + ' 在第 ' + (i + 1) + '→' + (i + 2) + ' 帧断了');
        else runs[k] = (runs[k] || 1) + 1;
      }
      last[k] = cut ? undefined : v[1];
      if (cut) delete last[k];
    });
    prevCloned = st.克隆 > 0;
  });
  const longest = Object.keys(runs).sort((a, b) => runs[b] - runs[a])[0];
  console.log('连续变化: ' + (breaks.length ? '✗ ' + breaks.join('; ')
    : '✓ 每次过渡的起点都等于上一次的终点' +
      (longest ? '（最长一条：m-' + longest + ' 连着走了 ' + runs[longest] + ' 次）' : '') +
      (skipped ? '；跳过 ' + skipped + ' 次数量有变化的过渡' : '')));
}

console.log('errors:', errs.length ? errs : 'none');
await b.close();
