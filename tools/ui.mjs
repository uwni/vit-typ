/* Regressions for the toolbar / laser pointer / overview zoom / touch routing /
   speaker view.   Usage: node tools/ui.mjs                                   */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'out', 'demo.html');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const VP = { viewport: { width: 1280, height: 720 } };
const errs = [];
/* Page numbers move as the demo grows: the element-animation page (wave) is
   page W, and there are F frames before it. */
const W = 10, F = 21;
const watch = p => { p.on('pageerror', e => errs.push(e.message));
                     p.on('console', m => m.type() === 'error' && errs.push(m.text())); };

/* ── toolbar: PDF link ─────────────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('toolbar:', JSON.stringify(await p.evaluate(() => {
    const a = document.querySelector('.vt-bar .vt-dl');
    return {
      buttons: [...document.querySelectorAll('.vt-bar > *')].map(e => e.tagName.toLowerCase()).join(' '),
      pdf: a && a.getAttribute('href'),
      download: a && a.hasAttribute('download'),
      newTab: a && a.target,
      outsideDeck: !document.querySelector('.vt-deck').contains(document.querySelector('.vt-bar')),
      ownGroup: getComputedStyle(document.querySelector('.vt-bar')).viewTransitionName,
    };
  })));
  await p.close();
}

/* ── the laser pointer must survive the overview ───────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  const snap = () => p.evaluate(() => ({
    lasing: document.body.classList.contains('vt-lasing'),
    pressed: document.querySelector('.vt-bar button[aria-pressed]:nth-of-type(2)').getAttribute('aria-pressed'),
    overview: document.querySelector('.vt-deck').classList.contains('vt-all'),
    cursor: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
  }));
  await p.keyboard.press('l');                       console.log('laser on     :', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
                                                     console.log('into overview:', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
                                                     console.log('back to show :', JSON.stringify(await snap()));
  await p.close();
}

/* ── opening from the overview = whole-page zoom, not an element-level morph ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('overview open:', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document);
    document.startViewTransition = () => {};
    document.querySelector('.vt-deck').classList.add('vt-all');
    await new Promise(r => setTimeout(r, 50));
    let vt; document.startViewTransition = a => (vt = orig(a));
    document.querySelectorAll('.vt-group')[1].click();
    await vt.ready;
    return {
      type: [...vt.types].join(' '),
      markNames: [...new Set([...document.querySelectorAll('.vt-mark')].map(m => getComputedStyle(m).viewTransitionName))],
      pageGroup: getComputedStyle(document.querySelectorAll('.vt-group')[1]).viewTransitionName,
    };
  })));
  // go() short-circuits on i === cur; clicking the *current* page must still leave the overview
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('.vt-group')[1].click());
  await p.waitForTimeout(900);
  console.log('click current:', JSON.stringify(await p.evaluate(() => ({
    overview: document.querySelector('.vt-deck').classList.contains('vt-all'),
    page: window.vtslides.index + 1,
    leftover: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null,
  }))));
  console.log('plain flip   :', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides.go(0); await vt.ready;
    return { type: [...vt.types].join(' '),
             markNames: [...new Set([...document.querySelectorAll('.vt-mark')].map(m => getComputedStyle(m).viewTransitionName))] };
  })));
  await p.close();
}

/* ── touch: the cursor cannot change, so the pointer becomes a DOM dot ── */
{
  const ctx = await b.newContext({ ...VP, hasTouch: true });
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  const snap = () => p.evaluate(() => ({
    cursor: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
    nomouse: document.body.classList.contains('vt-nomouse'),
    lit: document.querySelector('.vt-laser').classList.contains('is-on'),
    page: window.vtslides.index,
  }));
  await p.keyboard.press('l');
  await p.mouse.move(600, 300);                       console.log('mouse      :', JSON.stringify(await snap()));
  await p.touchscreen.tap(720, 400);                   // laser is on: a tap must not flip the page
  const d = { pointerType: 'touch', clientX: 300, clientY: 500, bubbles: true };
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerdown', d)), d);
  console.log('touch hold :', JSON.stringify({ ...await snap(),
    position: await p.evaluate(() => document.querySelector('.vt-laser').style.transform) }));
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerup', d)), d);
  console.log('touch up   :', JSON.stringify(await snap()));
  await p.keyboard.press('l');                         // laser off: a tap should flip the page
  await p.touchscreen.tap(720, 400); await p.waitForTimeout(900);
  console.log('laser off  :', JSON.stringify(await snap()));
  await ctx.close();
}

