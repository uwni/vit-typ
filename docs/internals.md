# How vit works

Implementation notes. For using the package see the [README](../README.md); for
the API reference, `docs/api.pdf`.

## How it works

**Identity is a name.** `mark(key)` puts the content in a labelled box and
records what it is and where the layout put it; the deck places an empty
element carrying `data-vit-key` there, and the browser moves the region's group
into it (`web/hoist.js`). That element is the boundary. Nothing is inferred from
geometry.

The box is what makes this work: what says where the region is and how big it
is, is a point placed in each of its two corners, and only something with
corners can hold them. Of everything that can stand in a paragraph that is `box`
and `block`. `block` is block-level and breakable, which rules it out for a term
inside a formula or a word inside a sentence, so a box is the default and
`mark(block: true)` is the way to say otherwise. A box wraps its content like
ordinary text but is atomic, so a mark wider than the rest of the line takes a
line of its own. Marking a word, a title or a figure costs nothing; marking a
whole sentence mid-paragraph reflows the paragraph.

What a mark declares about itself is collected by `query` on the Typst side and
written into the HTML as a table by key (`const vitMarks = {…}`) for the runtime
to look up.

**Placement.** `view-transition-name` is silently ignored on SVG children (only
elements in the CSS box tree are captured), so a marked region has to be a box
of its own. The Typst side lays the region out exactly once, in the page's
frame, in a labelled box, and records two corners and what it is: the key, the
stack it is a layer of, the effects it declared, and whether it is under a veil.
The SVG export writes `<g data-typst-label="vit:key">` around a labelled box's
ink. Beside the page's drawing the deck emits one empty `div.vit-mark` per
region, placed and sized in percent of the page from the corners the page
reported, and carrying them in the page's own units too (`data-vit-at`,
`data-vit-size`).

`web/hoist.js` runs first, while the document is still being parsed, before the
drawings' own elements upgrade: it moves each group into its element, in an
`<svg>` whose `viewBox` is the box the layout gave the region, with the
transforms of everything that stood above the group folded into one `matrix` so
that its coordinates stay the page's. A move, not a measurement: nothing is laid
out and nothing is read back from the browser's layout (`transform.baseVal` is
the attribute, parsed), so it waits for nothing and paints nothing twice. Which
element is which region is the order the page laid them out, per key, on both
sides; a `waapi.animate` inside a frame is the same, under its own label, and
`tween(play:)` points at the n-th label of its kind rather than at an ordinal
written into the frame.

Nothing is laid out twice, and that is not a nicety. A second layout is in the
document a second time: every counter in the region steps again (a numbered
heading inside a mark made the next heading 2 in the browser and 1 on paper),
every state is written again, and every equation is counted again by Typst's
own HTML export, which costs the document a layout pass. The page's layout is
also the only one that knows what container-relative content comes to
(`measure` answers 0pt for `width: 100%`). What a pass is, and what a deck
pays, is the next section.

## The introspection budget

Typst lays a document out again and again until every question the document
asked has the same answer on the document it produced, and gives up after
**five** passes (`crates/typst/src/lib.rs`, the loop in `compile_impl`). Pass N
is built while observing the introspector of pass N−1, every observation is
recorded, and the loop stops when all of them still hold on the document just
built. Two consequences shape everything below.

**The first pass observes nothing.** It sees an empty introspector: every query
is empty, every counter 0, every state its default. Whatever a document does
with those answers, it does wrong once. So a document that asks anything at all
takes at least two passes, and exactly two only if the document built from
empty answers agrees, in everything observed, with the one built from real
answers. That is the whole design constraint: **nothing that shapes a page may
depend on an answer.**

**An error inside a context or a show rule is not fatal during the loop.** It is
delayed: that rule's entire output becomes empty for the pass, the pass's
diagnostics are dropped unless it is the last, and the error surfaces only if it
is still there at the end (`typst-realize/src/lib.rs`, `engine.delay`). An
assert that fails only when the answers are empty, or only when they are not,
removes content on alternate passes, the document never settles, and nothing
names the cause. The fault that took this package longest to find was of that
kind: a state answering "paged" on the first pass, and `_marks` failing on the
record the paper branch wrote.

A deck takes **two** passes, the floor, by four rules:

