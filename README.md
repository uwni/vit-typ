# vit

Typst slides that morph in the browser. One `.typ` compiles to a PDF and an HTML
deck that are pixel-identical. In the HTML, anything wrapped in
`#mark("key")[…]` moves from where it sits on one page to where it sits on the
next, changing position, size and colour.

**[Live tutorial](https://uwni.github.io/vit-typ/examples/tutorial.html)**:
twenty-eight pages, code on the left and the result on the right, covering every
call in the API and when to use it.

Layout changes (a new page, one more line, a title moving) run on the browser's
View Transitions API. An object that changes with a parameter (a curve at the
next phase, a pendulum at the next pose) is interpolated on its SVG nodes by the
Web Animations API. The package writes no interpolation code of its own: it
navigates, tidies the DOM once at load, and hands the browser two states.

## Requirements

- Typst 0.15 +.
- A browser with same-document View Transitions including transition types and
  `view-transition-class`, and CSS `d` for path morphing. Blink and Gecko have
  both; in Safari 27 preview switch on the "CSS d property" flag under
  Develop → Feature Flags. Verified in Chromium (`tools/`).

## Use

vit is not on Typst Universe yet, so clone the repository and build the package:

```sh
npm install && npm run build
```

The build writes `dist/<version>/`, with the version read from
`typst/typst.toml`. It copies `typst/` (the code that runs when a document
compiles) as is, and minifies `web/` (the code that runs in the browser) with
esbuild into `web/` next to `lib.typ`. That directory is the complete package.
`typst/lib.typ` does not compile in place, and `dist/` is not committed, so you
need to run the build first, and again after changing a source
(`npm run watch` rebuilds on save).

Then import the built `lib.typ` by path, or link `dist/` as a local package
(`<typst packages dir>/local/vit` → `dist`) and import `@local/vit:0.1.0`:

```typst
#import "../dist/0.1.0/lib.typ": *   // once published: "@preview/vit:0.1.0"
```

Element animation is a separate package: [`tween`](packages/tween) handles N
states of one drawing and the browser moving between them. It has no notion of
slides, works in any Typst HTML document, and vit is one of its hosts. A deck
adds the layout: pages, positions, and the transitions between them.

Support for other drawing libraries lives inside `tween`, under
[`compat/`](packages/tween/compat): one file per library, each importing no
version of anything, so a document that does not use that library pays nothing.
There is one so far, for [CeTZ](https://typst.app/universe/package/cetz) (see
[CeTZ](#writing-a-deck)). `lib.typ` exposes it, because a published package's
subfiles cannot be imported:

```typst
#import "@preview/tween:0.1.0": compat
```

One compile per format, from the same file:

```sh
typst compile --root . examples/tutorial.typ examples/tutorial.pdf
typst compile --root . --features html examples/tutorial.typ examples/tutorial.html
```

The HTML opens directly from disk; no server is needed. The PDF next to it with
the same name is what the toolbar's download button offers.

## Quick start

```typst
#import "@preview/vit:0.1.0": *

#let body = {
  slide[
    #set align(center + horizon)
    #mark("title")[#text(size: 76pt, weight: 700)[vit]]

    #mark("sub")[#text(size: 26pt)[Typst slides with View Transitions]]
  ]

  slide[
    #mark("title")[#text(size: 26pt, weight: 700)[A deck in ten lines]]

    `deck` is the document, `slide` is a page, `mark` names what should
    travel. Everything else is ordinary Typst.
  ]
}

#deck(title: "vit", body)
```

When you turn the page, the title shrinks from the centre into the corner. The
motion is not written by hand: both pages are ordinary Typst layout, and the
geometry is measured from it at load time.

`#show: deck.with(title: "My talk")` at the top with the slides below is the
same as passing the content in.

## How motion works

The browser interpolates a mark's **box** and cross-fades its two **pictures**.
The parts inside a picture do not move on their own. So **anything that moves
has to be one picture**, and anything that is laid out again between frames
cannot glide; it can only cross-fade with its earlier version.

Most of the API follows from that: `reveal` keeps a picture from being laid out
again, `layers` lets something arrive outside a picture without redrawing it,
and an element animation changes a picture's own geometry.

There are three kinds of motion. To pick one, ask whether **the layout changed
or one object is moving**:

- **Transition**: the layout changed, either a new page or the next frame of
  the same page. Runs on View Transitions; marked elements pair by key.
  `slide(..frames)`, `deck(transition:)`, `mark(key)[…]`.
- **Element animation**: one drawing varies with a parameter while the layout
  stays the same. Runs on Web Animations on the SVG nodes, stepped with the
  keys. `tween(s0, s1, …)`, which comes from [`tween`](packages/tween), not the
  deck: the drawing does not have to be a `mark`, and the same call works in a
  blog post.
- **Continuous animation**: something moving on its own, without keys, for as
  long as the page stays on that frame. `tween(play:)` plays a drawing's
  states, and `waapi.animate` moves an element with its own keyframes or along
  a path. Both come from [`tween`](packages/tween); the deck only starts them
  after the transition and pauses what is off stage.

## API

| | |
| --- | --- |
| `deck(title:)` | Document title. |
| `deck(width:, height:)` | Layout size, default 1280pt × 720pt. The PDF page size; each HTML frame reads `page.width` / `page.height`, and the player's aspect ratio follows. |
| `deck(margin:)` | How far the layout is held off the edge, default 60pt. It is the page's own margin, so the PDF's margin and every frame's inset use the same value; `slide` reads it back. |
| `player(…)` | vit's part of a deck on its own: the stylesheet, the runtime and the chrome, around pages that are already laid out. `deck` sets up the document (page, text, title) and then calls this. A package that already controls the document sets its page as usual and calls `player` with the settings above that do not belong to the document: `pdf`, `duration`, `easing`, `transition`, `theme`, `laser`. |
| `deck(pdf:)` | Target of the toolbar's download link. `auto` = the `.pdf` next to the HTML with the same name, `none` = no button, a string is used as is. |
| `deck(duration:)` | Default transition duration in milliseconds, 700. A single transition can set its own (`transition: (effect: "zoom", duration: 400)`); `-` / `=` / `0` scale every duration. |
| `deck(transition:)` | Default **page-to-page** transition: a name, an `(enter:, leave:)` pair, or a dictionary with the effect and its settings (see [Transitions](#transitions)). Applies to unmarked content only; paired marks morph regardless, and frames of one page always crossfade. |
| `deck(theme:)` | Light/dark theme of the player chrome (toolbar, overview, speaker view): `auto` (follows the system), `"dark"`, `"light"`. The layout's colours come from Typst. |
| `deck(fill:)` | Layout background, default `#111318`. The PDF uses `page(fill:)`; the HTML paints the same value under the slides and thumbnails, independent of the chrome theme. |
| `deck(font:)` | Font stack with glyph-by-glyph fallback, default `("DejaVu Sans", "Noto Sans CJK SC")`. |
| `slide(title:)` | Shown only in the thumbnail caption, never in the layout. May be content. |
| `slide(note:)` | Speaker notes. HTML only; read by the speaker view (`s`). May be content. |
| `slide(..frames)` | Several bodies = **frames of the same page**. Navigation walks them one by one; the overview merges them into one thumbnail. |
| `slide(transition:)` | Overrides `deck(transition:)` for this page: a name or an `(enter:, leave:)` pair, for how this page comes in and how the page before it goes out. Going back, the page being left decides, so it always replays in reverse. `none` uses the deck's. |
| `mark(key)[…]` | Names a piece of content. The same key on two adjacent pages pairs them. |
| `mark(block:)` | What holds the identity: a box by default, which lets a mark sit inside a sentence, or an unbreakable block with `block: true`. A box is only as tall as its glyphs while a line is as tall as the line, so content that is a block in its own right (a title in a header band, a figure, a column) measures differently in a box, and anything that fits or centres it by measuring it moves. `block: true` measures exactly as the unmarked content did. |
| `mark(transition:)` | This object's **own** enter/leave effect (same names as above, a string or an `(enter:, leave:)` pair). Applies only when the mark is one-sided in a transition; a paired mark morphs regardless. Unset, the mark folds into the page. An object has one effect: given on any occurrence of the key, it applies to all of them, and two occurrences may not disagree. Keys are letters, digits, `_` and `-`. |
| `tween(s0, s1, …)` | **Element animation**: N states of one drawing, stepped with `→` / `←`. Comes from `tween` and is re-exported so a deck needs one import; needs no `mark`. `still:` says which state the PDF shows (`-1`, the last, by default). |
| `reveal(n, (step, at) => …)` | Frames from **one** description: the body is rendered once per frame and each part says when it arrives, e.g. `at(2, thing)`. Before its frame, content keeps its space (so nothing is laid out again and nothing jumps) and anything else is `none`, which switches a stroke or a fill off. |
| `layers(key, meet: …, a, b, …)` | Layers of one picture, each its own mark (`key-1`, `key-2`, …). The last one sizes the stack; a `none` layer is left out, which is how a layer arrives. When it does, the layers already there glide as whole pictures instead of being redrawn. `meet` is the corner the arriving layer does not push (`bottom + right` for a picture that grows up and left). |
| `build(a, b, c)` | Frames that accumulate: `a`, then `a` and `b`, then all three. For content that flows, like a list or a stack of blocks, where later parts are meant to push the layout. |

`window.vit` is the deck's API for anything that displays or controls it. The
player's own chrome uses only this API, so it could be replaced entirely.

| | |
| --- | --- |
| `go(i, k)` · `next()` · `prev()` | move to a frame, or one step |
| `tap(x)` · `wheel(dy)` | drive it like a pointer: `x` is where across the page the press was, 0 to 1 |
| `hold(on)` | something else is using the pointer, so a press on the page does not turn it |
| `index` · `total` · `pages` | the frame on stage, how many frames, how many pages |
| `step` · `steps` | which step this frame is on (writable), how many it has |
| `speed` · `mode` | the pace (writable), and `"desk"` / `"present"` / `"overview"` (writable) |
| `label(i, k)` · `title(i)` · `note(i)` · `progress(i)` | a position's name, its page's caption and notes, how far through |
| `after(i, k)` | the position after this one: `{ index, step, page }`, `page` true if it is on another page |
| `moving` | whether a transition is in flight. While one is, the document is not hit-tested, so a pointer event's position is still correct but its target is not |
| `version` · `deck` | the package version, and the deck element the events are dispatched on |

Every event name is `vit:` followed by what has just happened; the three stages
of a move share the `move-` prefix. On every move the deck dispatches all three
on `.vit-deck`, in order:

| event | when |
| --- | --- |
| `vit:move-begin` | a move has been accepted and nothing has been captured yet |
| `vit:move-here` | the new position is in the DOM |
| `vit:move-done` | the move has finished |

`begin` carries `detail: { index, step, mode }` and says where the deck is
*going*. Nothing has been drawn yet, so `vit.index` is still the frame being
left, and a move cut short by the next one is a `begin` whose destination never
arrives. It exists so that another window showing this deck can start its own
move at the same time. `here` and `done` carry `detail: { index, step }` and say
where the deck *is*. At `here` the position is in the DOM but not yet on screen,
since what a page draws waits for the transition to end. A move with nothing to
animate settles at once, one cut short by the next settles where it stopped,
and opening the overview is a transition but not a move, so it dispatches none
of the three.

The deck also dispatches `vit:drawn` whenever it redraws (after a move or a
change of mode), with `detail: { index, step, mode }`, and `vit:ready` on
`document` once the deck is live.

The full reference is `docs/api.pdf`, generated by
[tidy](https://typst.app/universe/package/tidy) from the `///` comments in
`typst/lib.typ`; `npm run build` rebuilds it with the package.

### Transitions

`fade` (default, crossfade) · `slide` (horizontal push) · `rise` (vertical push)
· `zoom` (the new page shrinks into place from larger than life, the old one
grows away, both blurred by how far they are from the focal plane) · `wipe-left`
/ `wipe-right` / `wipe-up` / `wipe-down` (a reveal, named by the direction the
edge travels) · `none` (that side switches at once).

Page effects run while presenting, and at the desk they run inside the page's
box beside the rail: the same effect at the page's current size, clipped to that
box, while the surrounding UI stays put. In the overview there is no page
transition: the pages are thumbnails, and turning to another moves the
highlight. Marks morph in all three modes.

A string is the same effect both ways. `(enter: "slide", leave: "fade")` sets
how the new page comes in and how the old one goes out separately (`in` would be
the natural key, but it is a Typst keyword). Going back, the page being left
decides, so a transition always replays in reverse. A push moves a page by the
width or height of the screen but a mark only by its own size, so on a mark it
also fades.

The same dictionary carries the settings:

| setting | |
| --- | --- |
| `duration` | milliseconds |
| `easing` | four numbers, a cubic bézier |
| `zoom` | how many times life size a zoom starts at |
| `push` | how far slide and rise travel; negative goes the other way |
| `fit`, `anchor` | `fit: "none"` with `anchor: right + bottom` draws the states at their own size, pinned to the corner that does not move. Use it for a mark around an assembly that grows on one side: otherwise the group interpolates as a box and its images stretch into it, which smears. |

For example `(effect: "zoom", duration: 400, zoom: 6)`. Settings next to the
effects apply to the whole transition; settings inside a side apply to that side
and override the shared ones. Each setting is a variable `web/deck.css` reads,
so a typo is a compile error. The Typst side writes one CSS rule per set of
settings, and its name is passed as a view transition type on the page, or as a
`view-transition-class` on a mark. The presenter's speed keys still divide
every duration.

## Writing a deck

**Frames are not page jumps.** Several bodies in one `slide` are frames of one
page, and they transition like everything else, so "the second frame has one
more line" is an element-level interpolation. This is what `#pause` is meant to
look like, without parsing the content. To the audience a frame and an
animation step are the same thing (press once, advance one step), so a page's
**positions** are its frames and steps flattened into one sequence. `#9.3` in
the address bar is page 9, third position; the counter, the overview dots, the
progress bar and the speaker view all count that way. In the PDF each frame is
a page, as in a handout.

**Keep the picture whole.** `reveal(n, (step, at) => …)` renders the body once
per frame and each part says when it arrives, so the layout is identical on
every frame and the marks morph instead of the page shifting under them.
`layers` covers the other case: something that arrives _outside_ what is
already there and makes the picture bigger goes in a layer of its own, and the
layers already on the page glide to their new place as whole pictures. A layer
that reaches into an earlier one (an arrow into a diagram it does not draw)
draws that one's anchors hidden, so they are still laid out in the same place.

**What a mark can wrap.** `mark` puts its content in a box, because of
everything that can stand in a paragraph, only `box` and `block` carry a Typst
label into the SVG. A label on a `rect`, a `circle`, a canvas, an equation or
bare text produces no group, and the mark would silently not exist. A box is
atomic, so a marked run wider than the rest of the line takes a line of its
own: marking a word, a title or a figure costs nothing, but marking a whole
sentence mid-paragraph reflows the paragraph.

**In a formula**, give the mark an equation rather than bare math,
`$ #mark("sq")($x^2$) + #mark("lin")($b x$) = c $`, or the box will lay `b x`
out as markup, upright in the body font. Wrapped as an equation, the term is
typeset exactly as it would be unmarked. The operators stay part of the page
and cross-fade, which is invisible where they stay put but shows a double image
where they move, so mark the operators too if they travel.

**States are one drawing under different parameters.** `tween(s0, s1, …)`
compares the states node by node and passes every property that differs to
`el.animate()`: the path's `d`, `transform`, `fill` / `stroke`, `stroke-width`,
`opacity`, `x` / `y` / `width` / `height`. Duration and easing come from the
transition, so the presenter's speed keys apply too. In practice, write a
function of `t` and call it with a few values. A `fill` or `stroke` of `none`
against a colour becomes `transparent`, so the paint fades in instead of
appearing. Anything without an in-between cross-fades: text that changes
glyphs, a path against an arc, states with a different number of elements. To
choose where new vertices come from, draw every state with the same points and
stack the spare ones where they should start (the tutorial's "Designing the
states" page).

**Pin the bounding box.** A CeTZ canvas is sized by what it draws, so a ball at
+1.2 on one state and −1.2 on the next moves the box's edges and the origin
jumps. Draw an invisible `rect(…, stroke: none)` around the widest extent
first. `compat.cetz` does this for you for an element's own states.

**Continuous animation is declared by the drawing, not the deck.** It is written
where the moving thing is, with no DSL: the options are Web Animations' own
(`duration` in ms, `easing`, `direction`, `iterations`; infinite and linear by
default), passed to `el.animate()` as is. `waapi.animate(keyframes: …)` moves
one element: the tutorial's bouncing balls are five of them with piecewise
`easing` for gravity, a `scale` squash on the landing frame and a `delay` to
stagger them. `waapi.track` names a path and `waapi.animate(follow: …)` runs an
element's centre along it via CSS `offset-path`, so only `offset-distance`
changes, on the compositor; `orient: true` rotates it with the tangent.
`tween(..states, play: …)` plays a drawing's states over time instead of
stepping them, one animation per node, including a whole CeTZ canvas whose
parts move ([`tween`'s CeTZ layer](packages/tween/compat), `states(play:)`). A
drawing played this way adds no steps.

The deck only manages the lifecycle: animations start once the page transition
has finished, everything under a frame that is not on stage is paused, and
nothing plays under `prefers-reduced-motion`. An element written inside an
`html.frame` is dropped, so a declaration made inside a slide is attached to a
label and an ordinal, and the deck writes the list into the page without
reading it.

**Dashes interpolate**, which is useful when the effect cannot be expressed as
points: a pattern (a dashed stroke becoming solid, `(6pt, 6pt)` to
`(12pt, 0pt)`, with the period held constant so the dashes grow into their own
gaps instead of sliding along), or a run of ink moving along a path that stays
still (an empty dash, a gap up to where the ink starts, the ink, then a gap
longer than the path, so one number moves it). A line that simply grows from
its end does not need this: give the states their points and tween's path
reconciliation pads the shorter one. Every state has to carry the attribute
(write the solid one as a zero gap, not as no dash), or the states differ in
their attribute sets and the node cross-fades instead; `none` against an array
has no in-between either. Avoid `dash: (phase:)`; see Limitations.

**Don't write geometry relative to something that moves.** Between two states
the browser moves every vertex in a straight line at a constant speed, so a
trail listed behind a pen has all its vertices change velocity at every keyframe
and the figure judders at the state rate. Express it as fixed geometry whose
paint changes, or as a `stroke-dasharray` on one fixed path: four numbers that
interpolate. With paint on fixed geometry, the fade is sampled along the curve,
one value per piece, and each piece's own fading is the browser interpolating a
colour, so it is continuous in time; the choice left is how finely to cut. Cut
finer than the error would be visible: the tutorial's clef is cut so that its
longest piece is shorter than the pen dot is wide, so the lit end is off by less
than a piece, hidden under the dot. The number of states is also a sampling
rate: anything that turns more than half a turn between two states cannot be
recovered. Make the first state and the last equal and the loop has no seam.

**CeTZ.** A canvas exports native `<path>`s and pairs by key like text does. One
key for the whole canvas interpolates its position and size and cross-fades the
content. A transition interpolates boxes, not paths; bending one curve into
another is a job for element animation.

_Inside_ a canvas nothing is a mark: a canvas is one object, and what moves
within it is element animation, node by node. That is `tween`'s CeTZ layer,
`compat.cetz`. It belongs to tween, not vit, so it needs no deck and the same
drawing works in a blog post. It imports no CeTZ of its own: you pass it the
CeTZ module the document uses, and it returns `cetz.draw` with states allowed
on everything that draws.

```typst
#import "@preview/cetz:0.5.2"
#import "@preview/tween:0.1.0": compat

#let cz = compat.cetz.tweened(cetz)                              // once, per file

#cetz.canvas({
  let (circle, line, over) = cz                    // in place of cetz.draw
  line(..track, close: true)
  circle((over(-2, 0, 2), 1), radius: over(.3, .6, .3))
  circle((2, 1), radius: .3)                       // plain CeTZ, unchanged
})
```

| | |
| --- | --- |
| `compat.cetz.tweened(cetz)` | `cetz.draw`, with states. Every element function accepts `over(…)` in place of any argument; everything else (transformations, styles, coordinates, queries) is plain CeTZ. The dictionary also carries `over`, `states` and CeTZ's own `canvas`. |
| `over(a, b, …)` | In place of any argument, anywhere in it: N states of that element, stepped with `→`. Every marker in one call is walked in step, so the states are guaranteed to be one drawing under different numbers, with the same structure and only the numbers differing. That is what allows interpolating instead of cross-fading. |
| `states(..bodies, play:)` | The same, when more than one element varies together. `play` passes them to Web Animations and they run over time instead of being stepped. |

Such an element is still drawn where it stood, with its ink switched off, so its
`name`, its anchors, `()` and `intersections` behave as if the package were not
there, and the PDF is pixel-identical to the same canvas written without it.
The costs are a nested canvas per state at compile time, every state in the
file, and z-order: the element is atomic, so nothing can be drawn between its
parts. Without states, nothing changes at all.

The CeTZ version is not hard-coded. `tweened` takes the module and needs one
list from it, `needs`: seven `cetz.draw` functions and the two utilities CeTZ
exposes for measuring a body. The list is checked when you pass the module, so
a newer CeTZ that changed one of them reports what is missing instead of
drawing something slightly off. Nothing else is hard-coded either: the surface
is `dictionary(cetz.draw)`, wrapped whole, so a CeTZ that adds a shape keeps
it, and the drawing context is copied whole rather than field by field.
`tested` lists the versions `tools/cetz.typ` has been run against, and
`node tools/cetz.mjs` runs them again: six canvases, each drawn with states and
without, compared page pair by page pair with no tolerance.

The surface is a dictionary, opened by destructuring rather than `import`.
Typst imports from a module, a module is a file, and a file would have to name
one CeTZ version at the top, which a compatibility layer must avoid. Listing
the names also shows what is shadowed: inside that block `circle` is CeTZ's,
and Typst's is `std.circle`. A canvas that should be one object across a page
turn goes inside a `mark`, as in `mark("fig", cetz.canvas(…))`, and what is
inside it keeps animating: the page handles identity between objects, and the
object handles motion inside itself.

## Presenting

| Key | Action |
| --- | --- |
| `→` `↓` `PageDown` `Space` `Enter` `n` `j` | Next position: next step / next frame / next page |
| `←` `↑` `PageUp` `Backspace` `p` `k` | Previous position (from a later page, lands on this page's last position) |
| `Home` / `End` | First / last page |
| `1`–`9` | Jump to a page |
| `f` | Full screen |
| `Esc` / `Enter` | Desk ⇄ presenting: `Esc` puts the deck back on the desk, `Enter` presents the page shown there |
| `o` / `a` | Overview (`Esc` closes it). Click a thumbnail to open it; hover or click the dots in its corner to preview / open a position |
| `l` | Laser pointer |
| `b` / `.` | Black screen; the same key, or `Esc`, brings the page back |
| `-` / `=` / `0` | Slower / faster / reset (a factor on every duration, kept in `localStorage`) |
| `s` | Speaker view |
| `,` | Settings: speed, laser colour and size, tracer length, theme. Stored per presenter in `localStorage`, never in the file |
| `?` | The key table |
| Wheel | Next / previous page: one notch per page with a mouse, one gesture (inertia included) per page on a trackpad; in the overview it scrolls the grid |
| Click / swipe | Left third goes back, the rest goes forward; swipe left / right on touch. While a transition runs the page is a static image and ignores clicks |

The deck opens on the **desk**: pages down the left as thumbnails, the selected
one next to them, its notes underneath. Clicking a thumbnail or a dot in its
corner selects it, `Enter` presents from there, `Esc` comes back. The address
bar shows the selected position, so a `#page.position` link opens the desk
there, and `window.vit.mode = "present"` opens straight into the presentation.

The **overview** shows one thumbnail per page (the current frame on the page
you are on, the finished page elsewhere) and zooms a page into place when you
open it. The **laser pointer** is a system cursor with a mouse and a DOM dot on
touch or pen; while it is on, taps and swipes do not turn pages.

The **speaker view** (`s`) opens a window you can drag to another screen, with a
progress bar, the current and next page, notes, a clock, and its own chrome: a
toolbar, the key table and the settings panel, so anything you open from it
appears on your screen rather than in front of the audience. Its previews are
iframes loading this same HTML at a `#page.position` hash, so nothing is
rendered twice. The current page is a true mirror: the page change plays out
there as it does in front of the audience, and a page's own drawings start at
the same moment in both windows. The next page is not a mirror, since what it
shows has not happened yet, so it changes instantly and stays readable. Keys and
clicks in that window control the main one, except for the keys that open the
help and the settings. It works over `file://` and closes with the main window.

The clock times the talk, not the window: it stays at `00:00` until the deck
first goes on stage, however long before that you opened it. After that it
keeps running through everything, including time at the desk, a black screen,
or a question away from the slides. Click it to restart from zero.

At the desk, the boundary between the rail and the page, and the one between
the page and its notes, are marked with three dots and can be dragged: the rail
takes the width you give it, the notes the height. Double-click a boundary to
reset it. Both sizes are remembered by your browser, like the theme and the
speed.

The toolbar in the bottom-right corner always shows at the desk and in the
overview. While a page is being shown, it only appears while you reach for it
(the pointer in that corner, or keyboard focus in the toolbar) and hides as soon
as you stop. Hidden, it cannot be clicked: that corner belongs to the page, and
a press there turns the page like anywhere else. On devices without a hovering
pointer (a touchscreen) it stays visible. Its PDF button is a real
`<a download target="_blank">`, so it never navigates the deck away
mid-presentation.

## Limitations

- **Z-order changes**: hoisted regions are painted above the page. A marked
  element that was under other content comes out on top.
- **Overflow is clipped silently**: a page is a fixed-size block; content that
  does not fit is invisible in both the PDF and the HTML, identically, but
  nothing warns.
- **Mid-transition is a bitmap**: View Transition snapshots are textures, so a
  large size change is blurry halfway and sharp at both ends, as in Keynote's
  Magic Move.
- **Glyph-level morphing** between two marks is out of scope; at that level
  each glyph must be animated by hand.
- **`dash: (phase:)` is not portable**: Typst writes it to `stroke-dashoffset`
  without flipping the sign, so the PDF and the browser draw the dash in
  different places. Put the position in the dash array instead (a zero-length
  dash, a gap up to where the ink starts, the ink, then a gap longer than the
  path), and both agree. That leading zero-length dash needs **butt caps**: a
  zero-length dash with a round or square cap is painted, and leaves a dot on
  the path's first point.

## How it works

`mark` is a Typst label; `hoist.js` lifts the labelled SVG group into an HTML
host that can carry a `view-transition-name`; the browser does the pairing; the
Typst side writes every transition as CSS and the runtime only adds `fwd` or
`back`. The details are in [docs/internals.md](docs/internals.md).

`html.frame` outputs glyph outlines, so rendering is Typst's own, and
`tools/verify.mjs` compares the PDF and the HTML page by page.

## Files

```
typst/typst.toml    package manifest; its version names the build's directory
typst/lib.typ       entry point: deck / slide / mark
typst/chrome/       the player's own markup, in Typst: bar, desk (rail, pane, notes), help, icons, laser, settings, speaker
web/deck.css        page SVG layout, the three modes, toolbar, laser, speaker view (the effects are written by lib.typ)
web/hoist.js        lifts marked <g>s into HTML-level <svg> hosts with a view-transition-name
web/runtime.js      the deck: model, element-animation steps, continuous animation, transitions, the rail, mode zooms, and window.vit
web/chrome.js       what floats over it: toolbar, laser pointer, settings panel, key help, black screen, speaker view
build.mjs           builds the package (typst/, README and LICENSE copied, web/ minified with esbuild into web/ beside them) and docs/api.pdf (--watch to rebuild on save)
dist/<version>/     the package as built, ready to import; not committed
examples/tutorial.typ  the tutorial deck: the API, page by page, code beside result
docs/api.typ        API reference, generated by tidy from lib.typ
tests/fixture.typ   a six-page deck with the cases the invariants need
tests/cdp.mjs       a Chrome DevTools Protocol driver in one file: no package to install
tests/invariants.mjs  properties every build must have, whatever the deck says
tools/paths.mjs     paths.js under Node against a table of cases
tools/check.mjs     region geometry at four window sizes, pairing chains, clone clean-up, console errors
tools/verify.mjs    PDF ↔ HTML pixel comparison, frozen mid-transition frames
tools/clef.py       derives the tutorial's clef from a font glyph: skeleton, Eulerian trail, offset outline
tools/cetz.mjs      the CeTZ layer against several CeTZ versions, page pair by page pair
tools/cetz.typ      one canvas drawn twice, with states and without: the pages must match, compiled by cetz.mjs
packages/tween/lib.typ      the entry point: everything a document imports comes through it
packages/tween/states.typ   the states themselves, so the layers under compat/ can build on them
packages/tween/waapi.typ    Web Animations from Typst, and how a declaration gets out of a frame
packages/tween/tween.js     the engine: the label grammar, the states, the keyframes each node needs
packages/tween/waapi.js     Web Animations from Typst, and an element run along a path
packages/tween/paths.js     path data: two states whose paths are not the same list of commands, reconciled
packages/tween/compat/cetz.typ    cetz.draw with the states of a drawing on every element
```

`node tests/invariants.mjs` builds the package, compiles the fixture and checks
it. Give it a path to check a deck that is already built
(`node tests/invariants.mjs examples/tutorial.html`); nothing is rebuilt then.
It needs `typst` on PATH and finds a Chrome by itself (`CHROME=` overrides).
Each check tests a property rather than a single case (one press is one
position, no name is used twice, one picture per thumbnail, every capture
succeeded, a modal keeps the deck where it is), because the bugs found so far
have all been of that kind. A property the deck under test cannot exercise is
reported as `n/a`, not counted as passed.

`tools/` need `playwright` (`paths.mjs` only needs Node); `verify.mjs` and
`cetz.mjs` need `pdftoppm` (poppler) and `compare` (ImageMagick) instead, and
no browser. To inspect a transition, take over `document.startViewTransition`,
`await vit.ready`, then pause and seek every animation from
`document.getAnimations()`. A screenshot on a timer is hundreds of milliseconds
late and makes any transition look like a jump.

## Related work

| Project | Typst → HTML slides | Animation |
| --- | --- | --- |
| [Typstage](https://github.com/Loewe1000/typstage) | pages as inline SVG | Web Animations, glyph-by-glyph shape matching |
| [slipst](https://github.com/Wybxc/slipst) | yes (vertical "slips") | its own CSS/JS sliding |
| [Bifold](https://forum.typst.app/t/bifold-simple-web-presentation-with-typst/9467) | yes (proof of concept) | no transitions |
| [Touying](https://typst.app/universe/package/touying/) / [Polylux](https://github.com/polylux-typ/polylux) | no (PDF) | PDF-side reveal steps |
| [Marp](https://github.com/orgs/marp-team/discussions/168) / [Slidev](https://sli.dev) | no (Markdown) | View Transitions, from Markdown |

MIT.