/* ── thumbnails: one per page, title + number, frames as dots ─────── */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  await p.evaluate(() => window.vtslides.go(7));  await p.waitForTimeout(800);
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  console.log('thumbnails :', JSON.stringify(await p.evaluate(() => ({
    thumbs: document.querySelectorAll('.vt-slide.is-thumb').length,
    frames: document.querySelectorAll('.vt-slide').length,
    captions: [...document.querySelectorAll('.vt-cap')].map(c => c.textContent),
    dots: [...document.querySelectorAll('.vt-group')].map(g =>
      [...g.querySelectorAll('.vt-dots i')].map(d => d.classList.contains('is-on') ? '●' : '○').join('')),
    shownFrame: [...document.querySelectorAll('.vt-group')].map(g =>
      [...g.querySelectorAll('.vt-slide')].findIndex(s => s.classList.contains('is-thumb'))),
  }))));
  await p.evaluate(() => document.querySelectorAll('.vt-group')[1].querySelectorAll('.vt-dots i')[1].click());
  await p.waitForTimeout(900);
  console.log('click dot  :', JSON.stringify(await p.evaluate(() => ({
    frame: window.vtslides.index, counter: document.querySelector('.vt-count').textContent,
    hash: location.hash, overview: document.querySelector('.vt-deck').classList.contains('vt-all'),
  }))));
  // while presenting, these parts must be entirely absent from the layout
  console.log('presenting :', JSON.stringify(await p.evaluate(() => ({
    caption: getComputedStyle(document.querySelector('.vt-cap')).display,
    dots: getComputedStyle(document.querySelector('.vt-dots')).display,
  }))));
  await p.close();
}

/* ── page transition / speed factor / UI theme ─────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#5.4'); await p.waitForTimeout(400);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const r = { vt: [...vt.types].join(' '),
      root: document.getAnimations().filter(a => /\(root\)/.test(a.effect.pseudoElement) && !/group|pair/.test(a.effect.pseudoElement)).map(a => a.effect.pseudoElement.replace('::view-transition-', '').replace('(root)', '') + ':' + a.animationName).join(),
      title: document.getAnimations().filter(a => /m-title-1/.test(a.effect.pseudoElement) && !/group|pair/.test(a.effect.pseudoElement)).map(a => a.effect.pseudoElement.replace('::view-transition-', '').replace('(m-title-1)', '') + ':' + a.animationName).join(),
      titleClass: [...document.querySelectorAll('.vt-mark[data-vt-key="title"]')].map(m => m.style.viewTransitionClass).filter(c => /vt-fx/.test(c)).join() };
    await vt.finished; return r;
  }, go);
  console.log('transition :', JSON.stringify({ '5.4→6 (slide)': await fx('next'), '6→5.4 (back)': await fx('prev'), '5.4→5.3 (default)': await fx('prev') }), '(root old push-out / new push-in; the title mark on page 6 is unpaired with no effect of its own → folds into root, no animation of its own)');
  /* the page-level effect only governs page changes: give all five frames of page 7 `slide`;
     entering the page slides, frame-to-frame inside the page still fades */
  await p.evaluate(() => { document.querySelectorAll('.vt-group')[6].querySelectorAll('.vt-slide').forEach(s => s.dataset.transition = 'slide'); window.vtslides.go(10); });
  await p.waitForTimeout(1000);
  console.log('page/frame :', JSON.stringify({ '6→7.1': (await fx('next')).vt, '7.1→7.2': (await fx('next')).vt, '7.2→7.1': (await fx('prev')).vt, '7.1→6': (await fx('prev')).vt }), '(expected slide fwd / fade fwd / fade back / slide back)');
  const sp = () => p.evaluate(() => ({ dur: document.documentElement.style.getPropertyValue('--vt-dur'), counter: document.querySelector('.vt-count').textContent, stored: localStorage.getItem('vt-speed') }));
  await p.keyboard.press('=');  const a = await sp();
  await p.keyboard.press('-');  await p.keyboard.press('-'); const c = await sp();
  await p.keyboard.press('0');  const z = await sp();
  await p.evaluate(() => localStorage.removeItem('vt-speed'));
  console.log('speed      :', JSON.stringify({ 'press =': a, 'then -,-': c, 'press 0': z }), '(700ms base → 560 / 875 / 700)');
  const th = () => p.evaluate(() => ({ html: document.documentElement.dataset.theme,
    bar: getComputedStyle(document.querySelector('.vt-bar')).backgroundColor, deck: getComputedStyle(document.querySelector('.vt-deck')).backgroundColor }));
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(50); const light = await th();
  await p.emulateMedia({ colorScheme: 'dark' });  await p.waitForTimeout(50); const dark = await th();
  console.log('theme      :', JSON.stringify({ systemLight: light, systemDark: dark }), '(the deck background must be rgb(17, 19, 24) on both)');
  await p.close();
}

