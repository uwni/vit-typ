# How vit works

Implementation notes. For using the package see the [README](../README.md); for
the API reference, `docs/api.pdf`.

## How it works

**Identity is a label.** `mark(key)` attaches the Typst label `vit-key` to a box
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
into the HTML as a table by key (`const vitMarks = {…}`), which the runtime looks
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
the others), and a mark's own pair goes into the `vitMarks` table. The runtime
adds one word, `fwd` or `back`, and hands the types to `startViewTransition`; it
decides nothing. The stylesheet keys on them:
`html:active-view-transition-type(fwd):active-view-transition-type(enter-slide)`.
Those rules are written by `lib.typ` beside the list of effect names they are
for, so the vocabulary is defined once and a name in one and not the other
cannot happen; `deck.css` holds only what is written by hand.
Going back the pair replays in reverse — the new side comes in the way the old
would have gone out, run backwards — so each effect has one rule per role: the
enter effect names the new side forward and the old side back, the leave effect
the other two, and the value is the same in both directions (where the entering
side starts is where the leaving side ends). Every side runs one animation, from
where the variables put it to rest or the reverse: `--vit-opacity`,
`--vit-transform`, `--vit-clip`; an effect is a few variable assignments, nothing
else. A paired mark's crossfade is the browser's own — `old` and `new`
composited with `plus-lighter`, so it stays at constant brightness — and only
its pace is the deck's.

**Page-to-page vs. within a page.** The page-level pair (`deck` /
`slide(transition:)`) is used only when turning to another page. Between frames
of one page the layout stays put and changes incrementally, so root crossfades
and each element's own entrance is `mark(transition:)`. A one-sided mark with an
effect of its own gets its pair as a class for the transition, behind the side
it has (`vit-only-new enter-wipe-up leave-wipe-up` when entering, `vit-only-old …`
when leaving); one without folds into the page (its name is removed for the
duration) and moves as part of the whole sheet. Only an image that exists is
ever given an animation: WebKit styles both images of every named element
whether or not they exist, and an animation given to an image that does not
exist is never torn down — it comes back, already finished, the next time the
name is used.

**The three modes.** The document holds the deck — every page, one frame of one
page rendered — and the rail — one thumbnail per page — side by side, and never
moves anything between them: presenting is the deck alone, the overview is the
rail alone laid out as a grid, the desk is both, with the page's notes under the
deck. A thumbnail's picture is an SVG `<use>` of the page's own drawing, so a
page is rendered once however many places it is shown. Two properties of `<use>`
are what makes that work, both measured rather than assumed: it renders a source
whose *ancestor* is `display: none` (which every page but one is), and it
follows the source's attributes and inline styles, so a thumbnail shows the step
the page is on without the page being on screen. What it does not follow is
animation — style does not compute in a `display: none` subtree — which is what
a thumbnail wants anyway.

**Whose transition it is.** A page's own effect — slide, zoom, a wipe — is
written on `root`, which is right only while the page *is* the screen. So the
page's snapshot is root while presenting and the deck's own group (`vit-page`)
at the desk, where the page is a box beside the rail. Every effect rule names
both, so the same slide, zoom or wipe plays either way; the transition carries
the type `boxed` at the desk, under which nothing outside the page is captured
at all, and the page's group is clipped to its own box, since a slide pushes a
page by its own width and would otherwise travel out over the rail.

Leaving root out is not only about what animates. A captured element is not
painted for as long as the transition runs, and what is not painted is not
hit-tested either — so capturing root turns the whole document into a picture
of itself, and a thumbnail cannot be clicked in a picture. Measured on the
tutorial, a desk page turn with root captured leaves the rail dead for 793 ms
of an 810 ms turn; without it, for 42 ms — the capture itself, and nothing
more.

The chrome's names go with root's, for the same reason turned around.
`vit-bar`, `vit-laser` and `vit-trail` exist so that the toolbar and the
pointer are held still while root animates: a group of their own, `animation:
none`. With root not captured there is nothing to hold them still from, and a
name is not free — it is a capture, and a capture is a frame in which the
element is not painted. Left named, the toolbar blinks once per page turn. So
under `boxed` the page and the marks inside it are the only things in the
document that carry a name, and an invariant walks the rest to say so.

It has a price, and the price is a frame. A captured element is out of the live
rendering from the moment the old state is taken until the new one is, and the
update half runs in between — so that is a frame, not an instant. With root
captured that frame is never painted at all and the screen simply holds the
last one; with root left out, the rest of the page goes on painting and the
deck's box is a hole in it.