1. **The deck builds the page, from its own arguments.** A frame's size decides
   every position inside it, and positions are what the deck queries. So
   `player` installs `show <vit-stage>: …` with its own width, height and
   margin, and `slide` emits only `[#block(body)<vit-stage>]`. Whether the
   document is HTML at all arrives the same way, as the style `waapi.hosting`
   sets (`copy.html`): `target()` cannot be asked inside a frame, and a state
   answers "paged" on the first pass — which is how `mark` used to take the
   paper branch once and hand `_marks` a record without a `transition`.
2. **A record carries no answer.** What `mark` writes down is its key, its
   stack, its effects and whether it is under a veil, all arguments and styles
   (`veil` is a style, `waapi.hidden`, since Typst cannot be asked whether
   something is hidden). No ordinal either: `tween` used to number its playing
   drawings with a counter, and two of them on one page cost a pass.
3. **Which frame a record belongs to is where it falls.** `_hosts` runs after
   its frame's records and walks up to `here()`, starting over at every
   `vit-frame`; `_offsets` runs from inside the frame, before the stack's own
   layers are recorded, so it counts the frame markers before it and walks that
   whole segment. No frame is numbered by a counter anywhere.
4. **The region is laid out once.** The page's frame is the only layout of a
   mark; the browser moves the ink. This package first drew every region a
   second time, in an `html.frame` of its own, and that copy could only be
   built from the query, so it first existed on the second pass. Anything in it
   that read the introspector at its own location (theorion's proof reads a
   state it also writes) read one pass stale and settled one pass late, and
   Typst's HTML export queries `math.equation` on every pass
   (`typst-html/src/document.rs`, to decide whether to emit math CSS) with a
   recorded hash over every equation's content and location, so any equation
   in the copy cost a third pass by itself. An equation in a mark was three,
   theorion's proof in a mark four. Once was two and three.

What the host protocol carries travels as
[`elembic`](https://typst.app/universe/package/elembic/) styles, all of it: that
the document is HTML, that the deck places boxes, that a region is veiled, that
a drawing is inside another's states.

What still costs a pass is the content's own, and vit adds nothing to it.
`examples/tutorial.typ` takes three: theorion's proof ends in a QED symbol that
is an inline equation whose presence it reads from a state
(`theorion-qed-stack`), so the equation first exists on the second pass and the
export's equation query sees it on the third — the same three a plain document
with that proof takes. fletcher and cetz read nothing from the introspector
(fletcher `get`s a state it never updates). `tests/fixture.typ` takes two, and
so does every construct in the package, measured: an equation inside a mark,
fletcher with equations inside a mark, two `waapi.animate` on one page, two
`tween(play:)` on one page, all two.

To see what a deck pays and why, `tools/typst-convergence-debug.patch` against a
typst checkout adds `TYPST_DEBUG_CONVERGENCE=1`, which prints for every pass that
did not settle which introspections changed and which errors were swallowed,
and `TYPST_DEBUG_STOP_AT=n`, which emits pass n's document so two passes can be
diffed as files. For the count alone, `--timings t.json` and count the
`html document` spans.

**The browser does the pairing.** On every page turn the runtime calls
`document.startViewTransition({ update, types })`; the browser pairs
`::view-transition-old(name)` and `::view-transition-new(name)` by string
equality and interpolates the box. There is no diff and no content matching.
Names only need to be unique among elements rendered _together_ (other pages are
`display: none`), so the same key on every page is fine, and the same key across
N consecutive pages is one object moving N−1 times, each transition starting
where the previous one ended. Names carry an occurrence index (`m-title-1`,
`m-cell-2`), so a key may appear several times on one page.

**Split and merge.** A key that appears once on this frame and three times on
the next splits into three; three to one merges. One name pairs one couple, so
the runtime clones the shorter side for the duration of the transition and
removes the clones when it finishes. Any counts work, not just 1 ↔ N.

**Nesting.** `#mark("outer")[… #mark("inner")[…] …]` forms two groups; the
browser lifts the inner one out of the outer snapshot, as the API specifies.

**A transition is a pair, and Typst writes it.** `(enter:, leave:)` says how the
new side comes in and how the old side goes out; a string is the same effect
both ways. Every default and every expansion happens on the Typst side: a string
becomes a pair, the deck's pair fills in for pages that set none, each frame
carries the types of the transition into it (`data-transition="enter-slide
leave-fade"`, the page's on its first frame and the frame-to-frame crossfade on
the others), and a mark's own pair goes into the `vitMarks` table. The runtime
adds one word, `fwd` or `back`, and hands the types to `startViewTransition`; it
decides nothing. The stylesheet keys on them:
`html:active-view-transition-type(fwd):active-view-transition-type(enter-slide)`.
Those rules are generated by `lib.typ` next to the list of effect names, so the
names are defined once and cannot get out of sync; `web/deck.css` holds only
what is written by hand.

Going back, the pair replays in reverse: the new side comes in the way the old
would have gone out, run backwards. So each effect has one rule per role: the
enter effect names the new side forward and the old side back, the leave effect
the other two, and the value is the same in both directions (where the entering
side starts is where the leaving side ends). Every side runs one animation, from
where the variables put it to rest or the reverse: `--vit-opacity`,
`--vit-transform`, `--vit-clip`. An effect is just a few variable assignments. A
paired mark's crossfade is done by the browser (`old` and `new` composited with
`plus-lighter`, so it stays at constant brightness); only its pace comes from
the deck.

