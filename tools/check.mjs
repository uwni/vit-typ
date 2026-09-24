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
   that size rather than a resized one. */
const present = async vp => {
  await p.send('Emulation.setDeviceMetricsOverride',
    { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
  await p.goto(url, '.vit-deck[data-ready]');
  await p.evaluate("window.vit.mode = 'present'; return 1;");
  await sleep(400);
};

/* Every region is in the document from the moment it is parsed, placed by the
   Typst side, so there is nothing to wait for beyond the deck being ready. */
const seen = [];

for (const vp of SIZES) {
  await present(vp);
  seen.push(await p.evaluate(`
    return [...document.querySelectorAll('.vit-slide')].map(s =>
      [...s.querySelectorAll('.vit-mark')].map(m => {
        /* a declaration's host has no key of its own; it is named by its tag */
        const name = m.dataset.vitKey ?? m.tagName.toLowerCase();
        const page = m.closest('.vit-page').getBoundingClientRect();
        const r = m.getBoundingClientRect();
        if (!page.width) return name + ' off stage';
        return name + ' ' + [(r.left - page.left) / page.width, (r.top - page.top) / page.height]
          .map(v => (v * 100).toFixed(2)).join(' ');
      }));`));
}

seen[0].forEach((marks, i) => {
  console.log('slide ' + (i + 1) + ':');
  marks.forEach(m => console.log('   ' + m));
});

const ref = JSON.stringify(seen[0]);
const drift = SIZES.map((vp, k) => [vp, JSON.stringify(seen[k]) === ref]).filter(x => !x[1]);
console.log('resolution independence: ' + (drift.length
  ? '✗ ' + drift.map(d => d[0].width + 'x' + d[0].height).join(', ') + ' differ from 1280x720'
  : '✓ ' + SIZES.map(v => v.width + 'x' + v.height).join(' / ') + ' identical'));
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