/* ── mirror across a transition ─────────────────────────────────────
   "hold the old + fade the new in" reversed becomes "hold the new + fade the
   old out": mirrored in time. */
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
  console.log('mirror     :', JSON.stringify({ forward: await fx('next'), back: await fx('prev') }), '(both directions are old fade-out / new fade-in: a crossfade is symmetric by itself)');
  await p.close();
}

/* ── unpaired marks: one without an effect of its own folds into root (its name
   is removed for the duration, so it travels with the page) and is restored
   afterwards. No :only-child — unreliable on transition pseudos since Chrome 152. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#2.1'); await p.waitForTimeout(400);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const out = { eqGroup: document.getAnimations().some(a => /m-eq/.test(a.effect.pseudoElement || '')) };
    out.foldedName = [...document.querySelectorAll('.vt-mark[data-vt-key="eq"]')].map(m => m.style.viewTransitionName).join();
    await vt.finished;
    out.nameAfter = [...document.querySelectorAll('.vt-mark[data-vt-key="eq"]')].map(m => m.style.viewTransitionName).join();
    return out;
  }, go);
  console.log('unpaired   :', JSON.stringify({ '2.1→2.2 eq enters': await fx('next'), '2.2→2.1 eq leaves': await fx('prev') }), '(during the transition eq has no group of its own and its name is none; restored afterwards)');
  await p.close();
}

/* ── continuous animation (slide(anim:)): starts after the transition, pauses
   when leaving, stays on the track after a resize ─────────────────── */
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
  console.log('continuous :', JSON.stringify({ duringTransition: during, afterTransition: after, offTrack: d1, afterLeaving: left, backAndResized: await states(), offTrack2: await onTrack() }));
  await p.close();
}