**The page's ground.** What fills the hole has to be the page, not a colour: a
flash of the desk and a flash of flat black are both a flash. So `.vit-plate`,
an `<svg>` in the cell under the deck, is aimed by the same `point()` the rail
uses at whatever the deck is showing — the same `<use>` a thumbnail is, at the
deck's own size, so it is no second rendering of anything. It works because a
`<use>` of a captured element still draws: measured mid-transition, the current
page's thumbnail is still its page and not a blank.

Measured inside the page's box with the deck not painting: without the ground,
a flat 240 of 255 — the desk showing through the middle of the screen. With it,
mean 42.4 over the range 7–255, against 42.4 over 7–255 for the page itself,
0.29 % of pixels differing by more than 8. And it is free to keep: with the
ground and without it, the desk holds the same 16.7 ms frame. In the overview there is no page transition at all: the pages are
thumbnails, and turning to another only moves the highlight. Left on root, a
page with `transition: "slide"` slides the whole desk, rail and notes and all,
or the whole overview grid.

An effect that is a proportion follows the page by itself — a push is `100%` of
the image's own box. One that is a length does not: the zoom's lens is a quarter
of the page, and `--vit-box` is how wide the page came out, which only the
browser knows. A transition's own pseudo-elements are its only readers, so the
runtime draws it with everything else in `render()` rather than chasing the
box: writing a custom property on the root costs a style recalculation of the
whole document, and the desk's boundaries can be dragged.

The page is not named while presenting because there it would buy nothing and
cost the capture: measured on the tutorial, capturing the deck as a group of
its own runs about 23 ms longer than capturing root, and that is a window in
which the real DOM is already hidden and the snapshots are not composited yet.

Going from one mode to another is a zoom between a page's two faces. The browser
pairs the old image with the new by *name*, not by node, so the two faces need
not be the same element: `vit-zoom` goes on the picture in the rail before the
change and on the page in the deck after it, and the browser interpolates one
box into the other. `<html data-mode>` is the whole of the mode — the stylesheet
reads it, and nothing else decides what is shown.

**The deck and its chrome.** `runtime.js` is the deck — the model, stepping,
transitions, the state and the one function that changes it, the rail, and
`window.vit`. `chrome.js` is everything that floats over it: the toolbar, the
laser pointer and its tracer, the settings panel, the key help, the black
screen, the speaker view. The dependency is one-way. The chrome reads
`window.vit` and listens to `vit:ready`, `vit:render`, `vit:move-ready` and
`vit:move-done`; the deck names nothing in the chrome and does not know whether
it is there. What the presenter chooses — the pace, the theme, what the laser
looks like — is the chrome's, kept in their browser; the document says where
each starts and the deck itself only has a speed. Two places where the two
genuinely meet are said out loud rather than reached across: `vit.hold(on)`,
which the laser calls so a press on the page points instead of turning it, and
a capture-phase key listener, so that while something modal is up the deck
never hears the keys at all.

**The stylesheet a deck carries.** `<style id="vit-style">` is the layout's
constants, then tween's rules, then `deck.css`, then the effects `lib.typ`
writes, then whatever settings this document's transitions and marks asked for.
The prose in those files is for whoever reads them and the browser has no use
for it, so the comments are cut on the way out — about 16 kB per deck.

**The chrome is drawn, not poked.** Everything the player shows is a projection
of state, and the state's only writer is the deck: the toolbar's counter and
pressed buttons, the notes beside the page, whether the toolbar is out, whether
the laser's dot is. Each is redrawn on `vit:render` and when its own input
changes, never inside the handler of whichever event happened to be the last
one. A thing drawn only in an event handler is a thing that is right only until
something else changes — the toolbar drawn only on pointer moves went out for
the whole of every transition, and the laser's dot drawn only on pointer moves
was left on screen after the deck had changed mode under it.

**The chrome is per window.** The main window has a set of it and the speaker
view another: a toolbar, the key table, the settings panel. What they set is
shared — the deck, and what the presenter has chosen — but what they *show* is
each their own, so there is one record per window and everything that refreshes
the chrome walks the list. A panel opened from a toolbar belongs on that
toolbar's screen: the presenter's dials on the presenter's screen, not thrown up
in front of the audience. The speaker view's copies are the very elements,
cloned, rather than a second copy of the markup to keep in step. Its keys are
the same: every key it sees is a key at the deck, so the window doubles as a
remote — every key but the chrome's own, which act on the window they were
pressed in.

