/* paths.js under Node: align() on a table of computed d values, each case the
   two (or three) inputs and what they must become. Every branch of merge()
   has a case: spellings (H/V against L, S against C, T against Q), a line
   against a curve (promotion, elevation), the empty subpath, the zero-length
   padding at Z / M / the end, and what cannot be aligned (an arc, a subpath
   count). Run: node tools/paths.mjs */
import { readFileSync } from 'node:fs';
const P = new Function(readFileSync(new URL('../paths.js', import.meta.url), 'utf8') + '; return vtPaths;')();
const d = s => 'path("' + s + '")';

const CASES = [
  ['same letters: untouched', [d('M 0 0 L 10 10'), d('M 0 0 L 20 5')], [d('M 0 0 L 10 10'), d('M 0 0 L 20 5')]],
  ['H against L: both L', [d('M 0 0 H 10'), d('M 0 0 L 10 5')], [d('M 0 0 L 10 0'), d('M 0 0 L 10 5')]],
  ['V against L: both L', [d('M 1 2 V 10'), d('M 1 2 L 3 4')], [d('M 1 2 L 1 10'), d('M 1 2 L 3 4')]],
  ['H against V: both L', [d('M 0 0 H 10'), d('M 0 0 V 10')], [d('M 0 0 L 10 0'), d('M 0 0 L 0 10')]],
  ['L against Q: the line as a quadratic with its control point at the middle', [d('M 0 0 L 10 20'), d('M 0 0 Q 1 1 10 20')], [d('M 0 0 Q 5 10 10 20'), d('M 0 0 Q 1 1 10 20')]],
  ['L against C: the line as a cubic with control points at a third and two thirds', [d('M 0 0 L 30 60'), d('M 0 0 C 1 1 2 2 30 60')], [d('M 0 0 C 10 20 20 40 30 60'), d('M 0 0 C 1 1 2 2 30 60')]],
  ['Q against C: the quadratic elevated', [d('M 0 0 Q 30 0 30 30'), d('M 0 0 C 1 1 2 2 30 30')], [d('M 0 0 C 20 0 30 10 30 30'), d('M 0 0 C 1 1 2 2 30 30')]],
  ['S against C: S written out with the reflected control point', [d('M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0'), d('M 0 0 C 0 10 10 10 10 0 C 1 1 2 2 20 0')], [d('M 0 0 C 0 10 10 10 10 0 C 10 -10 20 -10 20 0'), d('M 0 0 C 0 10 10 10 10 0 C 1 1 2 2 20 0')]],
  ['S after a non-cubic: the reflection is the current point', [d('M 0 0 L 10 0 S 20 10 20 0'), d('M 0 0 L 10 0 C 1 1 2 2 20 0')], [d('M 0 0 L 10 0 C 10 0 20 10 20 0'), d('M 0 0 L 10 0 C 1 1 2 2 20 0')]],
  ['T against Q: T written out with the reflected control point', [d('M 0 0 Q 5 10 10 0 T 20 0'), d('M 0 0 Q 5 10 10 0 Q 1 1 20 0')], [d('M 0 0 Q 5 10 10 0 Q 15 -10 20 0'), d('M 0 0 Q 5 10 10 0 Q 1 1 20 0')]],
  ['T against L: the line as a quadratic, T written out', [d('M 0 0 Q 5 10 10 0 T 20 0'), d('M 0 0 Q 5 10 10 0 L 20 0')], [d('M 0 0 Q 5 10 10 0 Q 15 -10 20 0'), d('M 0 0 Q 5 10 10 0 Q 15 0 20 0')]],
  ['an empty subpath (typst-svg\'s M 0 0) dropped where the other side has none', [d('M 0 0 M 5 5 L 6 6'), d('M 5 5 L 7 7')], [d('M 5 5 L 6 6'), d('M 5 5 L 7 7')]],
  ['empty subpaths on both sides stay', [d('M 0 0 M 5 5 L 6 6'), d('M 0 0 M 5 5 L 7 7')], [d('M 0 0 M 5 5 L 6 6'), d('M 0 0 M 5 5 L 7 7')]],
  ['a segment more at the end: a zero-length copy at the other\'s current point', [d('M 0 0 L 1 1 L 2 2'), d('M 0 0 L 3 3')], [d('M 0 0 L 1 1 L 2 2'), d('M 0 0 L 3 3 L 3 3')]],
  ['a segment more before Z: padded before the close', [d('M 0 0 L 4 0 L 4 4 L 0 4 Z'), d('M 0 0 L 4 0 L 4 4 Z')], [d('M 0 0 L 4 0 L 4 4 L 0 4 Z'), d('M 0 0 L 4 0 L 4 4 L 4 4 Z')]],
  ['a segment more before the next subpath', [d('M 0 0 L 1 1 L 2 2 M 9 9 L 8 8'), d('M 0 0 L 1 1 M 9 9 L 8 8')], [d('M 0 0 L 1 1 L 2 2 M 9 9 L 8 8'), d('M 0 0 L 1 1 L 1 1 M 9 9 L 8 8')]],
  ['a curve more: the padding is a zero-length curve', [d('M 0 0 C 1 1 2 2 3 3 C 4 4 5 5 6 6'), d('M 0 0 C 1 1 2 2 3 3')], [d('M 0 0 C 1 1 2 2 3 3 C 4 4 5 5 6 6'), d('M 0 0 C 1 1 2 2 3 3 C 3 3 3 3 3 3')]],
  ['three states: the first absorbs, then all follow', [d('M 0 0 L 1 1'), d('M 0 0 H 1'), d('M 0 0 Q 1 1 2 2')], [d('M 0 0 Q 0.5 0.5 1 1'), d('M 0 0 Q 0.5 0 1 0'), d('M 0 0 Q 1 1 2 2')]],
  ['an arc against a line cannot be aligned', [d('M 0 0 A 5 5 0 0 1 10 0'), d('M 0 0 L 10 0')], null],
  ['a subpath count that differs cannot be aligned', [d('M 0 0 L 1 1 M 5 5 L 6 6'), d('M 0 0 L 1 1')], null],
  ['a value outside the grammar leaves every value as it is', [d('M 0 0 L 1 1'), 'none'], [d('M 0 0 L 1 1'), 'none']],
];

let bad = 0;
for (const [name, input, want] of CASES) {
  const got = P.align(input);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
}
console.log(bad ? bad + ' of ' + CASES.length + ' failed' : 'all ' + CASES.length + ' passed');
process.exit(bad ? 1 : 0);
