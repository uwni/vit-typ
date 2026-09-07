/* Regressions for the toolbar / laser pointer / overview zoom / touch routing /
   speaker view.   Usage: node tools/ui.mjs                                   */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'tutorial.html');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const VP = { viewport: { width: 1280, height: 720 } };
const errs = [];
/* Page numbers move as the tutorial grows. W is the element-animation page
   (the wave), F the number of frames before it; T is the theorem page (three
   marks with entrances of their own), L the assembly page (layers), Z the page
   whose own transition sets the zoom knobs, DASH the page whose states differ
   only in their dash pattern, and the rest the continuous pages. */
const W = 14, F = 32, T = 10, L = 13, Z = 12, DASH = 17, BALLS = 18, FOLLOW = 19, CLEF = 20, SEA = 21;
/* The deck opens on the desk, whose preview is a second copy of this document:
   wait for this copy to be ready, present, then let that one finish loading, so
   the page is quiet and the timings below are the deck's own. A tutorial page is
   mostly text, and text is glyph outlines, so this document is several times the
   size of the demo that used to live here: waiting on data-ready rather than on
   a fixed delay is what keeps the time-sensitive cases below honest. */
const ready = p => p.waitForFunction(() => document.querySelector('.vt-deck')?.hasAttribute('data-ready'), null, { timeout: 60000 });
const present = async p => {
  await p.waitForFunction(() => document.querySelector('.vt-deck')?.hasAttribute('data-ready'), null, { timeout: 60000 });
  await p.evaluate(() => { window.vit.mode = 'present'; });
  for (const f of p.frames()) if (f !== p.mainFrame()) await f.waitForLoadState('load').catch(() => { });
  await p.waitForTimeout(150);
};
const watch = p => {
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
};

/* ── toolbar: PDF link ─────────────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
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
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  const snap = () => p.evaluate(() => ({
    lasing: document.body.classList.contains('vt-lasing'),
    pressed: document.querySelector('.vt-bar button[aria-pressed]:nth-of-type(2)').getAttribute('aria-pressed'),
    overview: document.querySelector('.vt-deck').classList.contains('vt-all'),
    cursor: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
  }));
  await p.keyboard.press('l'); console.log('laser on     :', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  console.log('into overview:', JSON.stringify(await snap()));
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  console.log('back to show :', JSON.stringify(await snap()));
  await p.close();
}

/* ── opening from the overview = whole-page zoom, not an element-level morph ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  console.log('overview open:', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document);
    document.startViewTransition = () => { };
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
    page: window.vit.index + 1,
    leftover: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null,
  }))));
  console.log('plain flip   :', JSON.stringify(await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit.go(0); await vt.ready;
    return {
      type: [...vt.types].join(' '),
      markNames: [...new Set([...document.querySelectorAll('.vt-mark')].map(m => getComputedStyle(m).viewTransitionName))]
    };
  })));
  await p.close();
}

/* ── touch: the cursor cannot change, so the pointer becomes a DOM dot ── */
{
  const ctx = await b.newContext({ ...VP, hasTouch: true });
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  const snap = () => p.evaluate(() => ({
    cursor: getComputedStyle(document.querySelector('.vt-deck')).cursor.slice(0, 18),
    nomouse: document.body.classList.contains('vt-nomouse'),
    lit: document.querySelector('.vt-laser').classList.contains('is-on'),
    page: window.vit.index,
  }));
  await p.keyboard.press('l');
  await p.mouse.move(600, 300); console.log('mouse      :', JSON.stringify(await snap()));
  await p.touchscreen.tap(720, 400);                   // laser is on: a tap must not flip the page
  const d = { pointerType: 'touch', clientX: 300, clientY: 500, bubbles: true };
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerdown', d)), d);
  console.log('touch hold :', JSON.stringify({
    ...await snap(),
    position: await p.evaluate(() => document.querySelector('.vt-laser').style.transform)
  }));
  await p.evaluate(d => document.dispatchEvent(new PointerEvent('pointerup', d)), d);
  console.log('touch up   :', JSON.stringify(await snap()));
  await p.keyboard.press('l');                         // laser off: a tap should flip the page
  await p.touchscreen.tap(720, 400); await p.waitForTimeout(900);
  console.log('laser off  :', JSON.stringify(await snap()));
  await ctx.close();
}

/* ── transition settings: duration, easing and the effects' own knobs ──
   tools/knobs.typ sets them at all three levels — the deck's default, one
   page's own, one mark's. The Typst side turns each bundle into one rule and
   names it after what it holds; the name rides along as a view transition type
   on the page, as a view-transition-class on the mark. Nothing here is the
   runtime's: it only divides by the speed multiplier. */
{
  const src = join(HERE, 'knobs.typ');
  const out = join(tmpdir(), 'vt-knobs.html');
  execFileSync('typst', ['compile', '--root', join(HERE, '..'), '--features', 'html', src, out], { stdio: ['ignore', 'ignore', 'ignore'] });
  const p = await b.newPage(VP); watch(p);
  await p.goto('file://' + out); await p.waitForTimeout(400); await present(p);
  const types = await p.evaluate(() => [...document.querySelectorAll('.vt-slide')].map(s => s.dataset.transition));
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit[go](); await vt.ready;
    const at = ps => { const c = getComputedStyle(document.documentElement, ps); return [c.animationDuration, c.getPropertyValue('--vt-zoom').trim(), c.getPropertyValue('--vt-push').trim()].filter(Boolean).join(' '); };
    const m = document.querySelector('.vt-mark[data-vt-key="m"]');
    const r = {
      types: [...vt.types].join(' '), easing: getComputedStyle(document.documentElement, '::view-transition-new(root)').animationTimingFunction,
      new: at('::view-transition-new(root)'), old: at('::view-transition-old(root)'),
      mark: m && m.style.viewTransitionName ? at('::view-transition-new(' + m.style.viewTransitionName + ')') : '', markClass: m ? m.style.viewTransitionClass : '',
      markFit: m && m.style.viewTransitionName ? (c => c.objectFit + ' ' + c.objectPosition)(getComputedStyle(document.documentElement, '::view-transition-new(' + m.style.viewTransitionName + ')')) : ''
    };
    await vt.finished; return r;
  }, go);
  const page2 = await fx('next');
  const page3 = await fx('next');
  await p.evaluate(() => { window.vit.speed = 2; });
  const half = await fx('prev');
  await p.evaluate(() => { window.vit.speed = 1; localStorage.removeItem('vt-speed'); });
  const back = await fx('prev');
  console.log('knobs      :', JSON.stringify({ types, page2, page3, atDoubleSpeed: half, backToPage2: back }),
    '(page 2 gives each side its own: entering 200ms with push -100%, leaving 900ms with zoom 6, both on its shared easing; page 3 the deck\'s 1200ms; the mark its own 900ms; at 2× every duration is halved; going back the two sides swap images, so the new one now runs the leave side\'s 900ms; the mark also asks not to be stretched: object-fit none, anchored bottom right)');
  await p.close();
}