Its two previews are this same document in windows that say so in their name
(`vit-mirror`), which is how each of them knows to present, to drop the rail
and the toolbar, and not to play a page change out. That last one is the
speaker view saying what it is: a console, not a monitor of the audience's
screen. All of it already runs ahead of them — the counter, the progress bar
and both previews are redrawn on `vit:move-ready`, which the deck announces at
the *start* of a move, some 37 ms into a 730 ms turn — so a preview that played
the change out would be the one thing on that screen still telling yesterday's
news, and it would be unreadable while it did. Landing at once also spares two
full-document captures a page turn, measured at 24–38 ms each; that is a
saving, not the reason.

**When the toolbar is out.** At the desk and in the overview it is furniture and
stays. Over a page being shown it is chrome, and chrome does not sit on a slide:
it is out only while somebody is reaching for it, or has the keyboard in it.

A hidden toolbar must not be hit-testable, or the corner of the page it sits in
would swallow the press that turns the page — and being hoverable and being
pressable are the same switch, `pointer-events`. So what the pointer arrives on
is not the toolbar but `.vit-reach`, a patch of page beneath it: fixed to the
same corner of the window, so the two cover the same ground, and a child of the
deck in the document, so a press on it bubbles to the deck and turns the page
like any other. The stylesheet caps the toolbar's width at the patch's, so the
patch cannot fail to cover it.

Where the pointer is is told by where it *arrives*: `pointerover` bubbles, so
one listener says, of every arrival anywhere in the document, whether it was in
that corner. Departures say nothing — the pointer leaving one element is it
arriving on another — bar the one departure that is real, the pointer leaving
the window. Where nothing can hover (`any-hover: none`) there is no way to reach
for it, so there it stays out.

While the deck is moving, none of it is believed. See below.

**The desk's boundaries.** Two of the desk's sizes are the presenter's: the
width of the rail, and the height the deck leaves the notes. The gap between
two parts is a track of its own, so the boundary is `.vit-grip`, an element the
pointer can arrive on rather than a place between two, marked with three dots
and dragged. Which grip is being dragged is the browser's answer, not a
calculation: it hit-tests the grip and hands it the pointer, and the rest of the
drag arrives there. What is read of the pointer is how far it has come, against
the size the element itself reports; how far it may be taken is the stylesheet's
own, in the clamps around the two properties. A double-click is the way back to
the size the stylesheet draws, and what has been dragged is remembered the way
the theme and the speed are.

The grips are `role="separator"` and not focusable, which in ARIA is a divider
rather than a widget: what they say is true, but they say nothing about being
movable. Making them movable from the keyboard means a focusable separator with
`aria-valuenow`, and arrow keys that the deck must then not hear.

**Why the two sizes are registered properties.** `--vit-rail` and `--vit-split`
are declared `inherits: false` and written on the body, which is the element
laid out against them and their only reader. This is not tidiness. A custom
property that inherits, changed on `<html>`, invalidates the style of every
element in the document, and a Typst deck is enormous — the tutorial is 64,786
elements, mostly the `<use>` a page's glyphs are drawn with. Measured across a
60-step drag of the rail:

| | wall | style recalc | layout |
| --- | --- | --- | --- |
| inherited, written on `<html>` | 1714 ms | 1014 ms | 205 ms |
| registered `inherits: false`, written on the body | 700 ms | 33 ms | 204 ms |

Chrome has no cheap path for a property nothing references, either: writing an
invented `--nobody-reads-this` on the root 60 times costs 1739 ms of style
recalculation on the same document, and Safari 26 spends 13.6 s on the same
thing. A custom property on the root is never a cheap thing to write.

The two engines want opposite things here, which is worth knowing before this
is "improved". The same 60 writes, each followed by a forced layout:

| | Chrome | Safari 26 |
| --- | --- | --- |
| inherited, written on `<html>` | 1014 ms | 188–429 ms |
| registered `inherits: false`, written on the body | 33 ms | 935–1051 ms |

Chrome is 30× better one way and Safari 4× better the other, so there is no
choice that suits both; this is the Chrome one, and the worst case is about the
same either way. `syntax: "*"` in place of `<length>` changes nothing in Safari,
so what it costs there is not the type checking. It is also why `--vit-box` moved out of the
deck's `ResizeObserver` — it has to be on the root, where the transition
pseudo-elements can inherit it, so instead it is written once per render rather
than once per frame of a drag. The observer keeps what is genuinely per-resize:
measuring the paths again.

**What a transition does to the pointer.** While one runs, the document is not
hit-tested *at all* — measured: `elementFromPoint` answers `<html>` everywhere,
including over a plain unnamed element added over everything else, and an
element's own listeners do not fire. What does still arrive at the document is
every pointer event, with its **position intact** and its **target `<html>`**.
So:

| what it needs | while the deck moves |
| --- | --- |
| the pointer's position — the laser's dot and its tracer | true, and they keep up |
| the pointer's target — the toolbar knowing it is being reached for | unknowable |
| a press landing on something — the deck's click, wheel and touch | not delivered |

