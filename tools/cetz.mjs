/* the cetz layer against several CeTZ versions.

   tools/cetz.typ is two pages per case: the canvas drawn with plain
   CeTZ, then the same canvas drawn with states. The claim is that the pair is
   pixel-identical, so the test is a compare with no fuzz at all — an element
   that lands a hair off shows up here as a few hundred pixels.

     node tools/cetz.mjs              the versions in `tested`, newest patch of each
     node tools/cetz.mjs 0.4.1 0.5.2  the ones named

   Needs poppler (pdftoppm) and ImageMagick (magick compare), like verify.mjs.  */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PKG = join(ROOT, 'packages', 'tween', 'compat');   // where `tested` is declared
const TEST = join(HERE, 'cetz.typ');
const src = readFileSync(TEST, 'utf8');

/* the cases, by the comment that heads each one, so the output reads like the file */
const cases = [...src.matchAll(/^\/\/ ── (\d+)\. (.+?) ─+$/gm)].map(m => m[2].trim());

/* which versions: the ones named on the command line, else `tested` from the
   package, resolved against what is actually installed — a minor is a range,
   and the newest patch of it is the one worth checking. */
const CACHE = [join(homedir(), 'Library', 'Caches', 'typst'), join(homedir(), '.cache', 'typst'),
process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'typst')]
  .filter(Boolean).map(d => join(d, 'packages', 'preview', 'cetz')).find(existsSync);

const installed = CACHE ? readdirSync(CACHE).filter(v => /^\d+\.\d+\.\d+$/.test(v)) : [];
const newest = minor => installed
  .filter(v => v.startsWith('0.' + minor + '.'))
  .sort((a, b) => +a.split('.')[2] - +b.split('.')[2]).pop();

const versions = process.argv.slice(2).length ? process.argv.slice(2) : (() => {
  const lib = readFileSync(join(PKG, 'cetz.typ'), 'utf8');
  const tested = (lib.match(/#let tested = \(([^)]*)\)/) || [, ''])[1]
    .split(',').map(s => s.trim()).filter(Boolean);
  return tested.map(m => newest(m) || `0.${m}.0`);
})();

const tmp = mkdtempSync(join(tmpdir(), 'tween-cetz-'));
let bad = 0;

for (const version of versions) {
  /* the import has to be rewritten in place: test.typ imports lib.typ beside it,
     so the copy under test has to live in the package too */
  const copy = join(HERE, `.cetz-${version}.typ`);
  const pdf = join(tmp, `${version}.pdf`);
  try {
    writeFileSync(copy, src.replace(/@preview\/cetz:\d+\.\d+\.\d+/g, `@preview/cetz:${version}`));
    try {
      execFileSync('typst', ['compile', '--root', ROOT, copy, pdf], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      console.log(`cetz ${version}: ✗ does not compile\n${String(e.stderr).trim().split('\n').slice(0, 6).map(l => '   ' + l).join('\n')}`);
      bad++;
      continue;
    }
    execFileSync('pdftoppm', ['-png', '-r', '150', pdf, join(tmp, version)]);
    const pages = readdirSync(tmp).filter(f => f.startsWith(version + '-')).sort();
    console.log(`cetz ${version}:`);
    for (let i = 0; i < pages.length / 2; i++) {
      const [a, b] = [pages[2 * i], pages[2 * i + 1]].map(f => join(tmp, f));
      let ae = 'n/a';
      try {
        execFileSync('magick', ['compare', '-metric', 'AE', a, b, 'null:'], { stdio: ['ignore', 'ignore', 'pipe'] });
        ae = '0';
      } catch (e) { ae = String(e.stderr).trim().split(' ')[0]; }
      const ok = ae === '0';
      if (!ok) bad++;
      console.log(`   ${ok ? '✓' : '✗'} ${cases[i] ?? 'case ' + (i + 1)}${ok ? '' : `  —  ${ae} pixels differ (${a}, ${b})`}`);
    }
  } finally {
    rmSync(copy, { force: true });
  }
}

if (!bad) rmSync(tmp, { recursive: true, force: true });
console.log(bad
  ? `\n${bad} failure${bad > 1 ? 's' : ''}; the renders are in ${tmp}`
  : `\npixel-identical on ${versions.join(', ')}`);
process.exit(bad ? 1 : 0);
