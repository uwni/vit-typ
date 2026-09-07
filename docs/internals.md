# How vit works

Implementation notes. For using the package see the [README](../README.md); for
the API reference, `docs/api.pdf`.

## How it works

**Identity is a label.** `mark(key)` attaches the Typst label `vt-key` to a box
around the content. Typst's SVG export writes a label as a `<g
data-typst-label>` _wrapping_ the content, so the subtree is the boundary —
nothing is inferred from geometry. The box is what makes that possible at all:
of everything that can stand in a paragraph, only `box` and `block` carry a
label into the SVG. A label on a `rect`, a `circle`, a cetz canvas, an equation,
`emph` or bare text produces no group, and the mark would silently not exist;
`block` is block-level and breakable, which rules it out for a term inside a
formula or a word inside a sentence. A box wraps its content like ordinary text
but is atomic, so a mark wider than the rest of the line takes a line of its own
— marking a word, a title or a figure is free, marking a whole sentence
mid-paragraph is not. On the PDF side a label costs nothing, so no code is gated
by backend. The label is identity and nothing else: what a mark declares about
itself (`transition:`) is collected by `query` on the Typst side and written
into the HTML as a table by key (`const vtMarks = {…}`), which the runtime looks
up.

**Hoist.** `view-transition-name` is silently ignored on SVG children (only
elements in the CSS box tree are captured), so `hoist.js` lifts each frame's
marks — on `load`, after the browser's own first layout, since measuring forces
one — and one frame at a time, when the runtime asks (both sides of a
transition before it starts, the rest while the deck is idle). Lifting
measures each marked `<g>` in the page's viewBox (`getBBox` × CTM, read as a
ratio of two `getScreenCTM`s so the result is resolution-independent), creates
an absolutely positioned `<svg>` host with that viewBox and a
`view-transition-name`, and moves the `<g>` into it. Glyphs stay in the page's
`<defs>` and are referenced with `<use>`; nothing is copied. Everything is
measured before anything is moved, so nested marks stay correct.

**Pairing is the browser's.** On every page turn the runtime calls
`document.startViewTransition({ update, types })`; the browser pairs
`::view-transition-old(name)` and `::view-transition-new(name)` by string
equality and interpolates the box. There is no diff, no content matching. Names
are unique only among elements rendered _together_ (other pages are `display:
none`), so the same key on every page is fine — and the same key across N
consecutive pages is one object moving N−1 times, each transition starting where
the previous one ended. Names carry an occurrence index (`m-title-1`,
`m-cell-2`), so a key may appear several times on one page.

**Split and merge.** A key that appears once on this frame and three times on
the next splits into three; three to one merges. One name pairs one couple, so
the runtime clones the shorter side for the duration of the transition and
removes the clones when it finishes. Any counts work, not just 1 ↔ N.

**Nesting.** `#mark("outer")[… #mark("inner")[…] …]` forms two groups; the
browser lifts the inner one out of the outer snapshot, as the API specifies.

**A transition is a pair, and Typst writes it.** `(enter:, leave:)` — how the
new side comes in, how the old side goes out; a string is the same effect both
ways. Every default and every expansion happens on the Typst side: a string
becomes a pair, the deck's pair fills in for pages that set none, each frame
carries the types of the transition into it (`data-transition="enter-slide
leave-fade"`, the page's on its first frame and the frame-to-frame crossfade on
the others), and a mark's own pair goes into the `vtMarks` table. The runtime
adds one word, `fwd` or `back`, and hands the types to `startViewTransition`; it
decides nothing. `deck.css` keys on them:
`html:active-view-transition-type(fwd):active-view-transition-type(enter-slide)`.
Going back the pair replays in reverse — the new side comes in the way the old
would have gone out, run backwards — so each effect has one rule per role: the
enter effect names the new side forward and the old side back, the leave effect
the other two, and the value is the same in both directions (where the entering
side starts is where the leaving side ends). Every side runs one animation, from
where the variables put it to rest or the reverse: `--vt-opacity`,
`--vt-transform`, `--vt-clip`; an effect is a few variable assignments, nothing
else. A paired mark's crossfade is the browser's own — `old` and `new`
composited with `plus-lighter`, so it stays at constant brightness — and only
its pace is the deck's.

**Page-to-page vs. within a page.** The page-level pair (`deck` /
`slide(transition:)`) is used only when turning to another page. Between frames
of one page the layout stays put and changes incrementally, so root crossfades
and each element's own entrance is `mark(transition:)`. A one-sided mark with an
effect of its own gets its pair as a class for the transition, behind the side
it has (`vt-only-new enter-wipe-up leave-wipe-up` when entering, `vt-only-old …`
when leaving); one without folds into the page (its name is removed for the
duration) and moves as part of the whole sheet. Only an image that exists is
ever given an animation: WebKit styles both images of every named element
whether or not they exist, and an animation given to an image that does not
exist is never torn down — it comes back, already finished, the next time the
name is used.

**Fidelity.** `html.frame` outputs glyph outlines (`<path>`, no `<text>`), so
rendering is Typst's own and independent of installed fonts. The PDF and the
HTML compiled from one source are compared pixel by pixel by `tools/verify.mjs`;
what remains is anti-aliasing of two rasterisers.

**Where the motion lives.** Element animation is not the deck's:
`packages/tween` is N states of one drawing and the browser between them, with
no notion of pages — it writes its own label grammar (`tween:name` on the
container, `tween@i` on each state), derives the keyframes, and hands them to
`waapi`, a binding that keeps no registry of its own because
`getAnimations({ subtree: true })` is one. The deck is a host: it decides *when*
to step, because a step is one of its positions, and it marks its animations
`vit:step` or `vit:anim` so it can find them again.

**Path reconciliation.** Two states are interpolated node by node, and the
browser interpolates two paths only if they are the same list of commands.
Typst's exporter writes the same drawing differently depending on where its
points lie (a leading empty subpath, `h`/`v` for a segment that happens to be
axis-aligned), so tween's `paths.js` reconciles them:

- The browser interpolates two paths only if they are the same list of
  commands, and Typst's exporter writes the same drawing differently depending
  on where its points lie (a leading empty subpath, `h`/`v` for a segment that
  happens to be axis-aligned). The computed `d` values of the states — a fixed
  grammar, the browser's own serialisation — are walked side by side, and a
  command is written differently only where the states differ: `H`/`V`
  against `L` are written as `L`, `S`/`T` against `C`/`Q` in full, an empty
  subpath is dropped where the other side has none, a line against a curve is
  written as the straight curve it is, and a path with fewer segments is
  padded with zero-length segments at the end of its subpath (they draw
  nothing), so a polygon grows from its last vertex and a line extends from
  its end. Where both states agree, nothing is touched. Coordinates are copied
  verbatim; one pass, linear in the length. To choose where new vertices come
  from, draw every state with the same points and stack the spare ones where
  they should start (the tutorial's "Designing the states" page).

Coordinates are copied verbatim; one pass, linear in the length.
`tools/paths.mjs` runs it under Node against a table of cases.
