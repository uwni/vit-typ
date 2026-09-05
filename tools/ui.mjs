/* 工具栏 / 激光笔 / 总览缩放 / 触摸路由 / 演讲者视图 的回归。
   用法：node tools/ui.mjs                                              */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'out', 'demo.html');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const VP = { viewport: { width: 1280, height: 720 } };
const errs = [];
/* 页号会随 demo 增页而变：元素动画那页（wave）是第 W 页，它前面共有 F 帧 */
const W = 10, F = 21;
const watch = p => { p.on('pageerror', e => errs.push(e.message));
                     p.on('console', m => m.type() === 'error' && errs.push(m.text())); };

/* ── 工具栏：PDF 链接 ───────────────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('工具栏:', JSON.stringify(await p.evaluate(() => {
    const a = document.querySelector('.vt-bar .vt-dl');
    return {
      按钮: [...document.querySelectorAll('.vt-bar > *')].map(e => e.tagName.toLowerCase()).join(' '),
      pdf: a && a.getAttribute('href'),
      download: a && a.hasAttribute('download'),
      新标签: a && a.target,
      在_deck_外: !document.querySelector('.vt-deck').contains(document.querySelector('.vt-bar')),
      自己的组: getComputedStyle(document.querySelector('.vt-bar')).viewTransitionName,
    };
  })));
  await p.close();
}

/* ── 激光笔要穿过总览 ───────────────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  const snap = () => p.evaluate(() => ({
    lasing: document.body.classList.contains('vt-lasing'),
    按下: document.querySelector('.vt-bar button[aria-pressed]:nth-of-type(2)').getAttribute('aria-pressed'),
    总览: document.querySelector('.vt-deck').classList.contains('vt-all'),
    光标: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
  }));
  await p.keyboard.press('l');                       console.log('开激光 :', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
                                                     console.log('进总览 :', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
                                                     console.log('回放映 :', JSON.stringify(await snap()));
  await p.close();
}

/* ── 从总览打开 = 整页缩放，不是元素级 morph ─────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('总览打开:', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document);
    document.startViewTransition = () => {};
    document.querySelector('.vt-deck').classList.add('vt-all');
    await new Promise(r => setTimeout(r, 50));
    let vt; document.startViewTransition = a => (vt = orig(a));
    document.querySelectorAll('.vt-group')[1].click();
    await vt.ready;
    return {
      type: [...vt.types].join(' '),
      标记名: [...new Set([...document.querySelectorAll('.vt-mark')].map(m => getComputedStyle(m).viewTransitionName))],
      整页组: getComputedStyle(document.querySelectorAll('.vt-group')[1]).viewTransitionName,
    };
  })));
  // go() 有 i===cur 的短路，「点当前这一页」必须照样退出总览
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('.vt-group')[1].click());
  await p.waitForTimeout(900);
  console.log('点当前页:', JSON.stringify(await p.evaluate(() => ({
    总览: document.querySelector('.vt-deck').classList.contains('vt-all'),
    页: window.vtslides.index + 1,
    残留: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null,
  }))));
  console.log('普通翻页:', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides.go(0); await vt.ready;
    return { type: [...vt.types].join(' '),
             标记名: [...new Set([...document.querySelectorAll('.vt-mark')].map(m => getComputedStyle(m).viewTransitionName))] };
  })));
  await p.close();
}

/* ── 触摸：光标换不了，改走 DOM 光点 ────────────────────────────────── */
{
  const ctx = await b.newContext({ ...VP, hasTouch: true });
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  const snap = () => p.evaluate(() => ({
    光标: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
    nomouse: document.body.classList.contains('vt-nomouse'),
    点亮: document.querySelector('.vt-laser').classList.contains('is-on'),
    页: window.vtslides.index,
  }));
  await p.keyboard.press('l');
  await p.mouse.move(600, 300);                       console.log('鼠标   :', JSON.stringify(await snap()));
  await p.touchscreen.tap(720, 400);                   // 激光开着，不该翻页
  const d = { pointerType: 'touch', clientX: 300, clientY: 500, bubbles: true };
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerdown', d)), d);
  console.log('触摸按住:', JSON.stringify({ ...await snap(),
    位置: await p.evaluate(() => document.querySelector('.vt-laser').style.transform) }));
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerup', d)), d);
  console.log('触摸松开:', JSON.stringify(await snap()));
  await p.keyboard.press('l');                         // 关掉激光，tap 应该翻页
  await p.touchscreen.tap(720, 400); await p.waitForTimeout(900);
  console.log('关激光后:', JSON.stringify(await snap()));
  await ctx.close();
}

