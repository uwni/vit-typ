/* Placed regions per page, their geometry, and console errors.
   The geometry is written by the Typst side as percentages of the page, so
   where the browser puts a region **must be the same fraction of the page at
   every window size**: a region that drifts with the window is a region being
   positioned by something other than the layout. What is compared is the
   rendered box, not the attribute: the attribute is a compile-time constant
   and comparing it across windows compares it with itself.

   Driven by tests/cdp.mjs, the same one-file driver the invariants and
   verify.mjs use: one browser, resized through the protocol, rather than a
   second browser package with a path written down in here.
     node tools/check.mjs        (needs examples/tutorial.html compiled)        */
import { open } from '../tests/cdp.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'tutorial.html');

const SIZES = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
{ width: 900, height: 600 }, { width: 1440, height: 900 }];

const p = await open({ width: SIZES[0].width, height: SIZES[0].height, port: 9412 });
const sleep = ms => p.evaluate(`await new Promise(r => setTimeout(r, ${ms})); return 1;`);

/* The deck opens on the desk; everything here is about the page being
   presented. `.vit-deck[data-ready]` is a wait and not a timeout. The viewport
   is set before the load, so each size gets the deck as it lays itself out at
   that size rather than a resized one. `__done` is the move having finished:
   a frame in the middle of a view transition is out of the live rendering and
   measures as nothing. */