**Page-to-page vs. within a page.** The page-level pair (`deck` /
`slide(transition:)`) is used only when turning to another page. Between frames
of one page the layout stays put and changes incrementally, so root crossfades
and each element's own entrance is `mark(transition:)`. A one-sided mark with an
effect of its own gets its pair as a class for the transition, behind the side
it has (`vit-only-new enter-wipe-up leave-wipe-up` when entering, `vit-only-old …`
when leaving). A one-sided mark without one folds into the page (its name is
removed for the duration) and moves as part of the whole sheet. Only an image
that exists is ever given an animation: WebKit styles both images of every named
element whether or not they exist, and an animation given to an image that does
not exist is never torn down. It comes back, already finished, the next time
the name is used.

**The three modes.** The document holds the deck (every page, with one frame of
one page rendered) and the rail (one thumbnail per page) side by side, and never
moves anything between them. Presenting shows the deck alone, the overview
shows the rail alone laid out as a grid, and the desk shows both, with the
page's notes under the deck. A thumbnail's picture is an SVG `<use>` of the
page's own drawing, so a page is rendered once however many places it is shown.
Two properties of `<use>` make that work, both measured rather than assumed: it
renders a source whose _ancestor_ is `display: none` (which every page but one
is), and it follows the source's attributes and inline styles, so a thumbnail
shows the step the page is on without the page being on screen. It does not
follow animation, because style does not compute in a `display: none` subtree,
and a thumbnail does not want animation anyway.

**Whose transition it is.** A page's own effect (slide, zoom, a wipe) is written
on `root`, which is only right while the page _is_ the screen. So the page's
snapshot is root while presenting and the deck's own group (`vit-page`) at the
desk, where the page is a box beside the rail. Every effect rule names both, so
the same slide, zoom or wipe plays either way. At the desk the transition
carries the type `boxed`, under which nothing outside the page is captured at
all, and the page's group is clipped to its own box, since a slide pushes a page
by its own width and would otherwise travel out over the rail.

In the overview there is no page transition at all: the pages are thumbnails,
and turning to another only moves the highlight. If the effect stayed on root, a
page with `transition: "slide"` would slide the whole desk (rail, notes and all)
or the whole overview grid.

Leaving root out matters for more than animation. A captured element is not
painted while the transition runs, and what is not painted is not hit-tested
either. Capturing root turns the whole document into a picture of itself, and a
thumbnail in a picture cannot be clicked. Measured on the tutorial, a desk page
turn with root captured leaves the rail unresponsive for 793 ms of an 810 ms
turn; without it, for 42 ms, which is just the capture itself.

The chrome's names are dropped along with root's, for the opposite reason.
`vit-bar`, `vit-laser` and `vit-trail` exist so that the toolbar and the pointer
are held still while root animates: each is a group of its own with `animation:
none`. With root not captured there is nothing to hold them still against, and
a name has a cost: it is a capture, and a capture is a frame in which the
element is not painted. Left named, the toolbar blinks once per page turn. So
under `boxed` the page and the marks inside it are the only elements in the
document that carry a name, and an invariant checks the rest.

This costs one frame. A captured element is out of the live rendering from the
moment the old state is taken until the new one is, and the update runs in
between, so the gap lasts a frame. With root captured that frame is never
painted and the screen keeps showing the previous one. With root left out, the
rest of the page keeps painting and the deck's box shows as a hole.

