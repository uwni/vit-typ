# tween

Several states of one Typst drawing, and the browser moves between them. The
PDF gets a still; the HTML gets the motion. Nothing here is a presentation
framework — it is a figure that moves, in whatever HTML document you are
writing.

```typst
#import "@preview/tween:0.1.0" as tw

#html.elem("style", tw.css)     // the two strings, wherever you want them:
#html.elem("script", tw.js)     // inline, bundled, or served with a hash

#let dial(t) = box(width: 120pt, height: 60pt, {
  place(left + horizon, circle(radius: 20pt, stroke: 2pt + red))
  place(left + horizon, dx: 20pt - t * 1pt, line(length: t * 1pt, stroke: 2pt))
})

#tw.tween(dial(10), dial(40), dial(70), name: "dial")
```

The states are **the same drawing under different numbers** — same structure,
only the values differ. The browser is handed two of them and interpolates the
SVG nodes: the path's `d`, the transform, colours, stroke width, opacity,
`x`/`y`/`width`/`height`. So write a function of a parameter and feed it a few
values. What has no in-between — text that changes glyphs, a path that cannot be
aligned, states of a different structure — cross-fades instead, which is the
same answer the browser gives at page level.

|||
|---|---|
|`tween(..states, name:, still:, play:)`|The states, stacked in one box: the first is in the flow, the rest are placed on it, so nothing is ever re-laid-out and the box never moves. `name` lets a host find this drawing; `still` says which state the PDF shows (`-1`, the last, by default); `play` gives Web Animations options and the states are played over time instead of left to be stepped.|
|`css`, `js`|The stylesheet and the runtime, as strings. Static — nothing in them depends on your document — so bundle them, inline them, cache them by hash. Both are idempotent: a page that carries them twice is only a few bytes heavier.|
|`host(body)`|For a document that puts drawings inside `html.frame`s of its own: `#show: host` says once that this is an HTML document, which `target()` cannot report from inside a frame, and carries the drawings' own declarations out of those frames. A host with a runtime of its own may write that script itself (`declarations()`).|
|`waapi.animate(body, keyframes:, …)`|The layer underneath: Web Animations from Typst, for moving a whole element rather than the parts inside one drawing.|
|`waapi.track(name, body)`, `waapi.animate(follow: name)`|A path, named, and something running along it. The name is this package's to give out, so nothing you label yourself can collide with it.|

## Driving it

Nothing steps by itself. The runtime exposes what a driver needs and no policy:

```js
tween.boxes(root)          // the containers in a subtree, outermost first
tween.states(box)          // its states, by index
tween.nodes(states, label) // the nodes of each state, or null if they differ in structure
tween.frames(column, label)// one node across the states → keyframes, and whether it must cross-fade
tween.plays(box)           // whether this drawing said it plays rather than steps
tween.play(box, o, role)   // play its states over time; the animations come back to you
waapi.animate(el, frames, o, role)   // el.animate, with the options as the spec writes them
waapi.of(scope, role)                // what is animating under an element, asked of the browser
```

A click, a scroll position, an `IntersectionObserver`, a timer, a slide deck's
arrow keys — the choice is the document's, not the library's. A drawing that
declared `play:` starts by itself; what a host may still want is the lifecycle —
pausing what is off screen, and resuming it — which is `getAnimations` and needs
nothing from here.

## waapi

`waapi.typ` and `waapi.js` ship here rather than as a package of their own: a
binding to the Web Animations API, in which keyframes and options are the API's
own and are handed to `el.animate()` as they are. There is no second vocabulary
to learn and nothing to keep in step with the spec.

```typst
#tw.waapi.animate(
  keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")),
  duration: 6000,
)[#html.frame(circle(radius: 8pt))]
```

It keeps no registry: `el.getAnimations({ subtree: true })` is one already, and
the role an animation plays for its host rides on `Animation.id`. What it adds
beyond the binding is `follow(el, path, o, origin)` — an element run along an
SVG path, sampled into the coordinates `offset-path` wants.

## How it reaches the browser

A Typst label is the only identity the SVG export carries, and it lands on a
`box` — so every state is a box with a label, and the runtime reads that
grammar once and writes attributes:

|label|attribute|
|---|---|
|`tween` / `tween:name`|`data-tween` — a container, holding the name|
|`tween@i`|`data-tween-at` — one of its states|
|`tween-play@k` / `waapi-anim@k`|the k-th declaration, whose options the host carried out of the frame|
|`waapi-track:name`|a named path for something to follow|

An element written inside an `html.frame` is dropped on the floor, so what a
drawing says about itself (`play:`, `waapi.animate`'s options) can only ride on
a label. Where an element *can* be written the declaration is one — a custom
element, `<tween-play>` or `<waapi-anim>`, around what it moves, and the browser
says when it is in the document, so there is no sweep and no "already done"
flag. Inside frames the declaration becomes a label with an ordinal, and the
host emits the same element at the end of its body pointing back at it. The host
carries it and never reads it.

A state belongs to the nearest container above it, so the same name twice in a
document is two drawings, and a drawing inside a state is an ordinary node.

Labels only survive inside an `html.frame` — that is where the SVG export runs —
so `tween` makes the frame itself at the top of an HTML document. Inside a host
that has already made one, it must not: `target()` reports the paper the frame
is laid out as, and the host says which case it is with `host`.

## What it costs

- The PDF is one state; the HTML carries them all, so a drawing with N states is
  N drawings in the file. `states × paths per state` is that figure's size.
- Two states interpolate only if the browser can read them as the same value;
  `paths.js` reconciles path data that is written differently (`H` against `L`,
  `S` against `C`, a line against a curve, a subpath that is one segment short)
  so that the two are the same list of commands. What it cannot align
  cross-fades, and says so in the console.
- Nothing plays under `prefers-reduced-motion` unless a host asks for it.

`node tools/paths.mjs` checks the path reconciliation against a table of cases —
every branch of it, in Node, no browser.