/* ── 缩略图：一页一张、标题+编号、帧用圆点 ─────────────────────────── */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  await p.evaluate(() => window.vtslides.go(7));  await p.waitForTimeout(800);
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  console.log('缩略图  :', JSON.stringify(await p.evaluate(() => ({
    张数: document.querySelectorAll('.vt-slide.is-thumb').length,
    总帧数: document.querySelectorAll('.vt-slide').length,
    标题栏: [...document.querySelectorAll('.vt-cap')].map(c => c.textContent),
    圆点: [...document.querySelectorAll('.vt-group')].map(g =>
      [...g.querySelectorAll('.vt-dots i')].map(d => d.classList.contains('is-on') ? '●' : '○').join('')),
    显示的帧: [...document.querySelectorAll('.vt-group')].map(g =>
      [...g.querySelectorAll('.vt-slide')].findIndex(s => s.classList.contains('is-thumb'))),
  }))));
  await p.evaluate(() => document.querySelectorAll('.vt-group')[1].querySelectorAll('.vt-dots i')[1].click());
  await p.waitForTimeout(900);
  console.log('点圆点  :', JSON.stringify(await p.evaluate(() => ({
    帧: window.vtslides.index, 计数: document.querySelector('.vt-count').textContent,
    hash: location.hash, 总览: document.querySelector('.vt-deck').classList.contains('vt-all'),
  }))));
  // 放映态下这些零件必须完全不存在于版面
  console.log('放映时  :', JSON.stringify(await p.evaluate(() => ({
    标题栏: getComputedStyle(document.querySelector('.vt-cap')).display,
    圆点: getComputedStyle(document.querySelector('.vt-dots')).display,
  }))));
  await p.close();
}

/* ── 整页转场 / 速度倍率 / 界面明暗 ────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#5.4'); await p.waitForTimeout(400);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const r = { vt: [...vt.types].join(' '),
      root: document.getAnimations().filter(a => /\(root\)/.test(a.effect.pseudoElement) && !/group|pair/.test(a.effect.pseudoElement)).map(a => a.effect.pseudoElement.replace('::view-transition-', '').replace('(root)', '') + ':' + a.animationName).join(),
      标题: document.getAnimations().filter(a => /m-title-1/.test(a.effect.pseudoElement) && !/group|pair/.test(a.effect.pseudoElement)).map(a => a.effect.pseudoElement.replace('::view-transition-', '').replace('(m-title-1)', '') + ':' + a.animationName).join(),
      标题类: [...document.querySelectorAll('.vt-mark[data-vt-key="title"]')].map(m => m.style.viewTransitionClass).filter(c => /vt-fx/.test(c)).join() };
    await vt.finished; return r;
  }, go);
  console.log('转场    :', JSON.stringify({ '5.4→6 (slide)': await fx('next'), '6→5.4 (back)': await fx('prev'), '5.4→5.3 (默认)': await fx('prev') }), '(root old push-out/new push-in；第 6 页的标题标记单边且没写效果 → 并回 root，没有自己的动画)');
  /* 页级效果只管页间：给第 7 页的五帧都写上 slide，进这一页是 slide，页内帧与帧之间仍是 fade */
  await p.evaluate(() => { document.querySelectorAll('.vt-group')[6].querySelectorAll('.vt-slide').forEach(s => s.dataset.transition = 'slide'); window.vtslides.go(10); });
  await p.waitForTimeout(1000);
  console.log('页间/页内:', JSON.stringify({ '6→7.1': (await fx('next')).vt, '7.1→7.2': (await fx('next')).vt, '7.2→7.1': (await fx('prev')).vt, '7.1→6': (await fx('prev')).vt }), '(期望 slide fwd / fade fwd / fade back / slide back)');
  const sp = () => p.evaluate(() => ({ dur: document.documentElement.style.getPropertyValue('--vt-dur'), 计数: document.querySelector('.vt-count').textContent, 存: localStorage.getItem('vt-speed') }));
  await p.keyboard.press('=');  const a = await sp();
  await p.keyboard.press('-');  await p.keyboard.press('-'); const c = await sp();
  await p.keyboard.press('0');  const z = await sp();
  await p.evaluate(() => localStorage.removeItem('vt-speed'));
  console.log('速度    :', JSON.stringify({ '按=': a, '再-,-': c, '按0': z }), '(700ms 基准 → 560 / 875 / 700)');
  const th = () => p.evaluate(() => ({ html: document.documentElement.dataset.theme,
    栏: getComputedStyle(document.querySelector('.vt-bar')).backgroundColor, 版面: getComputedStyle(document.querySelector('.vt-deck')).backgroundColor }));
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(50); const light = await th();
  await p.emulateMedia({ colorScheme: 'dark' });  await p.waitForTimeout(50); const dark = await th();
  console.log('明暗    :', JSON.stringify({ 系统亮: light, 系统暗: dark }), '(版面底色两边都该是 rgb(17, 19, 24))');
  await p.close();
}