**The page's ground.** The hole has to be filled with the page, not a colour: a
flash of the desk and a flash of flat black are both visible flashes. So
`.vit-plate`, an `<svg>` in the cell under the deck, is pointed by the same
`point()` the rail uses at whatever the deck is showing. It is the same `<use>`
as a thumbnail, at the deck's own size, so nothing is rendered twice. It works
because a `<use>` of a captured element still draws: measured mid-transition,
the current page's thumbnail still shows its page and not a blank.

Measured inside the page's box with the deck not painting: without the ground,
a flat 240 of 255, i.e. the desk showing through the middle of the screen. With
it, mean 42.4 over the range 7–255, against 42.4 over 7–255 for the page itself,
with 0.29 % of pixels differing by more than 8. It also costs nothing to keep:
with the ground and without it, the desk holds the same 16.7 ms frame.

An effect expressed as a proportion follows the page automatically: a push is
`100%` of the image's own box. One expressed as a length does not: the zoom's
lens is a quarter of the page, and `--vit-box` is how wide the page came out,
which only the browser knows. A transition's own pseudo-elements are its only
readers, so the runtime writes it along with everything else in `render()`
instead of tracking the box: writing a custom property on the root costs a style
recalculation of the whole document, and the desk's boundaries can be dragged.

The page is not named while presenting because there it would gain nothing and
still cost a capture: measured on the tutorial, capturing the deck as a group of
its own runs about 23 ms longer than capturing root, and during that time the
real DOM is already hidden and the snapshots are not composited yet.

Switching modes is a zoom between a page's two faces. The browser pairs the old
image with the new by _name_, not by node, so the two faces do not have to be
the same element: `vit-zoom` goes on the picture in the rail before the change
and on the page in the deck after it, and the browser interpolates one box into
the other. `<html data-mode>` is the only record of the mode: the stylesheet
reads it, and nothing else decides what is shown.

**The deck and its chrome.** `runtime.js` is the deck: the model, stepping,
transitions, the state and the one function that changes it, the rail, and
`window.vit`. `chrome.js` is everything that floats over it: the toolbar, the
laser pointer and its tracer, the settings panel, the key help, the black
screen, the speaker view. The dependency is one-way. The chrome reads
`window.vit` and listens to `vit:ready`, `vit:drawn`, `vit:move-begin`,
`vit:move-here` and `vit:move-done`; the deck calls nothing in the chrome and
does not care whether it is there.

There is one exception: the deck reads its own `window.name` and behaves
differently when it is `vit-mirror`, a preview inside the speaker view. There
is no other way to do this. Over `file://` the window that made a preview is
another origin and cannot reach into it, so a preview that must present, drop
the rail and (if it runs ahead) not play a page change out has to learn all
three from something it can see by itself. That is one fact
about the window it is in, read once at start; everything else still flows one
way.

What the presenter chooses (the pace, the theme, what the laser looks like)
belongs to the chrome and is stored in their browser; the document sets the
starting values, and the deck itself only has a speed. The deck and the chrome
meet directly in two places, both explicit: `vit.hold(on)`, which the laser
calls so a press on the page points instead of turning it, and a capture-phase
key listener, so that while something modal is open the deck never receives the
keys.

**The stylesheet a deck carries.** `<style id="vit-style">` holds the layout's
constants, then tween's rules, then `web/deck.css`, then the effects `lib.typ`
writes, then whatever settings this document's transitions and marks asked for.
The comments in those files are for people reading the source, so they are
stripped on the way out, saving about 16 kB per deck.

**The chrome is redrawn from state.** Everything the player shows is derived
from state, and only the deck writes that state: the toolbar's counter and
pressed buttons, the notes beside the page, whether the toolbar is out, whether
the laser's dot is shown. Each is redrawn on `vit:drawn` and when its own input
changes, never only inside the handler of whichever event happened last. Drawn
only in an event handler, a thing stays right only until something else
changes. The toolbar drawn only on pointer moves disappeared for the whole of
every transition, and the laser's dot drawn only on pointer moves was left on
screen after the deck changed mode under it.

`chrome/` in the source is the player's _markup_, not the chrome subsystem:
`desk.typ` emits the rail and the notes, which the deck drives, next to the
grips, which the chrome drives. The directory holds the player's Typst code;
which script drives each element is documented here and in that script.

