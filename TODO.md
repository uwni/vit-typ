# TODO

## Waiting on typst#8832: positions inside `html.frame`

[typst#8828](https://github.com/typst/typst/issues/8828): inside an
`html.frame`, `location.position()` and `here().position()` return
`(page: 1, x: 0pt, y: 0pt)` for everything. Sizes work (`measure` answers
inside a frame); only positions are missing.
[typst#8832](https://github.com/typst/typst/pull/8832) fixes it and is still
open. Check whether it has landed in your Typst version.

Two things in this repo work around that gap and can be removed when it lands.
Both are worth removing: one costs runtime work, the other asks the author for
an argument they should not have to give.

**1. Hoisting could move to compile time, and `hoist.js` could go.**
`hoist.js` lifts each marked region out of the page SVG into its own
HTML-level `<svg>`, because an element only behaves like a CSS box when it is
one. View Transitions ignore `view-transition-name` on SVG children. Web
Animations keyframes are CSS: `backgroundColor`, `borderRadius`, `boxShadow`
and `width` compute on an SVG `<g>` but paint nothing, percentages and the
transform origin resolve against the viewBox, and the group's own transform is
its placement, which a `transform` keyframe replaces. Lifting has to lay a
frame out to measure it, so it happens one frame at a time when the runtime
asks, with an idle sweep to spread out the cost.

With positions, vit's Typst side can emit each such region as its own
`html.frame`, placed from the layout. That removes the measuring pass, the
`getScreenCTM` workarounds and the sweep. When doing it, check that:

- the PDF is unchanged (this only restructures the HTML output);
- the placed frames land within a fraction of a pixel at several window sizes
  (`tools/check.mjs` compares hoisted geometry);
- the HTML does not grow too much. Many small frames may stop sharing one
  `<defs>` of glyph symbols, and the tutorial is already 12 MB.

**2. `layers(meet:)` could derive its corner.** `meet` names the corner the
arriving layer does not push. It has to be given by hand only because aligning
layers by the point they share needs that point's position in each. See the doc
comment on `layers` in `lib.typ`.

## What to delete when it lands

`grep -rn 8832 .` finds every site:

- **All of `hoist.js`.** It lifts each marked region out of the page SVG into
  an HTML-level `<svg>`, and (in `declared()` and its two marked call sites)
  gives the same box to the elements waapi declared but did not start. With
  positions, the Typst side emits those regions as frames itself, so nothing is
  measured or moved at run time. `runtime.js`'s `lift`, `unlifted`, `sweep` and
  the `vitLifted` flag go with it, and the `.vit-mark` rules in `web/deck.css`
  become the rules for whatever vit emits instead.
- **The inert branch of `<waapi-anim>` in `packages/tween/waapi.js`.** A
  declaration that names its target by an ordinal is left for a host to start.
  A host that can place a frame puts the declaration on an element of its own,
  so the pointer form has no users. Remove it and this branch, including in
  `waapi.typ`, where `declared()` chooses between the two forms.
- **`layers(meet:)` in `lib.typ`.** Derive the corner, keep the argument as an
  override, and drop the assertion that requires it.

These do **not** depend on the PR and should stay:

- `waapi`'s `origin` argument and the window `resize` handler that re-fits. A
  followed path is `offset-path: path(…)`, a static string of pixels, so it has
  to be re-sampled whenever the layout moves, and measured from something. That
  holds for any box, whoever creates it.
- Re-fitting when a frame goes on stage, for the same reason: a thumbnail and a
  presented frame are different sizes.

## Waiting on browsers: the empty frame during a capture

A view transition captures the old state, runs the update, then captures the
new state. In the frame between the two captures, a captured element is out of
the live rendering and its snapshot is not ready yet. When root is captured
too, that frame is never painted and the screen keeps showing the previous one.
`boxed` leaves root out so that the rail beside the page stays clickable, but
then the rest of the page keeps painting and the deck's box shows as a hole.

`.vit-plate` fills the hole with the page itself: a `<use>` of the drawing the
deck holds, at the deck's size, placed under it (`chrome/desk.typ`,
`web/deck.css`, and `point(plate, cur)` in `render()`). It renders nothing
twice and costs nothing to measure, but it only exists to cover one frame of
one browser behaviour.

**It can be removed once browsers stop painting that frame**, that is, once the
box is never empty between the two captures. To check: remove `.vit-plate`,
turn pages at the desk, and watch the page's box for a flash of the desk behind
it (`240` of 255 against the page's `42`, measured on the tutorial).