/* ── the desk: where the deck opens ──────────────────────────────────
   The rail is the deck in thumbnails, the preview a copy of this document at
   the selected page, the notes that page's. Clicking the rail selects, Enter
   presents, Esc comes back — and nothing animates or transitions here. */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p);
  await p.goto(url + `#${Z}`); await ready(p); await p.waitForTimeout(800);
  const desk = () => p.evaluate(Z => {
    const rail = document.querySelector('.vt-deck'), pane = document.querySelector('.vt-pane');
    const seen = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      mode: window.vit.mode, page: window.vit.index,
      thumbs: document.querySelectorAll('.vt-slide.is-thumb').length,
      here: [...document.querySelectorAll('.vt-group')].findIndex(g => g.classList.contains('is-here')),
      preview: (document.querySelector('.vt-pane iframe').getAttribute('src') || '').replace(/^.*#/, '#'),
      notes: document.querySelector('.vt-notes').textContent.slice(0, 18),
      pane: getComputedStyle(pane).display === 'none' ? 'hidden' : 'shown',
      railScrolled: rail.scrollTop > 0,
      inView: seen(document.querySelectorAll('.vt-group')[window.vit.index === 0 ? 0 : Z - 1]),
      bar: document.querySelector('.vt-bar').classList.contains('is-shown'),
      running: document.getAnimations().filter(a => a.playState === 'running').length,
    };
  }, Z);
  const open = await desk();
  await p.waitForTimeout(2600);   // the toolbar's auto-hide is 2.4 s: at the desk it must not fire
  const stillShown = await p.evaluate(() => document.querySelector('.vt-bar').classList.contains('is-shown'));
  await p.evaluate(() => { const g = document.querySelectorAll('.vt-group')[2]; g.querySelector('.vt-slide.is-thumb').click(); });
  await p.waitForTimeout(700);
  const picked = await desk();
  await p.evaluate(() => document.querySelectorAll('.vt-group')[6].querySelectorAll('.vt-dots i')[2].click());
  await p.waitForTimeout(700);
  const dot = await desk();
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  const shown = await desk();
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  const back = await desk();
  console.log('desk       :', JSON.stringify({ open, barAfter3s: stillShown, picked, dot, present: shown, esc: back }),
    `(opens at #${Z} on the desk: every page a thumb, that page here and scrolled into view, the preview at #${Z}, the toolbar shown and staying; a thumbnail selects, a dot selects its step, Enter presents (pane hidden), Esc comes back)`);
  await p.close();
}

/* ── thumbnails: one per page, title + number, frames as dots ─────── */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  await p.evaluate(() => window.vit.go(7)); await p.waitForTimeout(800);
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
    frame: window.vit.index, counter: document.querySelector('.vt-count').textContent,
    hash: location.hash, overview: document.querySelector('.vt-deck').classList.contains('vt-all'),
  }))));
  // while presenting, these parts must be entirely absent from the layout
  console.log('presenting :', JSON.stringify(await p.evaluate(() => ({
    caption: getComputedStyle(document.querySelector('.vt-cap')).display,
    dots: getComputedStyle(document.querySelector('.vt-dots')).display,
  }))));
  await p.close();
}

/* the motion of a pseudo-element: its animation and the variables deck.css set on it (opacity / transform / clip / timing) */
const MOTION = `(ps) => { const cs = getComputedStyle(document.documentElement, ps); return [cs.animationName, ...['--vt-opacity', '--vt-transform', '--vt-s-away', '--vt-clip', '--vt-timing'].map(v => cs.getPropertyValue(v).trim()).filter(Boolean)].join(' '); }`;