const present = async vp => {
  await p.send('Emulation.setDeviceMetricsOverride',
    { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
  await p.goto(url, '.vit-deck[data-ready]');
  await p.evaluate(`
    window.__done = fn => new Promise(r => {
      const deck = document.querySelector('.vit-deck');
      let done = false;
      const ok = () => { if (done) return; done = true; deck.removeEventListener('vit:move-done', ok); r(); };
      deck.addEventListener('vit:move-done', ok); fn(); setTimeout(ok, 4000);
    });
    window.vit.mode = 'present';
    return 1;`);
  await sleep(400);
};

/* Only the frame on stage has a size, so the deck is walked. What is read is
   the rendered box against the page's own box: reading the percentage back out
   of the element would compare a compile-time constant with itself. A
   declaration's host is listed but not compared — an element running along a
   path is put on the path by the runtime, which writes its own left and top. */
const geometry = () => p.evaluate(`
  const rows = [];
  for (let k = 0; k < window.vit.total; k++) {
    if (window.vit.index !== k) await window.__done(() => window.vit.go(k));
    await new Promise(r => setTimeout(r, 60));
    const pg = document.querySelector('.vit-slide.is-active .vit-page');
    const box = pg?.getBoundingClientRect();
    if (!box?.width) { rows.push({ frame: k, marks: null }); continue; }
    rows.push({ frame: k, marks: [...pg.querySelectorAll(':scope > .vit-mark')].map(m => {
      const r = m.getBoundingClientRect();
      return {
        key: m.dataset.vitKey ?? null,
        tag: m.tagName.toLowerCase(),
        x: (r.left - box.left) / box.width * 100,
        y: (r.top - box.top) / box.height * 100,
      };
    }) });
  }
  return rows;`);

const seen = [];
for (const vp of SIZES) { await present(vp); seen.push(await geometry()); }

const at = m => m.x.toFixed(2) + ' ' + m.y.toFixed(2);
for (const row of seen[0]) {
  console.log('frame ' + (row.frame + 1) + ':' + (row.marks ? '' : ' not on stage'));
  for (const m of row.marks ?? []) console.log('   ' + (m.key ?? m.tag + ' (runtime-placed)') + ' ' + at(m));
}

/* The box is snapped to whole pixels before it is reported, so the same
   fraction reads a hair differently at each width; a region positioned by
   something other than the layout misses by percentage points, not by this. */
const TOLERANCE = 0.2;
const drift = [];
for (let k = 1; k < SIZES.length; k++) {
  let worst = 0, how = '';
  for (let f = 0; f < seen[0].length; f++) {
    const a = seen[0][f].marks, b = seen[k][f]?.marks;
    if (!a || !b || a.length !== b.length) { worst = Infinity; how = 'frame ' + (f + 1) + ' has a different set of regions'; break; }
    for (let i = 0; i < a.length; i++) {
      if (a[i].key == null) continue;                       // the runtime placed it
      const d = Math.max(Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y));
      if (d > worst) { worst = d; how = a[i].key + ' on frame ' + (f + 1) + ' by ' + d.toFixed(3) + 'pp'; }
    }
  }
  if (worst > TOLERANCE) drift.push(SIZES[k].width + 'x' + SIZES[k].height + ': ' + how);
}
console.log('resolution independence: ' + (drift.length
  ? '✗ ' + drift.join('; ')
  : '✓ ' + SIZES.map(v => v.width + 'x' + v.height).join(' / ') + ' agree to within ' + TOLERANCE + 'pp'));
/* ── one key across several pages: every transition must start where the
   previous one ended. That is the criterion for "continuous change": pairs are
   computed per transition (forward with the next frame, back with the
   previous), but as long as the geometry chains up, what you see is one object
   travelling. */
{
  await present(SIZES[0]);
  const total = await p.evaluate('return window.vit.total;');
  const steps = [];
  for (let i = 1; i < total; i++) {
    await p.evaluate(`window.vit.go(${i - 1}); return 1;`);
    await sleep(760);
    /* String.raw, so that the backslashes in the regexes below reach the page
       as they are written: an ordinary template literal eats them. */
    steps.push(await p.evaluate(String.raw`
      const rest = document.querySelectorAll('.vit-mark').length;
      const orig = document.startViewTransition.bind(document); let vit;
      document.startViewTransition = a => (vit = orig(a));
      window.vit.go(${i}); await vit.ready;
      const seen = {};
      document.getAnimations().forEach(a => {
        const pe = a.effect && a.effect.pseudoElement; if (!pe) return;
        const m = /^::view-transition-(old|new|group)\(m-(.+)\)$/.exec(pe);
        if (m) (seen[m[2]] = seen[m[2]] || {})[m[1]] = a;
      });
      const out = {};
      Object.keys(seen).forEach(k => {
        const s = seen[k];
        if (!s.old || !s.new) { out[k] = s.old ? 'leaves' : 'enters'; return; }
        const kf = s.group && s.group.effect.getKeyframes();
        if (!kf || kf.length < 2) { out[k] = 'paired'; return; }
        /* the width/height strings at the two ends differ in precision
           (27.5312px vs 27.531px); normalise before comparing or the chain
           breaks spuriously */
        const num = v => Math.round(parseFloat(v) * 100) / 100;
        const box = f => num(f.width) + 'x' + num(f.height) + ' @' +
          (f.transform || '').replace(/matrix\(|\)/g, '').split(',').slice(4)
            .map(v => Math.round(+v)).join(',');
        out[k] = [box(kf[0]), box(kf[kf.length - 1])];
      });
      const during = document.querySelectorAll('.vit-mark').length;
      /* only fast-forward the transition (pseudo-element animations); the continuous slide(anim:) animations loop forever and finish() would throw */
      document.getAnimations().forEach(a => { if (a.effect && a.effect.pseudoElement) a.finish(); });
      await new Promise(r => setTimeout(r, 200));
      return {
        marks: out,
        cloned: during - rest,
        clean: document.querySelectorAll('.vit-mark').length === rest,
        unique: [...document.querySelectorAll('.vit-slide')].every(sl => {
          const n = [...sl.querySelectorAll('.vit-mark')].map(m => m.style.viewTransitionName).filter(Boolean);   // a mark no transition has named yet has none
          return n.length === new Set(n).size;      // uniqueness is only required among elements rendered **together**
        }),
      };`));
  }

  const dirty = steps.map((s, i) => (!s.clean || !s.unique) ? (i + 1) + '→' + (i + 2) : null).filter(Boolean);
  const cloned = steps.map((s, i) => s.cloned ? (i + 1) + '→' + (i + 2) + ' cloned ' + s.cloned : null).filter(Boolean);
  console.log('split/merge: ' + (cloned.length ? cloned.join(', ') : 'no count changes in this deck'));
  console.log('clone clean-up: ' + (dirty.length ? '✗ not clean or duplicate names after ' + dirty.join(', ') : '✓ every transition returns to rest with unique names per page'));

  /* In a transition that changes the count, names are reassigned by position
     (`m-cell-2` is a clone this time and the second real element next time), so
     the name is not an identity across transitions and the chain rightly breaks
     there. Exclude both sides of such a transition; the rest must chain strictly. */
  const breaks = [], runs = {};
  let last = {}, prevCloned = false, skipped = 0;
  steps.forEach((st, i) => {
    const cut = st.cloned > 0 || prevCloned;
    if (cut) skipped++;
    const next = {};
    Object.keys(st.marks).forEach(k => {
      const v = st.marks[k];
      if (!Array.isArray(v)) return;           // enters / leaves: the chain restarts
      if (!cut && last[k] !== undefined) {
        if (last[k] !== v[0]) breaks.push('m-' + k + ' breaks at ' + (i + 1) + '→' + (i + 2));
        else runs[k] = (runs[k] || 1) + 1;
      }
      if (!cut) next[k] = v[1];
    });
    /* a key absent from this transition also restarts its chain: one on neither
       page, or an unpaired mark folded into root (its name is `none` for the
       duration, so no pseudo-element carries it) */
    last = next;
    prevCloned = st.cloned > 0;
  });
  const longest = Object.keys(runs).sort((a, b) => runs[b] - runs[a])[0];
  console.log('continuity: ' + (breaks.length ? '✗ ' + breaks.join('; ')
    : '✓ every transition starts where the previous one ended' +
    (longest ? ' (longest chain: m-' + longest + ', ' + runs[longest] + ' transitions)' : '') +
    (skipped ? '; skipped ' + skipped + ' transitions with count changes' : '')));
}

console.log('errors:', p.errors.length ? p.errors : 'none');
p.close();
