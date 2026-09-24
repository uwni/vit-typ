# TODO

## Compile-time placement, and what it costs

Since [typst#8832](https://github.com/typst/typst/pull/8832) (merged into typst
main on 2026-09-23, commit 7e9a95d) a position resolves inside an `html.frame`,
so vit places every marked region itself: the page keeps the space and loses the
ink, and the region is drawn again in a frame of its own, placed where the
layout put it. `hoist.js` is gone, and with it the measuring pass, the
`getScreenCTM` conventions and the idle sweep.

It is not in a release yet. The newest release is 0.15.1, where positions inside
a frame are all zero, and `typst.toml` still declares `compiler = "0.15.0"`.
A version number cannot tell the two apart (the main build also calls itself
0.15.1), so `deck` asks instead: every page places a point in each of its two
corners, and a compiler that answers zero to the distance between them is
refused by name. The manifest should be raised the day a release carries the
fix.

What the change costs, and what is worth knowing before touching it:

- **A marked region is laid out twice**: once in the page, hidden, which is what
  gives its corner and its size, and once in its own frame, which is what is
  drawn. That is what lets a mark hold content written to fill its container
  (`width: 100%`), because `measure` reports 0pt for such content and only the
  page's own layout knows the answer.
- **Two layouts mean two readings.** Anything inside a mark that counts or
  measures itself is asked twice, and the second answer comes from a pass that
  the first pass's output changed, so the document can chase itself. vit's own
  records no longer do this: which frame a record belongs to is where it falls
  between the frames' markers, not a counter it read, and with that removed the
  fixture settles. What is left is other packages' doing. The tutorial still
  reports `document did not converge within five attempts`, from fletcher's and
  cetz's own `measure` and from the equation counter inside marked regions.
  Those readings are one introspection round stale. The PDF is unaffected (it
  lays nothing out twice), and the HTML is right in this deck, but a deck that
  numbers or queries something inside a mark should not be assumed to be.
  Removing the second layout is the real fix and is its own piece of work: the
  page's layout cannot be the one to go, because it is the only one that knows
  what container-relative content comes to.
- **A region's box is the layout's, not the ink's.** `hoist.js` measured
  `getBBox`, which is the ink without the stroke; the layout's box has the
  ascent and descent of a line in it. Every morph starts and ends on that box,
  so `fit` and `anchor` pin a slightly different corner than they used to, and
  a marked region lands a pixel or two from where it did.
- **Nothing may be placed inside a placed region.** A frame does not nest, so
  the deck emits every region as a sibling of the page's own drawing and
  positions it with CSS. `waapi.animate` inside a mark has nowhere to go: the
  copy that keeps the space is told to stay quiet and the copy that is drawn is
  inside the frame, so neither can declare it. It is refused at compile time,
  by the assert in tween's `declared`.
- **A mark is hidden with `veil`, not `hide`.** Whether a region has arrived yet
  is something the deck has to be told, because Typst cannot be asked whether
  content is hidden. `reveal` and `anchor` say it; a bare `hide` does not, and
  leaves the page empty while the deck draws the region anyway. That is the one
  way the PDF and the HTML can disagree, and it cannot be detected, only
  documented.

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