**The chrome is per window.** The main window has one set of it and the speaker
view another: a toolbar, the key table, the settings panel. What they set is
shared (the deck, and what the presenter has chosen), but what they _show_
belongs to each window, so there is one record per window and everything that
refreshes the chrome walks the list. A panel opened from a toolbar belongs on
that toolbar's screen: the presenter's dials stay on the presenter's screen
instead of appearing in front of the audience. The speaker view's copies are
the same elements, cloned, so there is no second copy of the markup to keep in
sync. Keys work the same way: every key the speaker view receives is forwarded
to the deck, so the window doubles as a remote. The exception is the chrome's
own keys, which act on the window they were pressed in.

Its two previews are this same document in windows whose names say what they
are, `vit-mirror` and `vit-mirror-ahead`. That is how each knows to present and
to drop the rail and the toolbar, and how one of them knows it is not a mirror.

The one showing the current page is a mirror: it plays the page change out,
because it is the presenter's only view of the audience's screen. Because it is
a copy of this same document rather than a second renderer, it stays accurate
without extra work: a page's own drawings are held by the same `!busy` gate
until the same transition ends, so they start together. Measured on the
tutorial, a frame that draws itself starts 850 ms after the turn in the main
window and 846 ms in the mirror; with the transition removed from the mirror it
starts at 156 ms, about one whole transition early.

The one showing what comes next is not a mirror and has nothing to stay in step
with, since what it shows has not happened yet. Playing the change out there
would only blur it during the seconds it is being read, so it lands at once.
That also saves one full-document capture per page turn, measured at 24–38 ms,
though that is a side benefit.

The previews are updated on two events, which mean different things.
`vit:move-begin` is where the deck is _going_, dispatched before it captures.
Updating on it, the mirror begins its own move at the same time as the
audience's instead of a tenth of a second later. That delay came from
`vit:move-here` only arriving once the capture and the update are done, some
37 ms in, with the preview's own capture after that. Measured on the tutorial, a
frame that draws itself used to start 100 ms later in the mirror than in the
main window, consistently; updated on `begin` it lands within about 50 ms either
way, which is the noise of two windows sampled at different frames.
`vit:move-here` is where the deck _is_, and it corrects the preview when a move
was overtaken by the next one: `begin` is a prediction, `here` is the fact.

The counter and the progress bar are drawn from the same two events, so they run
ahead of the audience by that much. That is intended, and it is different from a
picture running ahead: an early number is read as a number, but an early picture
is read as the screen.

**When the toolbar is out.** At the desk and in the overview it is furniture and
stays visible. Over a page being shown it is chrome and should not cover the
slide, so it is out only while somebody is reaching for it or has keyboard focus
in it.

A hidden toolbar must not be hit-testable, or the corner of the page it sits in
would swallow the press that turns the page. Being hoverable and being pressable
are controlled by the same switch, `pointer-events`. So the pointer arrives not
on the toolbar but on `.vit-reach`, a patch of page beneath it. The patch is
fixed to the same corner of the window, so the two cover the same area, and it
is a child of the deck in the document, so a press on it bubbles to the deck
and turns the page like any other. The stylesheet caps the toolbar's width at
the patch's, so the patch always covers it.

The pointer's location is tracked by where it _arrives_: `pointerover` bubbles,
so one listener learns, for every arrival anywhere in the document, whether it
was in that corner. Departures are ignored, because the pointer leaving one
element means arriving on another. The one departure that counts is the pointer
leaving the window. Where nothing can hover (`any-hover: none`) there is no way
to reach for the toolbar, so there it stays out.

While the deck is moving, none of these events are trusted. See below.

**The desk's boundaries.** Two of the desk's sizes are set by the presenter: the
width of the rail, and the height the deck leaves for the notes. The gap between
two parts is a grid track of its own, so the boundary is `.vit-grip`, an element
the pointer can land on rather than a gap between two elements, marked with
three dots and dragged. The browser decides which grip is being dragged: it
hit-tests the grip and hands it the pointer, and the rest of the drag arrives
there. The drag reads how far the pointer has moved, against the size the
element itself reports; the limits come from the stylesheet, in the clamps
around the two properties. A double-click resets to the stylesheet's default
size, and dragged sizes are remembered the same way as the theme and the speed.

The grips are `role="separator"` and not focusable, which in ARIA is a divider
rather than a widget: accurate, but it does not say they can be moved. Making
them movable from the keyboard would need a focusable separator with
`aria-valuenow`, and arrow keys that the deck must then ignore.