/* ── page transition / speed factor / UI theme ─────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#10.3'); await p.waitForTimeout(400); await present(p);
  const fx = go => p.evaluate(async ([go, MOTION]) => {
    const motion = eval(MOTION);
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit[go](); await vt.ready;
    const r = {
      vt: [...vt.types].join(' '),
      root: { new: motion('::view-transition-new(root)'), old: motion('::view-transition-old(root)') },
      title: document.getAnimations().filter(a => /m-title-1/.test(a.effect.pseudoElement) && !/group|pair/.test(a.effect.pseudoElement)).map(a => a.effect.pseudoElement.replace('::view-transition-', '').replace('(m-title-1)', '') + ':' + a.animationName).join(),
      titleClass: [...document.querySelectorAll('.vt-mark[data-vt-key="title"]')].map(m => m.style.viewTransitionClass).filter(c => /vt-only-(new|old)/.test(c)).join()
    };
    await vt.finished; return r;
  }, [go, MOTION]);
  console.log('transition :', JSON.stringify({ '10.3→11 (slide)': await fx('next'), '11→10.3 (back)': await fx('prev'), '10.3→10.2 (default)': await fx('prev') }), '(slide: new from translateX(100%), old to translateX(-100%), back the other way round; default: new from opacity 0, old held at 1; the heading is on both pages, so it is a pair and cross-fades with the browser\'s own animations, never a vt-only class)');
  /* the types on a frame are the transition into it: give page 7's first frame `slide`;
     entering the page slides, frame-to-frame inside the page still fades (the later frame's types) */
  await p.evaluate(() => { document.querySelectorAll('.vt-group')[6].querySelector('.vt-slide').dataset.transition = 'enter-slide leave-slide'; window.vit.go(14); });
  await p.waitForTimeout(1000);
  console.log('page/frame :', JSON.stringify({ '6.3→7.1': (await fx('next')).vt, '7.1→7.2': (await fx('next')).vt, '7.2→7.1': (await fx('prev')).vt, '7.1→6.3': (await fx('prev')).vt }), '(expected slide fwd / fade fwd / fade back / slide back)');
  const sp = () => p.evaluate(() => {
    return { speed: document.documentElement.style.getPropertyValue('--vt-speed'), counter: document.querySelector('.vt-count').textContent, stored: localStorage.getItem('vt-speed') };
  });
  await p.keyboard.press('='); const a = await sp();
  await p.keyboard.press('-'); await p.keyboard.press('-'); const c = await sp();
  await p.keyboard.press('0'); const z = await sp();
  await p.evaluate(() => localStorage.removeItem('vt-speed'));
  console.log('speed      :', JSON.stringify({ 'press =': a, 'then -,-': c, 'press 0': z }), '(the multiplier; deck.css divides every duration by it: 1.25 / 0.8 / 1)');
  const th = () => p.evaluate(() => ({
    html: document.documentElement.dataset.theme,
    bar: getComputedStyle(document.querySelector('.vt-bar')).backgroundColor, deck: getComputedStyle(document.querySelector('.vt-deck')).backgroundColor
  }));
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(50); const light = await th();
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(50); const dark = await th();
  console.log('theme      :', JSON.stringify({ systemLight: light, systemDark: dark }), '(the deck background must be rgb(17, 19, 24) on both)');
  await p.close();
}

