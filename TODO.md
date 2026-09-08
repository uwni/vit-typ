# TODO

## Waiting on typst#8832 — positions inside `html.frame`

[typst#8828](https://github.com/typst/typst/issues/8828): inside an
`html.frame`, `location.position()` and `here().position()` return
`(page: 1, x: 0pt, y: 0pt)` for everything. Sizes are fine — `measure` answers
inside a frame — only positions are missing.
[typst#8832](https://github.com/typst/typst/pull/8832) fixes it and is open;
check whether it has landed in the Typst you have.

Two things in this repo are shaped around that gap and can be undone when it
lands. Neither is a nicety: both cost either runtime work or an argument the
author should not have to supply.

**1. Hoisting could move to compile time, and `hoist.js` could go.**
`hoist.js` lifts each marked region out of the page SVG into its own
HTML-level `<svg>`, because an element only behaves like a CSS box when it is
one: View Transitions ignore `view-transition-name` on SVG children, and Web
Animations keyframes are CSS — `backgroundColor`, `borderRadius`, `boxShadow`
and `width` compute on an SVG `<g>` and paint nothing, percentages and the
transform origin resolve against the viewBox, and the group's own transform is
its placement, which a `transform` keyframe replaces. Lifting has to lay a
frame out to measure it, which is why it happens one frame at a time when the
runtime asks, and why there is an idle sweep to hide the cost.

With positions, `vit`'s Typst side can emit each such region as its own
`html.frame`, placed from the layout — no measuring pass, no `getScreenCTM`
conventions to work around, no sweep. What to check when doing it: that the
PDF is untouched (this is an HTML-target restructuring only), that the placed
frames land within a fraction of a pixel at several window sizes
(`tools/check.mjs` compares hoisted geometry), and what it does to the HTML's
size — many small frames may stop sharing one `<defs>` of glyph symbols, and
the tutorial is 12 MB today.

**2. `layers(meet:)` could derive its corner.** `meet` names the corner the
arriving layer does not push, and it has to be given by hand only because
aligning layers by the point they share needs that point's position in each.
See the doc comment on `layers` in `lib.typ`.

## What to delete when it lands

`grep -rn 8832 .` finds every site. Two files:

- **`hoist.js` — the whole file.** It lifts each marked region out of the page
  SVG into an HTML-level `<svg>`, and (the `declared()` function and its two
  marked call sites) gives the same box to the elements waapi declared but did
  not start. With positions the Typst side emits those regions as frames
  itself, so nothing is measured or moved at run time: `runtime.js`'s `lift`,
  `unlifted`, `sweep` and the `vitLifted` flag go with it, and `deck.css`'s
  `.vit-mark` rules become the rules for whatever vit emits instead.
- **`packages/tween/waapi.js` — the inert branch of `<waapi-anim>`.** A
  declaration that names its target by an ordinal is left for a host to start.
  A host that can place a frame puts the declaration on an element of its own,
  so the pointer form has no users and both it and this branch go — in
  `waapi.typ` too, where `declared()` chooses between the two forms.
- **`lib.typ`, `layers(meet:)`** — derive the corner; keep the argument as an
  override and drop the assertion that demands it.

What is **not** waiting on the PR, and should not be deleted with it:

- `waapi`'s `origin` argument and the window `resize` that re-fits. A followed
  path is `offset-path: path(…)`, a static string of pixels, so it has to be
  re-sampled whenever the layout moves and measured from something. That is
  true of any box, whoever makes it.
- Re-fitting when a frame goes on stage, for the same reason: a thumbnail and a
  presented frame are different sizes.