What goes dark is what was captured, which is why `boxed` leaves root out: at
the desk only the page's box is a picture, and the rail beside it is live for
all but the capture.

The toolbar therefore holds its last word while `vit.moving`, rather than
believing the departure a transition manufactures: measured on the tutorial with
a 700 ms page turn and the pointer resting on the toolbar, `pointerleave` fires
at 18 ms and `pointerenter` again at 735 ms — believed, the toolbar is out of
sight for the whole transition. The browser's own hit test some 13 ms after the
move is done corrects us, including when the pointer really did leave meanwhile,
since it then arrives somewhere else and says so.

And a press that lands while the deck is a picture is not delivered to the deck,
so it does not turn the page. The keys are the fast path: they are not
hit-tested, and a press arriving mid-move counts from the target already
accepted. Routing presses by position instead would keep them, at the cost of
the deck deciding by coordinates what the browser is there to decide.

**What the two sides agree on.** The Typst side writes markup and the runtime
reads it; between them is one untyped protocol, so it is written down here and
checked in `tests/invariants.mjs`.

| written by Typst | read by | what it says |
| --- | --- | --- |
| `.vit-deck[data-duration,-easing,-theme,-version]` | runtime | the deck's pace, its chrome theme, the version in the help |
| `.vit-group` | runtime, CSS | one page. Its box is what the mode zooms carry |
| `.vit-slide[data-transition,-steps]` | runtime, CSS | one frame: the types of the transition into it, and how many presses it takes |
| `.vit-page > svg` | hoist.js, the rail | the page's drawing; a thumbnail is a `<use>` of it |
| `.vit-note` | runtime | the page's speaker notes, never in the layout |
| `.vit-rail > .vit-thumb > .vit-cap`, `.vit-stand`, `.vit-dots i` | runtime, CSS | one thumbnail: caption, the picture's slot, one dot per position |
| `.vit-bar [data-act]` | runtime | a toolbar button, by what it does |
| `.vit-bar [data-icon][data-title]` | runtime | one of a button's two faces, and the words that go with it |
| `.vit-settings [data-set]`, `[data-out]`, `[data-value]` | runtime | a control, its readout, and a segmented button's value |
| `<g data-typst-label="vit-…">` | hoist.js | a mark: the label is the identity, the subtree is the boundary |

| written by the runtime | read by | what it says |
| --- | --- | --- |
| `<html data-mode>` | CSS | `present`, `desk` or `overview` — the whole of the mode |
| `<html data-theme>` | CSS | the chrome's light or dark, the verdict of `deck(theme:)` and the system |
| `.vit-deck[data-ready]` | CSS | the scripts have run; before that nothing is shown |
| `.vit-mark[data-vit-key]`, `style.viewTransitionName` | CSS, the browser | what hoisting lifted, and what pairs with what |
| `.vit-stand[data-shows]` | itself | which frame the thumbnail is pointing at, and how many marks were out of it |
| `is-active`, `is-here`, `is-reached`, `is-on`, `is-now`, `is-peek` | CSS | the frame on stage, the page we are on, the toolbar being reached for, a dot passed / current / previewed |

A control the document emits and nobody binds is silent rather than broken,
which is why `data-act`, `data-set` and `data-out` are checked against the
runtime's own tables rather than trusted.

**Fidelity.** `html.frame` outputs glyph outlines (`<path>`, no `<text>`), so
rendering is Typst's own and independent of installed fonts. The PDF and the
HTML compiled from one source are compared pixel by pixel by `tools/verify.mjs`;
what remains is anti-aliasing of two rasterisers.

**When a drawing may move.** One sentence, and one writer: a drawing moves only
while its frame is the one on stage, the deck is showing that frame rather than
a grid of thumbnails, and no transition is in flight — a snapshot is still, so a
playing element would jump when the snapshot goes. That is a property of the
state, so `render()` decides it for every frame like everything else it draws,
and the count of transitions in flight is part of the state. It used to be three
writers — one paused the frames that were not on stage, one paused the current
frame when the mode changed, and the transition played it again *if it was still
the latest* — and a transition overtaken by the next one left the page it landed
on paused for good.

**Where the motion lives.** Element animation is not the deck's:
`packages/tween` is N states of one drawing and the browser between them, with
no notion of pages — it writes its own label grammar (`tween:name` on the
container, `tween@i` on each state), derives the keyframes, and hands them to
`waapi`, a binding that keeps no registry of its own because
`getAnimations({ subtree: true })` is one. The deck is a host: it decides _when_
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