**Why the two sizes are registered properties.** `--vit-rail` and `--vit-split`
are declared `inherits: false` and written on the body, which is the element
laid out against them and their only reader. This is for performance. A custom
property that inherits, changed on `<html>`, invalidates the style of every
element in the document, and a Typst deck is enormous: the tutorial has 64,786
elements, mostly the `<use>` elements a page's glyphs are drawn with. Measured
across a 60-step drag of the rail:

|                                                   | wall    | style recalc | layout |
| ------------------------------------------------- | ------- | ------------ | ------ |
| inherited, written on `<html>`                    | 1714 ms | 1014 ms      | 205 ms |
| registered `inherits: false`, written on the body | 700 ms  | 33 ms        | 204 ms |

Chrome has no fast path for a property nothing references, either: writing an
invented `--nobody-reads-this` on the root 60 times costs 1739 ms of style
recalculation on the same document, and Safari 26 spends 13.6 s on the same
thing. Writing a custom property on the root is never cheap.

The two engines favour opposite choices here, which matters before anyone
changes this. The same 60 writes, each followed by a forced layout:

|                                                   | Chrome  | Safari 26   |
| ------------------------------------------------- | ------- | ----------- |
| inherited, written on `<html>`                    | 1014 ms | 188–429 ms  |
| registered `inherits: false`, written on the body | 33 ms   | 935–1051 ms |

Chrome is 30× faster one way and Safari 4× faster the other, so no choice suits
both. This one favours Chrome, and the worst case is about the same either way.
`syntax: "*"` in place of `<length>` changes nothing in Safari, so the cost
there is not type checking. The same cost is why `--vit-box` moved out of the
deck's `ResizeObserver`: it has to be on the root, where the transition
pseudo-elements can inherit it, so it is written once per render instead of
once per frame of a drag. The observer keeps what really depends on resizing:
measuring the paths again.

**What a transition does to the pointer.** While one runs, the document is not
hit-tested _at all_. Measured: `elementFromPoint` answers `<html>` everywhere,
including over a plain unnamed element placed above everything else, and an
element's own listeners do not fire. The document still receives every pointer
event, with its **position intact** and its **target set to `<html>`**. So:

