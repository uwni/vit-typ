# TODO

## A typst that no release carries yet

Since [typst#8832](https://github.com/typst/typst/pull/8832) (merged into typst
main on 2026-09-23, commit 7e9a95d) a position resolves inside an `html.frame`,
so vit knows where every marked region is without measuring anything in the
browser: the page records the region's two corners, the deck places an element
there, and `web/hoist.js` only moves the region's group into it. The measuring
pass, the `getScreenCTM` conventions and the idle sweep went with the
measuring.

The newest release is 0.15.1, where positions inside a frame are all zero, and
`typst.toml` still declares `compiler = "0.15.0"`. A version number cannot tell
the two apart (the main build also calls itself 0.15.1), so `deck` asks instead:
every page places a point in each of its two corners, and a compiler that
answers zero to the distance between them is refused by name. **Raise the
manifest the day a release carries the fix**, and drop the probe with it.

## What a deck costs Typst

Typst gives a document five layout passes to settle. A deck takes **two**, the
floor for any document that asks a question at all, and vit adds nothing to
what its content costs on its own: see **The introspection budget** in
`docs/internals.md` for the two facts about Typst's loop that decide this and
the four rules that follow from them. Every construct in the package has been
measured at two, and so has `tests/fixture.typ`; `examples/tutorial.typ` takes
three, which is theorion's proof by itself (its QED symbol is an inline
equation whose presence it reads from a state, and Typst's HTML export queries
every equation on every pass).

The way there is worth writing down, because the obvious design is wrong. When
positions inside a frame arrived, the first design drew every marked region a
second time, in an `html.frame` of its own beside the page. It cost a pass on
any region whose content reads the introspector — the copy could only be built
from a query, so it first existed on pass two, and read one pass stale from
then on — and it was wrong: a second layout is in the document a second time,
so a counter stepped inside a mark stepped twice, and a numbered heading inside
a mark made the next heading 2 in the browser and 1 on paper. Typst has no way
to lay content out without it being in the document; `measure` is the one
sandbox and it returns a size. So the region is laid out once, by the page, and
the browser moves the ink.

To measure a deck: `typst compile --features html --timings t.json deck.typ
out.html`, then count the `html document` spans in `t.json`; to see why,
`tools/typst-convergence-debug.patch`.

## What the layout's box is

- **A region's box is the layout's, not the ink's.** The old `hoist.js`
  measured `getBBox`, which is the ink without the stroke; the layout's box has
  the ascent and descent of a line in it. Every morph starts and ends on that
  box, so `fit` and `anchor` pin a slightly different corner than they used to,
  and a marked region lands a pixel or two from where it did.
- **A mark is hidden with `veil`, not `hide`.** Whether a region has arrived yet
  is something the deck has to be told, because Typst cannot be asked whether
  content is hidden. `reveal` and `anchor` say it; a bare `hide` does not, and
  leaves the page empty while the deck names an empty element that still
  morphs. That is the one way the PDF and the HTML can disagree, and it cannot
  be detected, only documented.

## Waiting on Typst: custom elements

`mark`, `slide`, `anchor`, `tween`, `waapi.animate` and `waapi.track` are
[`elembic`](https://typst.app/universe/package/elembic/) elements, and the host
protocol is an elembic style chain; see **Elements** in `docs/internals.md`.
Elembic is the prototype of the custom elements Typst is to grow, so the day
they land the change is mechanical: `e.element.declare` → the native
declaration, `e.set_` → `set`, `e.show_` → `show`, `e.get` → `context x.f`,
`e.query` → `query`, `e.fields(it)` → `it.f`. Two things go with it:

- **The rule nesting.** An elembic set rule is a show rule, so
  `#show: turning(…)` before page after page nests them and Typst stops at 64
  deep, around twenty. A native `set` nests nothing, and the note on `turning`
  can go.
- **The record's copy of the effect.** `_marks` reads a mark's effect from the
  record its display wrote, because that is where set rules have been applied.
  A native `query(mark)` answers with the resolved fields, and the record can
  go back to being geometry only.

What stays is what custom elements do not carry: the corners, the frame
markers, the labels in the SVG, the compiler probe.

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