/* ── mirror across a transition ─────────────────────────────────────
   "hold the old + fade the new in" reversed becomes "hold the new + fade the
   old out": mirrored in time. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#4.2'); await p.waitForTimeout(400); await present(p);
  const fx = go => p.evaluate(async ([go, MOTION]) => {
    const motion = eval(MOTION);
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit[go](); await vt.ready;
    const out = {};
    document.getAnimations().forEach(a => { const ps = a.effect.pseudoElement; if (ps && /m-chip-1|\(root\)/.test(ps) && !/group|pair/.test(ps)) out[ps.replace('::view-transition-', '')] = motion(ps); });
    await vt.finished; return out;
  }, [go, MOTION]);
  console.log('mirror     :', JSON.stringify({ forward: await fx('next'), back: await fx('prev') }), '(both directions: root old held at 1 under new from 0, the chip pair old to 0 / new from 0 — symmetric by construction)');
  await p.close();
}

/* ── unpaired marks: one without an effect of its own folds into root (its name
   is removed for the duration, so it travels with the page) and is restored
   afterwards. No :only-child — unreliable on transition pseudos since Chrome 152. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#1'); await p.waitForTimeout(400); await present(p);
  const fx = go => p.evaluate(async go => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit[go](); await vt.ready;
    const out = { subGroup: document.getAnimations().some(a => /m-sub/.test(a.effect.pseudoElement || '')) };
    const named = () => [...document.querySelectorAll('.vt-mark[data-vt-key="sub"]')].map(m => m.style.viewTransitionName).join();
    out.foldedName = named();
    await vt.finished;
    out.nameAfter = named();
    return out;
  }, go);
  console.log('unpaired   :', JSON.stringify({ '1→2.1 sub leaves': await fx('next'), '2.1→1 sub enters': await fx('prev') }), '(during the transition sub has no group of its own and its name is none; restored afterwards)');
  await p.close();
}

/* ── continuous animation (slide(anim:)): starts after the transition, pauses
   when leaving, stays on the track after a resize ─────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + `#${FOLLOW - 1}`); await p.waitForTimeout(400); await present(p);
  const onTrack = () => p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    const path = s.querySelector('.vt-mark[data-vt-key="track"] path'), dot = s.querySelector('.vt-mark[data-vt-key="dot"]');
    const c = dot.getBoundingClientRect(), pt = new DOMPoint(c.x + c.width / 2, c.y + c.height / 2).matrixTransform(path.getScreenCTM().inverse());
    const L = path.getTotalLength(); let best = 1e9;
    for (let i = 0; i <= 600; i++) { const q = path.getPointAtLength(L * i / 600); best = Math.min(best, Math.hypot(q.x - pt.x, q.y - pt.y)); }
    return +best.toFixed(2);
  });
  const states = () => p.evaluate(F => document.querySelectorAll('.vt-group')[F].querySelector('.vt-slide').getAnimations({ subtree: true }).map(a => a.effect.target.dataset.vtKey + ':' + a.playState).join(' '), FOLLOW - 1);
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
  await p.goto(url + `#${W}`); await p.waitForTimeout(400); await present(p);
  await p.evaluate(W => { window.__W = W; }, W);
  const st = () => p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    const gs = [...s.querySelectorAll('[data-vt-state]')];
    const shown = gs.filter(g => getComputedStyle(g).display !== 'none');
    const ball = shown.length ? [...shown[0].querySelectorAll('path')].find(q => q.getAttribute('fill') !== 'none') : null;
    const r = ball && ball.getBoundingClientRect();
    return {
      shown: shown.map(g => g.dataset.vtAt).join(','),
      step: window.vit.step + '/' + window.vit.steps, hash: location.hash,
      running: s.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length,
      ball: r ? [+(r.x + r.width / 2).toFixed(1), +(r.y + r.height / 2).toFixed(1)] : null,
      hoisted: s.querySelectorAll('.vt-mark').length,
      counter: document.querySelector('.vt-count').textContent,
      dots: [...document.querySelectorAll('.vt-group')[window.__W - 1].querySelectorAll('.vt-dots i')].map(d => d.classList.contains('is-now') ? '◉' : d.classList.contains('is-on') ? '●' : '○').join('')
    };
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
  const next = await p.evaluate(() => window.vit.index + 1 + location.hash);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1000);
  const ret = await st();
  await p.evaluate(F => window.vit.go(F - 1), F); await p.waitForTimeout(1000);
  await p.evaluate(F => window.vit.go(F), F); await p.waitForTimeout(1000);
  const fresh = await st();
  console.log('element    :', JSON.stringify({
    start: s0, halfway: { ...mid, ballBetweenEnds: between(s0.ball[0], mid.ball[0], s1.ball[0]) }, done: s1,
    backHalfway: { ...back, ballBetweenEnds: between(s0.ball[0], back.ball[0], s1.ball[0]) }, backAtStart: s0b,
    fiveQuickPresses: last, onceMoreFlipsPage: next, backLandsOnLastStep: ret, enteringForwardStartsOver: fresh,
  }));
  /* in the overview: other pages' thumbnails rest on the last step; hovering a dot
     previews that step and leaving restores; clicking a dot opens exactly that step */
  await p.evaluate(() => window.vit.go(3)); await p.waitForTimeout(900);
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  const thumb = () => p.evaluate(() => { const s = document.querySelectorAll('.vt-group')[window.__W - 1].querySelector('.vt-slide.is-thumb'); return [...s.querySelectorAll('[data-vt-state]')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.dataset.vtAt).join(); });
  const dot = (await p.$$(`.vt-group:nth-child(${W}) .vt-dots i`))[2];
  const t0 = await thumb(); await dot.hover(); await p.waitForTimeout(100); const t1 = await thumb();
  await p.mouse.move(10, 10); await p.waitForTimeout(100); const t2 = await thumb();
  await dot.hover(); await p.waitForTimeout(50); await dot.click(); await p.waitForTimeout(1000);
  console.log('steps in overview:', JSON.stringify({ otherPageThumb: t0, hoverThirdDot: t1, leave: t2, open: await p.evaluate(() => location.hash + ' ' + (document.querySelector('.vt-deck').classList.contains('vt-all') ? 'overview' : 'show')) }), `(expected 5 2 5 #${W}.3 show)`);
  /* a preview of one page put back when another page's group is clicked */
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  await (await p.$$(`.vt-group:nth-child(${W}) .vt-dots i`))[1].hover(); await p.waitForTimeout(100);
  const peeking = await thumb();
  await p.click('.vt-group:nth-child(3)'); await p.waitForTimeout(1000);
  console.log('peek, open other:', JSON.stringify({ peeking, opened: await p.evaluate(() => location.hash), peekedPageStep: await p.evaluate(() => document.querySelectorAll('.vt-group')[window.__W - 1].querySelector('.vt-slide').vtAt) }), '(expected 1, #3, 5 — the preview is put back, and a page left behind rests on its last step)');
  await p.close();
}