| what it needs                                                        | while the deck moves   |
| -------------------------------------------------------------------- | ---------------------- |
| the pointer's position (the laser's dot and its tracer)              | true, and they keep up |
| the pointer's target (the toolbar knowing it is being reached for)   | unknowable             |
| a press landing on something (the deck's click, wheel and touch)     | not delivered          |

Only what was captured stops responding, which is why `boxed` leaves root out:
at the desk only the page's box is a picture, and the rail beside it responds
throughout except during the capture.

The toolbar therefore keeps its last state while `vit.moving` instead of
reacting to the departure a transition fakes. Measured on the tutorial with a
700 ms page turn and the pointer resting on the toolbar, `pointerleave` fires at
18 ms and `pointerenter` again at 735 ms; if those were trusted, the toolbar
would be hidden for the whole transition. The browser's own hit test some 13 ms
after the move is done corrects the state, including when the pointer really did
leave in the meantime, since it then arrives somewhere else and reports it.

A press that lands while the deck is a picture is not delivered to the deck, so
it does not turn the page. The keys are the fast path: they are not hit-tested,
and a press arriving mid-move counts from the target already accepted. Routing
presses by position instead would keep them, but the deck would then be deciding
by coordinates what the browser should decide.

**What the two sides agree on.** The Typst side writes markup and the runtime
reads it; between them is one untyped protocol, so it is documented here and
checked in `tests/invariants.mjs`.

| written by Typst                                                 | read by            | what it says                                                                  |
| ---------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `.vit-deck[data-duration,-easing,-theme,-version]`               | runtime            | the deck's pace, its chrome theme, the version in the help                    |
| `.vit-group`                                                     | runtime, CSS       | one page. Its box is what the mode zooms carry                                |
| `.vit-slide[data-transition]`                                    | runtime, CSS       | one frame: the types of the transition into it                                |
| `.vit-deck[data-steps]`                                          | runtime            | how many presses every frame takes, in document order, one list for the deck  |
| `.vit-page > svg`                                                | the rail           | the page's drawing; a thumbnail is a `<use>` of it                            |
| `.vit-note`                                                      | runtime            | the page's speaker notes, never in the layout                                 |
| `.vit-rail > .vit-thumb > .vit-cap`, `.vit-stand`, `.vit-dots i` | runtime, CSS       | one thumbnail: caption, the picture's slot, one dot per position              |
| `.vit-bar [data-act]`                                            | runtime            | a toolbar button, by what it does                                             |
| `.vit-bar [data-icon][data-title]`                               | runtime            | one of a button's two faces, and the words that go with it                    |
| `.vit-settings [data-set]`, `[data-out]`, `[data-value]`         | runtime            | a control, its readout, and a segmented button's value                        |
| `.vit-page > .vit-mark[data-vit-key][data-vit-at]`               | runtime, CSS       | one marked region: its own frame, and the corner the page put it at           |

| written by the runtime                                             | read by          | what it says                                                                                              |
| ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `<html data-mode>`                                                 | CSS              | `present`, `desk` or `overview`; the only record of the mode                                              |
| `<html data-theme>`                                                | CSS              | the chrome's light or dark, resolved from `deck(theme:)` and the system                                   |
| `.vit-deck[data-ready]`                                            | CSS              | the scripts have run; before that nothing is shown                                                        |
| `style.viewTransitionName` on `.vit-mark`                          | CSS, the browser | what pairs with what; the element itself is the Typst side's                                              |
| `.vit-stand[data-shows]`                                           | itself           | which frame the thumbnail is pointing at, and how many marks were out of it                               |
| `is-active`, `is-here`, `is-reached`, `is-on`, `is-now`, `is-peek` | CSS              | the frame on stage, the page we are on, the toolbar being reached for, a dot passed / current / previewed |

A control the document emits but nothing binds fails silently instead of
throwing, which is why `data-act`, `data-set` and `data-out` are checked against
the runtime's own tables.

**Fidelity.** `html.frame` outputs glyph outlines (`<path>`, no `<text>`), so
rendering is Typst's own and independent of installed fonts. The PDF and the
HTML compiled from one source are compared pixel by pixel by `tools/verify.mjs`;
the remaining difference is anti-aliasing between the two rasterisers.

**When a drawing may move.** One rule, decided in one place: a drawing moves
only while its frame is the one on stage, the deck is showing that frame rather
than a grid of thumbnails, and no transition is in flight. A snapshot is still,
so a playing element would jump when the snapshot is removed. This is a property
of the state, so `render()` decides it for every frame like everything else it
draws, and the count of transitions in flight is part of the state. It used to
be decided in three places: one paused the frames that were not on stage, one
paused the current frame when the mode changed, and the transition played it
again _if it was still the latest_. A transition overtaken by the next one then
left the page it landed on paused for good.

**Where the motion lives.** Element animation is not part of the deck:
`packages/tween` handles N states of one drawing and the browser moving between
them, with no notion of pages. It writes its own label grammar (`tween:name` on
the container, `tween@i` on each state), derives the keyframes, and hands them
to `waapi`, a binding that keeps no registry of its own because
`getAnimations({ subtree: true })` already is one. The deck is a host: it
decides _when_ to step, because a step is one of its positions, and it marks its
animations `vit-step` so it can find them again. Names with a colon are reserved
for the deck's events, which a listener can be attached to; names with a hyphen
are classes, attributes or, here, an animation's `id`.

**Path reconciliation.** Two states are interpolated node by node, and the
browser interpolates two paths only if they are the same list of commands.
Typst's exporter writes the same drawing differently depending on where its
points lie (a leading empty subpath, `h`/`v` for a segment that happens to be
axis-aligned), so tween's `paths.js` reconciles them.

The computed `d` values of the states (a fixed grammar, the browser's own
serialisation) are walked side by side, and a command is rewritten only where
the states differ: `H`/`V` against `L` become `L`, `S`/`T` against `C`/`Q` are
written in full, an empty subpath is dropped where the other side has none, a
line against a curve is written as the equivalent straight curve, and a path
with fewer segments is padded with zero-length segments at the end of its
subpath (they draw nothing), so a polygon grows from its last vertex and a line
extends from its end. Where both states agree, nothing is touched. Coordinates
are copied verbatim, in one pass, linear in the length. To choose where new
vertices come from, draw every state with the same points and stack the spare
ones where they should start (the tutorial's "Designing the states" page).

`tools/paths.mjs` runs it under Node against a table of cases.
