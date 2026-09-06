/* Hoisted regions per page, their geometry, and console errors.
   The geometry is in percentages, so it **must be identical across window
   sizes** — getCTM's target space differs between browsers, and a test that
   only runs at 1280×720 sits exactly where that bug is invisible. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(HERE, '..', 'examples', 'out', 'demo.html');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const SIZES = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
               { width: 900, height: 600 }, { width: 1440, height: 900 }];
/* the deck opens on the desk; everything here is about the page being presented */
const present = async p => {
  await p.evaluate(() => { window.vtslides.mode = 'present'; });
  for (const f of p.frames()) if (f !== p.mainFrame()) await f.waitForLoadState('load').catch(() => {});
};
const errs = [];
const seen = [];

for (const vp of SIZES) {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(400); await present(p);
  seen.push(await p.evaluate(() =>
    [...document.querySelectorAll('.vt-slide')].map(s =>
      [...s.querySelectorAll('.vt-mark')].map(m =>
        m.dataset.vtKey + ' ' +
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
console.log('resolution independence: ' + (drift.length
  ? '✗ ' + drift.map(d => d[0].width + 'x' + d[0].height).join(', ') + ' differ from 1280x720'
  : '✓ ' + SIZES.map(v => v.width + 'x' + v.height).join(' / ') + ' identical'));
/* ── one key across several pages: every transition must start where the
   previous one ended. That is the criterion for "continuous change": pairs are
   computed per transition (forward with the next frame, back with the
   previous), but as long as the geometry chains up, what you see is one object
   travelling. */
{
  const p = await b.newPage({ viewport: SIZES[0] });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(400); await present(p);
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
      const during = document.querySelectorAll('.vt-mark').length;
      /* only fast-forward the transition (pseudo-element animations); the continuous slide(anim:) animations loop forever and finish() would throw */
      document.getAnimations().forEach(a => { if (a.effect && a.effect.pseudoElement) a.finish(); });
      await new Promise(r => setTimeout(r, 200));
      return {
        marks: out,
        cloned: during - rest,
        clean: document.querySelectorAll('.vt-mark').length === rest,
        unique: [...document.querySelectorAll('.vt-slide')].every(sl => {
          const n = [...sl.querySelectorAll('.vt-mark')].map(m => m.style.viewTransitionName).filter(Boolean);   // a mark no transition has named yet has none
          return n.length === new Set(n).size;      // uniqueness is only required among elements rendered **together**
        }),
      };
    }, i));
  }
  await p.close();

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
    /* a key absent from this transition — on neither page, or an unpaired mark
       folded into root (its name is `none` for the duration, so no pseudo-element
       carries it) — also restarts its chain */
    last = next;
    prevCloned = st.cloned > 0;
  });
  const longest = Object.keys(runs).sort((a, b) => runs[b] - runs[a])[0];
  console.log('continuity: ' + (breaks.length ? '✗ ' + breaks.join('; ')
    : '✓ every transition starts where the previous one ended' +
      (longest ? ' (longest chain: m-' + longest + ', ' + runs[longest] + ' transitions)' : '') +
      (skipped ? '; skipped ' + skipped + ' transitions with count changes' : '')));
}

console.log('errors:', errs.length ? errs : 'none');
await b.close();