/* ── a mark's own enter/leave, mark(transition:): unpaired marks use their own
   effect; the whole-page wipe is checked as well ────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + `#${T}.1`); await p.waitForTimeout(400); await present(p);
  const fx = (go, re) => p.evaluate(async ([go, re, MOTION]) => {
    const motion = eval(MOTION);
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit[go](); await vt.ready;
    const out = {}, rx = new RegExp(re);
    document.getAnimations().forEach(a => { const ps = a.effect.pseudoElement; if (ps && rx.test(ps) && !/group|pair/.test(ps)) out[ps.replace('::view-transition-', '')] = motion(ps); });
    out.classes = [...document.querySelectorAll('.vt-mark')].filter(m => /vt-only-(new|old)/.test(m.style.viewTransitionClass)).map(m => m.style.viewTransitionClass).join(';');
    await vt.finished; return out;
  }, [go, re, MOTION]);
  const a = await fx('next', 'm-thm|m-def');
  const b2 = await fx('next', 'm-proof');
  const c = await fx('prev', 'm-proof');
  await p.evaluate(() => { document.querySelectorAll('.vt-slide')[22].dataset.transition = 'enter-wipe-up leave-wipe-up'; });   // page 10 frame 1: whole-page reveal
  await p.evaluate(() => window.vit.go(21)); await p.waitForTimeout(900);
  const d = await fx('next', '\\(root\\)');
  console.log('enter/leave:', JSON.stringify({ [`${T}.1→${T}.2 theorem enters`]: a, [`${T}.2→${T}.3 proof enters`]: b2, [`${T}.3→${T}.2 proof leaves`]: c, 'whole-page wipe-up': d }),
    '(new is revealed from its clip, old collapses to its clip; the paired def carries no vt-only class; proof leaves by zoom = opacity 0, scale(3))');
  await p.close();
}

/* ── a pair on the move, and the zoom's defocus ──────────────────────
   Page 4 carries one key over three frames: the group starts where the chip
   was and travels, growing as it goes. Page 12's own transition is
   (effect: "zoom", duration: 900, zoom: 4), so the page comes in from four
   times life size and out of focus — the lens is a quarter of the 1280 stage,
   a point of the magnified image spreads over a circle c = A(s − 1), and the
   blur in the image's own pixels is that over s. Both are read by freezing the
   pseudo-elements' animations and seeking them: a screenshot on a timer is
   hundreds of milliseconds late. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#4.1'); await p.waitForTimeout(600); await present(p);
  const box = () => p.evaluate(() => {
    const r = document.querySelector('.vt-slide.is-active .vt-mark[data-vt-key="chip"]').getBoundingClientRect();
    return [r.x, r.y, r.width].map(Math.round);
  });
  const rest = await box();
  const travel = await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit.next(); await vt.ready;
    const ps = '::view-transition-group(' + document.querySelector('.vt-slide.is-active .vt-mark[data-vt-key="chip"]').style.viewTransitionName + ')';
    const at = () => {
      const g = getComputedStyle(document.documentElement, ps), m = new DOMMatrix(g.transform);
      return [m.e, m.f, parseFloat(g.width)].map(Math.round);
    };
    const anims = document.getAnimations().filter(a => a.effect.pseudoElement === ps);
    const out = { start: at() };
    for (const t of [350, 690]) {
      anims.forEach(a => { a.pause(); a.currentTime = t; });
      await new Promise(r => requestAnimationFrame(r));
      out['t' + t] = at();
    }
    anims.forEach(a => a.play());
    await vt.finished; return out;
  });
  const arrived = await box();
  await p.goto(url + `#${Z - 1}`); await p.waitForTimeout(600); await present(p);
  const zoom = await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit.next(); await vt.ready;
    const nw = getComputedStyle(document.documentElement, '::view-transition-new(root)');
    /* the lens is a quarter of the 1280 stage, c = A (s − 1), and the image's own blur is σ = c/4 over s */
    const focus = () => {
      const s = parseFloat(nw.getPropertyValue('--vt-s')), m = nw.filter.match(/blur\(([\d.]+)px\)/);
      const blur = m ? +parseFloat(m[1]).toFixed(2) : null;
      return { s: +s.toFixed(3), blur, physical: blur != null && Math.abs(blur - 320 / 4 * (s - 1) / s) < 0.1 };
    };
    const r = {
      types: [...vt.types].join(' '), anim: nw.animationName, duration: nw.animationDuration,
      from: nw.getPropertyValue('--vt-transform').trim() + ' away ' + nw.getPropertyValue('--vt-s-away').trim(),
      start: focus()
    };
    const anims = document.getAnimations().filter(a => a.effect.pseudoElement === '::view-transition-new(root)');
    for (const t of [450, 800]) {
      anims.forEach(a => { a.pause(); a.currentTime = t; });
      await new Promise(r => requestAnimationFrame(r));
      r['t' + t] = focus();
    }
    anims.forEach(a => a.play());
    await vt.finished; return r;
  });
  console.log('pair moves :', JSON.stringify({ rest, travel, arrived }), '(the group starts on the chip, moves right and down and grows; it lands where the next frame draws it)');
  console.log('zoom       :', JSON.stringify(zoom), `(page ${Z} asks for zoom 4 over 900ms: from scale(4), s 4 → 1, blur 60px → 0, physical at every sample)`);
  await p.close();
}

/* ── a step whose states differ in one property only: the dash page's two
   shapes must interpolate their dash arrays and nothing else — no cross-fade,
   no geometry. A caption with a changing number would change glyph counts and
   drop the whole mark back to a cross-fade, so this also guards that. ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#' + DASH); await p.waitForTimeout(900); await present(p);
  const steps = await p.evaluate(() => window.vit.steps);
  await p.evaluate(() => window.vit.next()); await p.waitForTimeout(60);
  console.log('dashes     :', JSON.stringify({ steps, ...await p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    const an = s.getAnimations({ subtree: true });
    const props = {};
    for (const a of an) for (const k of Object.keys(a.effect.getKeyframes()[0] || {}))
      if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k)) props[k] = (props[k] || 0) + 1;
    /* A dash pattern has to begin with a dash, so ink anywhere but the path's
       start needs a leading dash of zero length — and a zero-length dash with a
       round cap is painted as a dot, sitting on the path's first point for ever.
       Every such path must therefore have butt caps. */
    const roundZeroDashes = [...s.querySelectorAll('path')].filter(q => {
      const d = (getComputedStyle(q).strokeDasharray || '').split(',').map(parseFloat);
      return d.length === 4 && d[0] === 0 && getComputedStyle(q).strokeLinecap !== 'butt';
    }).length;
    return { animations: an.length, props, roundZeroDashes };
  }) }), '(4 steps; one step animates two nodes on strokeDasharray alone, and no zero-length dash carries a round cap)');
  await p.close();
}