/* ── 过渡前后镜像 ───────────────────────────────────────────────────
   「按住旧的 + 新的淡入」后退时反过来「按住新的 + 旧的淡出」，时间上镜像。 */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#7.2'); await p.waitForTimeout(400);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const out = {};
    document.getAnimations().forEach(a => { const ps = a.effect.pseudoElement; if (ps && /m-A-1|\(root\)/.test(ps) && !/group|pair/.test(ps)) out[ps.replace('::view-transition-', '')] = a.animationName; });
    await vt.finished; return out;
  }, go);
  console.log('镜像    :', JSON.stringify({ 前进: await fx('next'), 后退: await fx('prev') }), '(两个方向都是 old fade-out / new fade-in：交叉淡化本身对称)');
  await p.close();
}

/* ── 单边标记：没写自己效果的并回 root（名字临时摘掉，跟整页一起走），播完还原；
   不靠 :only-child——Chrome 152 起它在过渡伪元素上不再可靠。 */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#2.1'); await p.waitForTimeout(400);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const out = { eq组: document.getAnimations().some(a => /m-eq/.test(a.effect.pseudoElement || '')) };
    out.并回root = [...document.querySelectorAll('.vt-mark[data-vt-key="eq"]')].map(m => m.style.viewTransitionName).join();
    await vt.finished;
    out.播完名字 = [...document.querySelectorAll('.vt-mark[data-vt-key="eq"]')].map(m => m.style.viewTransitionName).join();
    return out;
  }, go);
  console.log('单边进出场:', JSON.stringify({ '2.1→2.2 eq 入场': await fx('next'), '2.2→2.1 eq 退场': await fx('prev') }), '(过渡中 eq 没有自己的组、名字是 none；播完名字还原)');
  await p.close();
}