/* ── element animation (mark(key, s0, s1, …)): one step at a time, geometry
   interpolated, mirrored when going back, the page flips only once done ── */
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
    return { shown: shown.map(g => g.getAttribute('data-typst-label').split('@')[1]).join(','),
             step: window.vtslides.step + '/' + window.vtslides.steps, hash: location.hash,
             running: s.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length,
             ball: r ? [+(r.x + r.width / 2).toFixed(1), +(r.y + r.height / 2).toFixed(1)] : null,
             hoisted: s.querySelectorAll('.vt-mark').length,
             counter: document.querySelector('.vt-count').textContent,
             dots: [...document.querySelectorAll('.vt-group')[window.__W - 1].querySelectorAll('.vt-dots i')].map(d => d.classList.contains('is-now') ? '◉' : d.classList.contains('is-on') ? '●' : '○').join('') };
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
  console.log('element    :', JSON.stringify({
    start: s0, halfway: { ...mid, ballBetweenEnds: between(s0.ball[0], mid.ball[0], s1.ball[0]) }, done: s1,
    backHalfway: { ...back, ballBetweenEnds: between(s0.ball[0], back.ball[0], s1.ball[0]) }, backAtStart: s0b,
    fiveQuickPresses: last, onceMoreFlipsPage: next, backLandsOnLastStep: ret, enteringForwardStartsOver: fresh,
  }));
  /* in the overview: other pages' thumbnails rest on the last step; hovering a dot
     previews that step and leaving restores; clicking a dot opens exactly that step */
  await p.evaluate(() => window.vtslides.go(3)); await p.waitForTimeout(900);
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  const thumb = () => p.evaluate(() => { const s = document.querySelectorAll('.vt-group')[window.__W - 1].querySelector('.vt-slide.is-thumb'); return [...s.querySelectorAll('[data-typst-label*="@"]')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-typst-label').split('@')[1]).join(); });
  const dot = (await p.$$(`.vt-group:nth-child(${W}) .vt-dots i`))[2];
  const t0 = await thumb(); await dot.hover(); await p.waitForTimeout(100); const t1 = await thumb();
  await p.mouse.move(10, 10); await p.waitForTimeout(100); const t2 = await thumb();
  await dot.hover(); await p.waitForTimeout(50); await dot.click(); await p.waitForTimeout(1000);
  console.log('steps in overview:', JSON.stringify({ otherPageThumb: t0, hoverThirdDot: t1, leave: t2, open: await p.evaluate(() => location.hash + ' ' + (document.querySelector('.vt-deck').classList.contains('vt-all') ? 'overview' : 'show')) }), `(expected 5 2 5 #${W}.3 show)`);
  await p.close();
}

/* ── a mark's own enter/leave, mark(transition:): unpaired marks use their own
   effect; the whole-page wipe is checked as well ────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#8.1'); await p.waitForTimeout(400);
  const fx = (go, re) => p.evaluate(async ([go, re]) => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides[go](); await vt.ready;
    const out = {}, rx = new RegExp(re);
    document.getAnimations().forEach(a => { const ps = a.effect.pseudoElement; if (ps && rx.test(ps) && !/group|pair/.test(ps)) out[ps.replace('::view-transition-', '')] = a.animationName + ' ' + getComputedStyle(document.documentElement, ps).getPropertyValue(/old/.test(ps) ? '--vt-out' : '--vt-in').trim(); });
    out.classes = [...document.querySelectorAll('.vt-mark')].filter(m => /vt-fx/.test(m.style.viewTransitionClass)).map(m => m.style.viewTransitionClass).join(';');
    await vt.finished; return out;
  }, [go, re]);
  const a = await fx('next', 'm-thm|m-def');
  const b2 = await fx('next', 'm-proof');
  const c = await fx('prev', 'm-proof');
  await p.evaluate(() => { document.querySelectorAll('.vt-slide')[19].dataset.transition = 'wipe-up'; });   // page 10 frame 1: whole-page reveal
  await p.evaluate(() => window.vtslides.go(18)); await p.waitForTimeout(900);
  const d = await fx('next', '\\(root\\)');
  console.log('enter/leave:', JSON.stringify({ '8.1→8.2 theorem enters': a, '8.2→8.3 proof enters': b2, '8.3→8.2 proof leaves': c, 'whole-page wipe-up': d }),
    '(new is revealed from --vt-in, old collapses to --vt-out; the paired def carries no fx class)');
  await p.close();
}

/* ── states as continuous keyframes, host keyframes with delay: the three showy
   pages each run on their own and count no steps ───────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  const look = async hash => {
    await p.goto(url + hash); await p.waitForTimeout(1200);
    return p.evaluate(() => {
      const s = document.querySelector('.vt-slide.is-active');
      const an = s.getAnimations({ subtree: true });
      return { steps: window.vtslides.steps, animations: an.length, running: an.filter(a => a.playState === 'running').length,
               targets: [...new Set(an.map(a => a.effect.target.tagName.toLowerCase()))].join(','),
               keyframes: Math.max(...an.map(a => a.effect.getKeyframes().length)),
               delay: [...new Set(an.map(a => a.effect.getTiming().delay))].join(',') };
    });
  };
  console.log('balls      :', JSON.stringify(await look('#12')), '(5 svg host animations, 5 keyframes, delay 0…560)');
  console.log('pendulums  :', JSON.stringify(await look('#13')), '(single: one svg host; double: one 96-keyframe animation per path; no steps)');
  console.log('sea        :', JSON.stringify(await look('#14')), '(one 25-keyframe animation per path; no steps)');
  await p.close();
}

/* ── clicks during a transition still count ─────────────────────────
   During a transition the browser does no hit testing against the real DOM
   (the target is always <html>), so clicks are bound on document and judged
   by coordinates; on rapid clicks next() is computed from the accepted target
   (want), not from the painted cur — paint() waits for the snapshot capture,
   100ms+ the first time. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  for (let i = 0; i < 5; i++) { await p.mouse.click(900, 360); await p.waitForTimeout(40); }
  await p.mouse.click(200, 360);                                   // left third, mid-transition
  await p.waitForTimeout(1200);
  const mid = await p.evaluate(() => ({ page: window.vtslides.index, hash: location.hash, leftover: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null }));
  await p.mouse.move(640, 360); await p.waitForTimeout(100);
  const bar = await p.evaluate(() => { const r = document.querySelector('.vt-bar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(900, 360); await p.waitForTimeout(60);
  await p.mouse.click(bar.x, bar.y);                                 // on the toolbar, mid-transition
  await p.waitForTimeout(1200);
  console.log('rapid clicks:', JSON.stringify(mid), '(5 forward then 1 back → 4)  toolbar click mid-transition:', await p.evaluate(() => window.vtslides.index), '(→ 5, no flip)');
  await p.close();
}

/* ── the toolbar's backdrop-filter must not enter the transition ─────
   The spec copies backdrop-filter onto ::view-transition-group(), while
   opacity is only baked into the snapshot image, so during the transition an
   invisible sheet of frosted glass blurs the snapshot under it (the larger the
   toolbar's share of a small viewport, the worse — most visible in the speaker
   view's iframe). Turned off on the pseudo-element only. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('frosted glass:', JSON.stringify(await p.evaluate(async () => {
    const idle = getComputedStyle(document.querySelector('.vt-bar')).backdropFilter;
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vtslides.next(); await vt.ready;
    return { idle: idle,
      duringTransition: getComputedStyle(document.documentElement, '::view-transition-group(vt-bar)').backdropFilter };
  })));
  await p.close();
}

/* ── speaker view: iframes load the deck itself, hash addressing, vt:slide sync, works over file:// ── */
{
  const ctx = await b.newContext(VP);
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400);
  console.log('notes      :', JSON.stringify(await p.evaluate(() => ({
    count: document.querySelectorAll('.vt-group > .vt-note').length,
    inLayout: getComputedStyle(document.querySelector('.vt-note')).display,
  }))));
  const [w] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('s')]);
  watch(w); await w.waitForTimeout(1000);
  const inner = () => w.frames().filter(f => f !== w.mainFrame());
  for (const f of inner()) await f.evaluate(() => { window.__alive = 1; });   // a reload would wipe this
  const snap = async () => ({
    main: await p.evaluate(() => window.vtslides.index),
    popup: await w.evaluate(() => ({
      page: document.querySelector('header b').textContent,
      note: document.querySelector('.note').textContent.slice(0, 12),
      next: document.querySelector('aside iframe').hidden ? 'none' : 'yes',
    })),
    iframe: await Promise.all(inner().map(f => f.evaluate(() =>
      location.hash + (window.__alive ? '' : ' reloaded')))),
  });
  console.log('open       :', JSON.stringify(await snap()));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  console.log('main flips :', JSON.stringify(await snap()));
  await w.bringToFront(); await w.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  console.log('popup drives:', JSON.stringify(await snap()));
  await p.evaluate(() => window.vtslides.go(window.vtslides.total - 1)); await p.waitForTimeout(1000);
  console.log('last page  :', JSON.stringify((await snap()).popup));
  await p.bringToFront(); await p.keyboard.press('s'); await p.waitForTimeout(200);
  console.log('press s again: windows', ctx.pages().length, '(only focuses, does not open another)');

  // the popup's own toolbar: pinned bottom-right, state refreshed with the main window; the preview copies have no toolbar
  await p.evaluate(() => window.vtslides.go(0)); await p.waitForTimeout(900);
  await w.evaluate(() => document.querySelectorAll('.vt-bar button')[1].click());   // laser clicked in the popup
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  console.log('popup toolbar:', JSON.stringify(await w.evaluate(() => {
    const bar = document.querySelector('.vt-bar'), r = bar.getBoundingClientRect();
    return { bottomRight: [innerWidth - r.right, innerHeight - r.bottom].map(Math.round).join(','),
      visible: getComputedStyle(bar).opacity, page: bar.querySelector('.vt-count').textContent,
      laser: bar.querySelectorAll('button')[1].getAttribute('aria-pressed') };
  })), 'main window:', JSON.stringify(await p.evaluate(() => ({
    page: document.querySelector('.vt-count').textContent, lasing: document.body.classList.contains('vt-lasing') }))),
    'toolbar in previews:', (await Promise.all(inner().map(f => f.evaluate(() => !!document.querySelector('.vt-bar'))))).join());
  // pointing at (25%, 50%) of the "current page" preview → the main window's dot lands at (25%, 50%) of the deck
  const at = await w.evaluate(() => { const q = document.querySelector('main iframe').getBoundingClientRect();
    return { x: q.left + q.width * .25, y: q.top + q.height * .5 }; });
  await w.mouse.move(at.x, at.y);
  console.log('point on preview:', JSON.stringify(await p.evaluate(() => {
    const q = document.querySelector('.vt-deck').getBoundingClientRect(), l = document.querySelector('.vt-laser');
    return { dot: l.classList.contains('is-on'), position: l.style.transform,
      expected: 'translate(' + (q.left + q.width * .25) + 'px, ' + (q.top + q.height * .5) + 'px)' };
  })));
  await w.mouse.move(at.x, 630);
  console.log('leave preview: dot', await p.evaluate(() => document.querySelector('.vt-laser').classList.contains('is-on')));
  // the cursor and the DOM dot must be the same image
  console.log('same image :', JSON.stringify(await p.evaluate(() => {
    const u = s => (s.match(/url\("([^"]+)"\)/) || [])[1];
    const cur = getComputedStyle(document.querySelector('.vt-deck')).cursor;
    const dot = getComputedStyle(document.querySelector('.vt-laser'));
    return { same: !!u(cur) && u(cur) === u(dot.backgroundImage), dot: dot.width + ' ' + dot.backgroundSize };
  })));
  // clicking the "current page" preview = clicking the main deck: right side next, left third previous; the notes area does nothing
  const nowBox = await w.evaluate(() => { const q = document.querySelector('main iframe').getBoundingClientRect();
    return { l: q.left, t: q.top, w: q.width, h: q.height }; });
  const idx = () => p.evaluate(() => window.vtslides.index);
  const seq = [await idx()];
  await w.mouse.click(nowBox.l + nowBox.w * .8, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .1, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h + 60);   await p.waitForTimeout(900); seq.push(await idx());
  console.log('popup clicks: start → right → left third → notes =', seq.join(' → '));
  // the progress bar advances per frame; the wheel flips on the preview, not on the notes
  const prog = () => w.evaluate(() => document.querySelector('.prog i').style.width);
  const before = await prog();
  await w.mouse.move(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h * .5); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  const afterWheel = { page: await idx(), progress: await prog() };
  const noteBox = await w.evaluate(() => { const q = document.querySelector('.note').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await w.mouse.move(noteBox.x, noteBox.y); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  console.log('popup wheel:', JSON.stringify({ progressBar: before, oneNotchOnPreview: afterWheel, pageAfterNotchOnNotes: await idx() }));
  await ctx.close();
}

/* ── wheel paging: one notch = one page with a mouse, one gesture (inertia included) = one page on a trackpad, nothing in the overview ── */
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
  console.log('wheel      :', JSON.stringify({ twoNotches: two, oneBack: back, trackpadGestureWithInertia: pad, inOverview: await idx() }), '(expected 2 1 2 2)');
  await p.close();
}

console.log('errors:', errs.length ? errs : 'none');
await b.close();