/* ── states as continuous keyframes, host keyframes with delay: the three showy
   pages each run on their own and count no steps ───────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  const look = async hash => {
    await p.goto(url + hash); await p.waitForTimeout(1200); await present(p);
    return p.evaluate(() => {
      const s = document.querySelector('.vt-slide.is-active');
      const an = s.getAnimations({ subtree: true });
      return {
        steps: window.vit.steps, animations: an.length, running: an.filter(a => a.playState === 'running').length,
        targets: [...new Set(an.map(a => a.effect.target.tagName.toLowerCase()))].join(','),
        keyframes: Math.max(...an.map(a => a.effect.getKeyframes().length)),
        delay: [...new Set(an.map(a => a.effect.getTiming().delay))].join(',')
      };
    });
  };
  console.log('balls      :', JSON.stringify(await look('#' + BALLS)), '(5 svg host animations, 5 keyframes, delay 0…560)');
  console.log('clef       :', JSON.stringify(await look('#' + CLEF)), '(one 121-keyframe animation per moving path; 129 paths — 120 pieces of the outline whose paint and ink animate, 6 circles, the chain, the pen and the pinned rect — of which the rect and the circle on the origin never move, so 127; no steps)');
  console.log('sea        :', JSON.stringify(await look('#' + SEA)), '(one 25-keyframe animation per path; no steps)');
  await p.close();
}

/* ── keyframes are read from computed style, which only exists while the frame
   is on stage: a page entered from elsewhere must animate exactly like one
   opened directly (a hidden frame reports transform: none). Both readings seek
   to the same times, so they are comparable to the pixel. The same probe checks
   what the clef's trail is built on: a piece is exactly as long as the pen
   travels between two states, so the piece the pen is crossing fills its own
   dash at the pen's own rate. Read across one keyframe: the ink must end on the
   pen at every instant, not only on the states, and no piece ahead of the head
   may carry ink. ─────────────────────────────────────────────────── */
{
  const probe = async (p, F) => {
    await p.goto(url + (F == null ? '#' + CLEF : '')); await p.waitForTimeout(800); await present(p);
    if (F != null) { await p.evaluate(f => window.vit.go(f), F); await p.waitForTimeout(1200); }
    return p.evaluate(async () => {
      const s = document.querySelector('.vt-slide.is-active');
      const anims = s.getAnimations({ subtree: true });
      const paths = [...s.querySelector('[data-vt-state="clef"][data-vt-at="0"]').querySelectorAll('path')];
      /* found by what they are, not by where they sit: the pen is the only
         filled path, a piece of the trail is one whose dash pattern animates */
      const pen = paths.find(q => (q.getAttribute('fill') || 'none') !== 'none');
      const inked = new Set(anims.filter(a => 'strokeDasharray' in (a.effect.getKeyframes()[0] || {})).map(a => a.effect.target));
      const pieces = paths.filter(q => inked.has(q));
      const N = pieces.length;
      const out = {};
      for (const t of [2000, 2012, 2025, 2037]) {        // across one keyframe
        for (const a of anims) { a.pause(); a.currentTime = t; }
        await new Promise(r => requestAnimationFrame(r));
        const c = pen.getBoundingClientRect();
        const at = { x: +(c.x + c.width / 2).toFixed(1), y: +(c.y + c.height / 2).toFixed(1) };
        const V = pieces.map(q => ({ q, d: (getComputedStyle(q).strokeDasharray || '').split(',').map(parseFloat), L: q.getTotalLength() }));
        /* the head of the ink: it has ink and the piece after it has none */
        let h = -1;
        for (let i = 0; i < N; i++) if (V[i].d[0] > 0.05 && V[(i + 1) % N].d[0] <= 0.05) h = i;
        const z = V[h].q.getPointAtLength(Math.min(V[h].d[0], V[h].L)).matrixTransform(V[h].q.getScreenCTM());
        let ahead = 0;
        for (let k = 1; k <= 6; k++) if (V[(h + k) % N].d[0] > 0.05) ahead = k;
        out['t' + t] = { at, penKeyframes: anims.find(a => a.effect.target === pen).effect.getKeyframes().length,
                         headFill: +(V[h].d[0] / V[h].L).toFixed(2),
                         inkEndToPen: +Math.hypot(z.x - at.x, z.y - at.y).toFixed(2),
                         piecesOfInkAhead: ahead, pieces: N };
      }
      return out;
    });
  };
  const p = await b.newPage(VP); watch(p);
  const direct = await probe(p, null);
  const later = await probe(p, 38);
  console.log('clef trail :', JSON.stringify(direct), '(the head fills 0…1 across the keyframe and the ink ends on the pen throughout, under 1px; nothing carries ink ahead of it)');
  console.log('enter later:', JSON.stringify(later), 'same place:',
              later.t2000.at.x === direct.t2000.at.x && later.t2000.at.y === direct.t2000.at.y,
              '(entered from page 38, seeked to the same times: identical to the reading above)');
  await p.close();
}