/* ── 连续动画（slide(anim:)）：过渡播完才播、离开暂停、换尺寸仍在轨迹上 ─── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + `#${W}.6`); await p.waitForTimeout(400);
  const onTrack = () => p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    const path = s.querySelector('.vt-mark[data-vt-key="track"] path'), dot = s.querySelector('.vt-mark[data-vt-key="dot"]');
    const c = dot.getBoundingClientRect(), pt = new DOMPoint(c.x + c.width / 2, c.y + c.height / 2).matrixTransform(path.getScreenCTM().inverse());
    const L = path.getTotalLength(); let best = 1e9;
    for (let i = 0; i <= 600; i++) { const q = path.getPointAtLength(L * i / 600); best = Math.min(best, Math.hypot(q.x - pt.x, q.y - pt.y)); }
    return +best.toFixed(2);
  });
  const states = () => p.evaluate(W => document.querySelectorAll('.vt-group')[W].querySelector('.vt-slide').getAnimations({ subtree: true }).map(a => a.effect.target.dataset.vtKey + ':' + a.playState).join(' '), W);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  const during = await states();
  await p.waitForTimeout(900);
  const after = await states();
  await p.waitForTimeout(500);
  const d1 = await onTrack();
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(900);
  const left = await states();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  await p.setViewportSize({ width: 900, height: 600 }); await p.waitForTimeout(600);
  console.log('连续动画:', JSON.stringify({ 过渡中: during, 过渡后: after, 离轨迹: d1, 离开后: left, 回来并改尺寸后: await states(), 离轨迹2: await onTrack() }));
  await p.close();
}

/* ── 元素动画（mark(key, s0, s1, …)）：一步一步走、几何插值、倒退镜像、走完才翻页 ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + `#${W}`); await p.waitForTimeout(400);
  await p.evaluate(W => { window.__W = W; }, W);
  const st = () => p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    const gs = [...s.querySelectorAll('[data-typst-label*="@"]')];
    const shown = gs.filter(g => getComputedStyle(g).display !== 'none');
    const ball = shown.length ? [...shown[0].querySelectorAll('path')].find(q => q.getAttribute('fill') !== 'none') : null;
    const r = ball && ball.getBoundingClientRect();
    return { 显示: shown.map(g => g.getAttribute('data-typst-label').split('@')[1]).join(','),
             步: window.vtslides.step + '/' + window.vtslides.steps, hash: location.hash,
             跑着: s.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length,
             球: r ? [+(r.x + r.width / 2).toFixed(1), +(r.y + r.height / 2).toFixed(1)] : null,
             提升: s.querySelectorAll('.vt-mark').length,
             计数: document.querySelector('.vt-count').textContent,
             圆点: [...document.querySelectorAll('.vt-group')[window.__W - 1].querySelectorAll('.vt-dots i')].map(d => d.classList.contains('is-now') ? '◉' : d.classList.contains('is-on') ? '●' : '○').join('') };
  });
  const s0 = await st();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  const mid = await st();
  await p.waitForTimeout(700);
  const s1 = await st();
  const between = (a, m, b) => Math.min(a, b) < m && m < Math.max(a, b);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
  const back = await st();
  await p.waitForTimeout(700);
  const s0b = await st();
  for (let i = 0; i < 5; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
  await p.waitForTimeout(900);
  const last = await st();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  const next = await p.evaluate(() => window.vtslides.index + 1 + location.hash);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1000);
  const ret = await st();
  await p.evaluate(F => window.vtslides.go(F - 1), F); await p.waitForTimeout(1000);
  await p.evaluate(F => window.vtslides.go(F), F); await p.waitForTimeout(1000);
  const fresh = await st();
  console.log('元素动画:', JSON.stringify({
    起点: s0, 半路: { ...mid, 球在两端之间: between(s0.球[0], mid.球[0], s1.球[0]) }, 走完: s1,
    退一步半路: { ...back, 球在两端之间: between(s0.球[0], back.球[0], s1.球[0]) }, 退回: s0b,
    连按五下: last, 再按翻页: next, 退回来落在最后一步: ret, 前进进来从头开始: fresh,
  }));
  /* 总览里：别的页的缩略图停在最后一步；悬停圆点预览那一步、移开还原；点圆点打开的就是那一步 */
  await p.evaluate(() => window.vtslides.go(3)); await p.waitForTimeout(900);
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  const thumb = () => p.evaluate(() => { const s = document.querySelectorAll('.vt-group')[window.__W - 1].querySelector('.vt-slide.is-thumb'); return [...s.querySelectorAll('[data-typst-label*="@"]')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-typst-label').split('@')[1]).join(); });
  const dot = (await p.$$(`.vt-group:nth-child(${W}) .vt-dots i`))[2];
  const t0 = await thumb(); await dot.hover(); await p.waitForTimeout(100); const t1 = await thumb();
  await p.mouse.move(10, 10); await p.waitForTimeout(100); const t2 = await thumb();
  await dot.hover(); await p.waitForTimeout(50); await dot.click(); await p.waitForTimeout(1000);
  console.log('总览里的步:', JSON.stringify({ 别的页缩略图: t0, 悬停第3个点: t1, 移开: t2, 点开: await p.evaluate(() => location.hash + ' ' + (document.querySelector('.vt-deck').classList.contains('vt-all') ? '总览' : '放映')) }), `(期望 5 2 5 #${W}.3 放映)`);
  await p.close();
}

/* ── 标记自己的进出场 mark(transition:)：单边时按自己的效果进/退场；整页的 wipe 也查一下 ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#8.1'); await p.waitForTimeout(400);
  const fx = (go, re) => p.evaluate(async ([go, re]) => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const out = {}, rx = new RegExp(re);
    document.getAnimations().forEach(a => { const ps = a.effect.pseudoElement; if (ps && rx.test(ps) && !/group|pair/.test(ps)) out[ps.replace('::view-transition-', '')] = a.animationName + ' ' + getComputedStyle(document.documentElement, ps).getPropertyValue(/old/.test(ps) ? '--vt-out' : '--vt-in').trim(); });
    out.类 = [...document.querySelectorAll('.vt-mark')].filter(m => /vt-fx/.test(m.style.viewTransitionClass)).map(m => m.style.viewTransitionClass).join(';');
    await vt.finished; return out;
  }, [go, re]);
  const a = await fx('next', 'm-thm|m-def');
  const b2 = await fx('next', 'm-proof');
  const c = await fx('prev', 'm-proof');
  await p.evaluate(() => { document.querySelectorAll('.vt-slide')[19].dataset.transition = 'wipe-up'; });   // 第 10 页第 1 帧整页揭开
  await p.evaluate(() => window.vtslides.go(18)); await p.waitForTimeout(900);
  const d = await fx('next', '\\(root\\)');
  console.log('进出场  :', JSON.stringify({ '8.1→8.2 定理进场': a, '8.2→8.3 证明进场': b2, '8.3→8.2 证明退场': c, '整页 wipe-up': d }),
    '(new 从 --vt-in 揭开、old 收到 --vt-out；配上对的 def 不带 fx 类)');
  await p.close();
}

/* ── 状态当连续关键帧、host keyframes 带 delay：三页华丽动画各自在跑，且不算步 ── */
{
  const p = await b.newPage(VP); watch(p);
  const look = async hash => {
    await p.goto(url + hash); await p.waitForTimeout(1200);
    return p.evaluate(() => {
      const s = document.querySelector('.vt-slide.is-active');
      const an = s.getAnimations({ subtree: true });
      return { 步: window.vtslides.steps, 动画: an.length, 在跑: an.filter(a => a.playState === 'running').length,
               目标: [...new Set(an.map(a => a.effect.target.tagName.toLowerCase()))].join(','),
               关键帧: Math.max(...an.map(a => a.effect.getKeyframes().length)),
               delay: [...new Set(an.map(a => a.effect.getTiming().delay))].join(',') };
    });
  };
  console.log('弹跳小球:', JSON.stringify(await look('#12')), '(5 条 svg host 动画，5 帧，delay 0…560)');
  console.log('单摆双摆:', JSON.stringify(await look('#13')), '(single 一条 svg host；double 的 path 各一条 96 帧；不算步)');
  console.log('海浪    :', JSON.stringify(await look('#14')), '(path 各一条 25 帧；不算步)');
  await p.close();
}

/* ── 过渡中点击也算数 ───────────────────────────────────────────────
   过渡期间浏览器不对真实 DOM 做命中测试（target 一律是 <html>），所以点击
   绑在 document 上按坐标判断；连点时 next() 基于已受理的目标（want）算，
   不基于画上去的 cur——paint() 要等快照捕获完才跑，第一次要 100ms+。 */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  for (let i = 0; i < 5; i++) { await p.mouse.click(900, 360); await p.waitForTimeout(40); }
  await p.mouse.click(200, 360);                                   // 过渡中点左 1/3
  await p.waitForTimeout(1200);
  const mid = await p.evaluate(() => ({ 页: window.vtslides.index, hash: location.hash, 残留: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null }));
  await p.mouse.move(640, 360); await p.waitForTimeout(100);
  const bar = await p.evaluate(() => { const r = document.querySelector('.vt-bar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(900, 360); await p.waitForTimeout(60);
  await p.mouse.click(bar.x, bar.y);                                 // 过渡中点在工具栏上
  await p.waitForTimeout(1200);
  console.log('过渡中连点:', JSON.stringify(mid), '(5 下再退 1 → 4)  过渡中点工具栏:', await p.evaluate(() => window.vtslides.index), '(→ 5，不翻页)');
  await p.close();
}

/* ── 工具栏的 backdrop-filter 不能带进过渡 ───────────────────────────
   规范把 backdrop-filter 复制到 ::view-transition-group() 上，opacity 却只烤进
   快照图，于是过渡期间有一块看不见的毛玻璃糊掉它底下的快照（视口小时工具栏
   盖住的面积大，演讲者视图的 iframe 里最明显）。只在伪元素上关掉。 */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('毛玻璃  :', JSON.stringify(await p.evaluate(async () => {
    const idle = getComputedStyle(document.querySelector('.vt-bar')).backdropFilter;
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides.next(); await vt.ready;
    return { 平时: idle,
      过渡中: getComputedStyle(document.documentElement, '::view-transition-group(vt-bar)').backdropFilter };
  })));
  await p.close();
}

/* ── 演讲者视图：iframe 装自己、hash 定位、vt:slide 同步、file:// 可用 ── */
{
  const ctx = await b.newContext(VP);
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('备注    :', JSON.stringify(await p.evaluate(() => ({
    条数: document.querySelectorAll('.vt-group > .vt-note').length,
    版面里: getComputedStyle(document.querySelector('.vt-note')).display,
  }))));
  const [w] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('s')]);
  watch(w); await w.waitForTimeout(1000);
  const inner = () => w.frames().filter(f => f !== w.mainFrame());
  for (const f of inner()) await f.evaluate(() => { window.__alive = 1; });   // 重载会把它冲掉
  const snap = async () => ({
    主: await p.evaluate(() => window.vtslides.index),
    弹窗: await w.evaluate(() => ({
      页码: document.querySelector('header b').textContent,
      备注: document.querySelector('.note').textContent.slice(0, 12),
      下一: document.querySelector('aside iframe').hidden ? '无' : '有',
    })),
    iframe: await Promise.all(inner().map(f => f.evaluate(() =>
      location.hash + (window.__alive ? '' : ' 重载了')))),
  });
  console.log('打开    :', JSON.stringify(await snap()));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  console.log('主窗翻页:', JSON.stringify(await snap()));
  await w.bringToFront(); await w.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  console.log('弹窗遥控:', JSON.stringify(await snap()));
  await p.evaluate(() => window.vtslides.go(window.vtslides.total - 1)); await p.waitForTimeout(1000);
  console.log('末页    :', JSON.stringify((await snap()).弹窗));
  await p.bringToFront(); await p.keyboard.press('s'); await p.waitForTimeout(200);
  console.log('再按 s  : 窗口数', ctx.pages().length, '（只聚焦，不新开）');

  // 弹窗自己的工具栏：右下角常驻，状态和主窗口一起刷；预览副本里没有工具栏
  await p.evaluate(() => window.vtslides.go(0)); await p.waitForTimeout(900);
  await w.evaluate(() => document.querySelectorAll('.vt-bar button')[1].click());   // 弹窗里点激光
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  console.log('弹窗工具栏:', JSON.stringify(await w.evaluate(() => {
    const bar = document.querySelector('.vt-bar'), r = bar.getBoundingClientRect();
    return { 右下角: [innerWidth - r.right, innerHeight - r.bottom].map(Math.round).join(','),
      可见: getComputedStyle(bar).opacity, 页: bar.querySelector('.vt-count').textContent,
      激光: bar.querySelectorAll('button')[1].getAttribute('aria-pressed') };
  })), '主窗口:', JSON.stringify(await p.evaluate(() => ({
    页: document.querySelector('.vt-count').textContent, lasing: document.body.classList.contains('vt-lasing') }))),
    '预览里有工具栏:', (await Promise.all(inner().map(f => f.evaluate(() => !!document.querySelector('.vt-bar'))))).join());
  // 在「当前页」预览的 (25%, 50%) 指点 → 主窗口光点落在 deck 的 (25%, 50%)
  const at = await w.evaluate(() => { const q = document.querySelector('main iframe').getBoundingClientRect();
    return { x: q.left + q.width * .25, y: q.top + q.height * .5 }; });
  await w.mouse.move(at.x, at.y);
  console.log('预览上指点:', JSON.stringify(await p.evaluate(() => {
    const q = document.querySelector('.vt-deck').getBoundingClientRect(), l = document.querySelector('.vt-laser');
    return { 光点: l.classList.contains('is-on'), 位置: l.style.transform,
      期望: 'translate(' + (q.left + q.width * .25) + 'px, ' + (q.top + q.height * .5) + 'px)' };
  })));
  await w.mouse.move(at.x, 630);
  console.log('移出预览  : 光点', await p.evaluate(() => document.querySelector('.vt-laser').classList.contains('is-on')));
  // 光标和 DOM 光点必须是同一张图
  console.log('同一个点  :', JSON.stringify(await p.evaluate(() => {
    const u = s => (s.match(/url\("([^"]+)"\)/) || [])[1];
    const cur = getComputedStyle(document.querySelector('.vt-deck')).cursor;
    const dot = getComputedStyle(document.querySelector('.vt-laser'));
    return { 相同: !!u(cur) && u(cur) === u(dot.backgroundImage), 光点: dot.width + ' ' + dot.backgroundSize };
  })));
  // 点「当前页」预览 = 点主窗口 deck：右侧下一页、左 1/3 上一页；点备注区没反应
  const nowBox = await w.evaluate(() => { const q = document.querySelector('main iframe').getBoundingClientRect();
    return { l: q.left, t: q.top, w: q.width, h: q.height }; });
  const idx = () => p.evaluate(() => window.vtslides.index);
  const seq = [await idx()];
  await w.mouse.click(nowBox.l + nowBox.w * .8, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .1, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h + 60);   await p.waitForTimeout(900); seq.push(await idx());
  console.log('弹窗点击  : 起点→右侧→左1/3→备注区 =', seq.join(' → '));
  // 顶部进度条按帧走；预览上滚轮翻页，备注区滚轮不翻
  const prog = () => w.evaluate(() => document.querySelector('.prog i').style.width);
  const before = await prog();
  await w.mouse.move(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h * .5); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  const afterWheel = { 页: await idx(), 进度: await prog() };
  const noteBox = await w.evaluate(() => { const q = document.querySelector('.note').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await w.mouse.move(noteBox.x, noteBox.y); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  console.log('弹窗滚轮  :', JSON.stringify({ 进度条: before, 预览上滚一格: afterWheel, 备注区滚一格后页: await idx() }));
  await ctx.close();
}

/* ── 滚轮翻页：鼠标一格一页，触控板一次手势（含惯性）一页，总览里不翻 ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  const idx = () => p.evaluate(() => window.vtslides.index);
  await p.mouse.move(640, 360);
  await p.mouse.wheel(0, 100); await p.waitForTimeout(350); await p.mouse.wheel(0, 100); await p.waitForTimeout(350);
  const two = await idx();
  await p.mouse.wheel(0, -100); await p.waitForTimeout(350);
  const back = await idx();
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 12); await p.waitForTimeout(8); }
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, Math.max(1, 8 - i)); await p.waitForTimeout(16); }
  await p.waitForTimeout(400);
  const pad = await idx();
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  await p.mouse.wheel(0, 100); await p.waitForTimeout(350);
  console.log('滚轮    :', JSON.stringify({ 滚两格: two, 回一格: back, 触控板手势加惯性: pad, 总览里滚: await idx() }), '(期望 2 1 2 2)');
  await p.close();
}

console.log('errors:', errs.length ? errs : 'none');
await b.close();