/* ── clicks during a transition still count ─────────────────────────
   During a transition the browser does no hit testing against the real DOM
   (the target is always <html>), so clicks are bound on document and judged
   by coordinates; on rapid clicks next() is computed from the accepted target
   (want), not from the frame on stage (cur) — stage() waits for the snapshot
   capture, 100ms+ the first time. */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  for (let i = 0; i < 5; i++) { await p.mouse.click(900, 360); await p.waitForTimeout(40); }
  await p.mouse.click(200, 360);                                   // left third, mid-transition
  await p.waitForTimeout(1200);
  const mid = await p.evaluate(() => ({ page: window.vit.index, hash: location.hash, leftover: document.activeViewTransition ? [...document.activeViewTransition.types].join(' ') : null }));
  await p.mouse.move(640, 360); await p.waitForTimeout(100);
  const bar = await p.evaluate(() => { const r = document.querySelector('.vt-bar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(900, 360); await p.waitForTimeout(60);
  await p.mouse.click(bar.x, bar.y);                                 // on the toolbar, mid-transition
  await p.waitForTimeout(1200);
  console.log('rapid clicks:', JSON.stringify(mid), '(5 forward then 1 back → 4)  toolbar click mid-transition:', await p.evaluate(() => window.vit.index), '(→ 5, no flip)');
  await p.close();
}

/* ── transform keyframes come from the SVG DOM (transformOf): the matrix must
   be what the browser itself composes for the element — parent CTM⁻¹ × CTM —
   for every transformed node of a state, and for a translate·rotate·scale list
   (order matters) ───────────────────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#' + CLEF); await p.waitForTimeout(800); await present(p);
  console.log('own transform:', JSON.stringify(await p.evaluate(() => {
    const s = document.querySelector('.vt-slide.is-active');
    s.getAnimations({ subtree: true }).forEach(a => a.cancel());   // getCTM reads the animated transform while one runs
    const own = el => { const l = el.transform.baseVal, m = new DOMMatrix(); for (let i = 0; i < l.numberOfItems; i++) m.multiplySelf(l.getItem(i).matrix); return m; };
    const gap = el => { const a = own(el), b = el.parentNode.getCTM().inverse().multiply(el.getCTM()); return Math.max(...['a', 'b', 'c', 'd', 'e', 'f'].map(k => Math.abs(a[k] - b[k]))); };
    const els = [...s.querySelectorAll('[data-vt-at="0"] [transform]')];
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    t.setAttribute('transform', 'translate(10 20) rotate(30) scale(2 3)');
    s.querySelector('[data-vt-at="0"]').appendChild(t);
    const r = { nodes: els.length, worst: +Math.max(...els.map(gap)).toFixed(6), synthetic: +gap(t).toFixed(6) };
    t.remove(); return r;
  })), '(both under 1e-4)');
  await p.close();
}

/* ── hasty presses: a transition started while another runs must leave every
   mark's name intact — on 14.1 press ← twice quickly, then 13.3 → 13.2 must
   still morph the square (its group exists), not just cross-fade ────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + `#${W}.1`); await p.waitForTimeout(600); await present(p);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120); await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(1200);
  const names = () => p.evaluate(() => [...document.querySelectorAll('.vt-slide.is-active .vt-mark')].map(m => m.dataset.vtKey + '=' + getComputedStyle(m).viewTransitionName).join(' '));
  const atRest = await names();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1000);
  const fig = await p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit.prev(); await vt.ready;
    const r = { squareGroup: document.getAnimations().some(a => /group\(m-pb-1-1\)/.test(a.effect.pseudoElement || '')) };
    await vt.finished; return r;
  });
  console.log('hasty      :', JSON.stringify({ hash: await p.evaluate(() => location.hash), namesAtRest: atRest, [`${L}.3→${L}.2`]: fig, after: await names() }), '(every name its own, never none; the square has a group)');
  await p.close();
}

/* ── black screen, key help, Esc ────────────────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url + '#2.1'); await p.waitForTimeout(400); await present(p);
  const state = () => p.evaluate(() => ({ black: document.body.classList.contains('vt-black'), deck: getComputedStyle(document.querySelector('.vt-deck')).visibility, help: document.querySelector('.vt-help').hidden ? 'hidden' : 'shown', page: window.vit.index, overview: document.querySelector('.vt-deck').classList.contains('vt-all') }));
  const r = {};
  await p.keyboard.press('b'); await p.waitForTimeout(100); r.black = await state();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100); r.keyWhileBlack = await state();
  await p.keyboard.press('.'); await p.waitForTimeout(100); r.back = await state();
  await p.keyboard.press('?'); await p.waitForTimeout(100); r.help = { ...await state(), rows: await p.evaluate(() => document.querySelectorAll('.vt-help tr').length) };
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100); r.keyWhileHelp = await state();
  await p.keyboard.press('Escape'); await p.waitForTimeout(100); r.escClosesHelp = await state();
  await p.keyboard.press('o'); await p.waitForTimeout(900); await p.keyboard.press('Escape'); await p.waitForTimeout(900); r.escClosesOverview = await state();
  console.log('black/help :', JSON.stringify(r), '(black hides the deck and swallows keys; ? shows 12 rows and swallows keys; Esc closes the help and the overview)');
  await p.close();
}

/* ── the toolbar through a transition: hidden it has no group (no invisible
   sheet of frosted glass over the page), shown its group keeps the glass, so
   it looks the same before, during and after ─────────────────────────── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  const during = () => p.evaluate(async () => {
    const orig = document.startViewTransition.bind(document); let vt;
    document.startViewTransition = a => (vt = orig(a));
    window.vit.next(); await vt.ready;
    const r = {
      name: getComputedStyle(document.querySelector('.vt-bar')).viewTransitionName,
      group: document.getAnimations().some(a => /\(vt-bar\)/.test(a.effect.pseudoElement || '')) || !!getComputedStyle(document.documentElement, '::view-transition-group(vt-bar)').backdropFilter.match(/blur/),
      glass: getComputedStyle(document.documentElement, '::view-transition-group(vt-bar)').backdropFilter
    };
    await vt.finished; return r;
  });
  await p.waitForFunction(() => !document.querySelector('.vt-bar').classList.contains('is-shown'), null, { timeout: 6000 });   // auto-hide after 2.4 s
  const hidden = await during();
  await p.mouse.move(640, 360); await p.waitForTimeout(300);
  const shown = await during();
  console.log('toolbar    :', JSON.stringify({ hidden, shown }), '(hidden: name none; shown: vt-bar with blur(8px) on its group)');
  await p.close();
}

/* ── speaker view: iframes load the deck itself, hash addressing, vt:move-ready sync, works over file:// ── */
{
  const ctx = await b.newContext(VP);
  const p = await ctx.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  console.log('notes      :', JSON.stringify(await p.evaluate(() => ({
    count: document.querySelectorAll('.vt-group > .vt-note').length,
    inLayout: getComputedStyle(document.querySelector('.vt-note')).display,
  }))));
  const [w] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('s')]);
  watch(w); await w.waitForTimeout(1000);
  const inner = () => w.frames().filter(f => f !== w.mainFrame());
  for (const f of inner()) await f.evaluate(() => { window.__alive = 1; });   // a reload would wipe this
  const snap = async () => ({
    main: await p.evaluate(() => window.vit.index),
    popup: await w.evaluate(() => ({
      page: document.querySelector('header b').textContent,
      note: document.querySelector('.vt-notes').textContent.slice(0, 12),
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
  await p.evaluate(() => window.vit.go(window.vit.total - 1)); await p.waitForTimeout(1000);
  console.log('last page  :', JSON.stringify((await snap()).popup));
  await p.bringToFront(); await p.keyboard.press('s'); await p.waitForTimeout(200);
  console.log('press s again: windows', ctx.pages().length, '(only focuses, does not open another)');

  // the popup's own toolbar: pinned bottom-right, state refreshed with the main window; the preview copies have no toolbar
  await p.evaluate(() => window.vit.go(0)); await p.waitForTimeout(900);
  await w.evaluate(() => document.querySelector('.vt-bar button[aria-label^="Laser"]').click());   // laser clicked in the popup
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  console.log('popup toolbar:', JSON.stringify(await w.evaluate(() => {
    const bar = document.querySelector('.vt-bar'), r = bar.getBoundingClientRect();
    return {
      bottomRight: [innerWidth - r.right, innerHeight - r.bottom].map(Math.round).join(','),
      visible: getComputedStyle(bar).opacity, page: bar.querySelector('.vt-count').textContent,
      laser: bar.querySelector('button[aria-label^="Laser"]').getAttribute('aria-pressed')
    };
  })), 'main window:', JSON.stringify(await p.evaluate(() => ({
    page: document.querySelector('.vt-count').textContent, lasing: document.body.classList.contains('vt-lasing')
  }))),
    'toolbar in previews:', (await Promise.all(inner().map(f => f.evaluate(() => !!document.querySelector('.vt-bar'))))).join());
  // pointing at (25%, 50%) of the "current page" preview → the main window's dot lands at (25%, 50%) of the deck
  const at = await w.evaluate(() => {
    const q = document.querySelector('main iframe').getBoundingClientRect();
    return { x: q.left + q.width * .25, y: q.top + q.height * .5 };
  });
  await w.mouse.move(at.x, at.y);
  console.log('point on preview:', JSON.stringify(await p.evaluate(() => {
    const q = document.querySelector('.vt-deck').getBoundingClientRect(), l = document.querySelector('.vt-laser');
    return {
      dot: l.classList.contains('is-on'), position: l.style.transform,
      expected: 'translate(' + (q.left + q.width * .25) + 'px, ' + (q.top + q.height * .5) + 'px)'
    };
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
  const nowBox = await w.evaluate(() => {
    const q = document.querySelector('main iframe').getBoundingClientRect();
    return { l: q.left, t: q.top, w: q.width, h: q.height };
  });
  const idx = () => p.evaluate(() => window.vit.index);
  const seq = [await idx()];
  await w.mouse.click(nowBox.l + nowBox.w * .8, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .1, nowBox.t + nowBox.h * .5); await p.waitForTimeout(900); seq.push(await idx());
  await w.mouse.click(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h + 60); await p.waitForTimeout(900); seq.push(await idx());
  console.log('popup clicks: start → right → left third → notes =', seq.join(' → '));
  // the progress bar advances per frame; the wheel flips on the preview, not on the notes
  const prog = () => w.evaluate(() => document.querySelector('.prog i').style.width);
  const before = await prog();
  await w.mouse.move(nowBox.l + nowBox.w * .5, nowBox.t + nowBox.h * .5); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  const afterWheel = { page: await idx(), progress: await prog() };
  const noteBox = await w.evaluate(() => { const q = document.querySelector('.vt-notes').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await w.mouse.move(noteBox.x, noteBox.y); await w.mouse.wheel(0, 100); await p.waitForTimeout(400);
  console.log('popup wheel:', JSON.stringify({ progressBar: before, oneNotchOnPreview: afterWheel, pageAfterNotchOnNotes: await idx() }));
  await ctx.close();
}

/* ── wheel paging: one notch = one page with a mouse, one gesture (inertia included) = one page on a trackpad, nothing in the overview ── */
{
  const p = await b.newPage(VP); watch(p);
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  const idx = () => p.evaluate(() => window.vit.index);
  await p.mouse.move(640, 360);
  await p.mouse.wheel(0, 100); await p.waitForTimeout(350); await p.mouse.wheel(0, 100); await p.waitForTimeout(350);
  const two = await idx();
  await p.mouse.wheel(0, -100); await p.waitForTimeout(350);
  const back = await idx();
  /* One trackpad flick plus its inertia: many small deltas inside the runtime's
     300 ms swallow window. Sent from inside the page — 22 Playwright round trips
     take over a second, four times the window, so the harness would be measuring
     itself rather than the gesture. */
  await p.evaluate(async () => {
    const send = dy => document.dispatchEvent(new WheelEvent('wheel',
      { deltaY: dy, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 12; i++) { send(12); await wait(8); }
    for (let i = 0; i < 10; i++) { send(Math.max(1, 8 - i)); await wait(16); }
  });
  await p.waitForTimeout(600);
  const pad = await idx();
  await p.keyboard.press('o'); await p.waitForTimeout(900);
  await p.mouse.wheel(0, 100); await p.waitForTimeout(350);
  console.log('wheel      :', JSON.stringify({ twoNotches: two, oneBack: back, trackpadGestureWithInertia: pad, inOverview: await idx() }), '(expected 2 1 2 2)');
  await p.close();
}

console.log('errors:', errs.length ? errs : 'none');
await b.close();
