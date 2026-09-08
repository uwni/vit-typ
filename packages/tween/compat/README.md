# tween-cetz

[CeTZ](https://typst.app/universe/package/cetz) for [tween](../tween):
`cetz.draw` with the states of a drawing on every element, so a part of one
canvas moves while the rest of it stays put.

A canvas is one object. What happens inside it is Web Animations' work — two
states of the same drawing, interpolated node by node — and that is what this
hands you: CeTZ's own drawing surface, with one more named argument. It imports
no CeTZ of its own, and it needs no slide deck; a canvas moves in a blog post as
it does in a talk.

```typst
#import "@preview/cetz:0.5.2"
#import "@preview/tween-cetz:0.1.0": tweened, host, css, js

#let cz = tweened(cetz)                              // once, per file
#show: host                                        // an HTML document says so once

#html.elem("style", css)
#html.elem("script", js)

#html.frame(cetz.canvas(length: 1cm, {
  let (circle, line, over) = cz                    // in place of cetz.draw
  circle((over(-2, 0, 2), 1), radius: over(.3, .6, .3))
  line((-3, 0), (3, 0))                            // plain CeTZ, unchanged
}))
```

|                     |                                                                                                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tweened(cetz)`     | Everything `cetz.draw` has, with `over(…)` allowed in place of any argument; everything else passed through untouched. Plus `over`, `states` and CeTZ's own `canvas`.                                                                                                                                    |
| `over(a, b, …)`     | In place of any argument, anywhere inside it: N states of that element. Every `over` in one call is walked in step, so the states are one drawing under different numbers _by construction_ — same structure, only the numbers differ, which is the condition for interpolating instead of cross-fading. |
| `states(..bodies, play:)` | The same, when more than one element varies together. `play` hands them to Web Animations and they run over time instead of being stepped.                                                                                                                                                                                                                                                    |
| `host`, `css`, `js` | `tween`'s own, passed through so that one import does.                                                                                                                                                                                                                                                   |

Nothing steps by itself: `tween`'s runtime exposes the states and the keyframes,
and what advances them is the document's business — a click, a scroll position,
a deck's arrow keys.

## Why it takes your CeTZ

A compatibility layer that imported a CeTZ of its own would make every canvas in
the document that CeTZ: the elements it builds carry that version's context, and
one canvas cannot hold two. So `tweened` takes the module — `tweened(cetz)`, the
module itself, not `cetz.draw`.

That is also why the surface is a dictionary opened by destructuring rather than
by `import`: Typst imports from a module, and a module is a file with a version
written at the top. Naming the names is no loss — it says what is shadowed, and
shadowing is the point: inside that block `circle` is CeTZ's, and Typst's is
`std.circle`.

## What it knows about CeTZ

As little as it can, and all of it in one place.

- The surface is `dictionary(cetz.draw)`, wrapped whole — no list of what draws
  to keep in step with CeTZ, so a version that adds a shape has states too.
- The drawing context handed to the inner canvas is the outer one, copied whole
  rather than field by field.
- What it calls is `needs`: seven `cetz.draw` functions, plus `process.many` and
  `util.resolve-body`, the utilities CeTZ's own `lib.typ` exposes and its
  `group` measures a body with. `tweened` checks for them when you hand the module
  over and names what is gone — a missing name is a compile error, not something
  placed a hair off.
- The version is _not_ a gate. `tested` says what has actually been run, most
  recent last; anything else is taken at its word.

## Checking it

`test.typ` beside this file is six canvases, each drawn twice — with states and
without — as two pages that have to be pixel-identical. It is the whole claim in
a form a machine can check, including the ones that are easy to get wrong: under
a rotation and a scale, with several states, with `intersections` reading the
element, and in a canvas whose `set-style` would otherwise pad, frame or scale
the placement.

```sh
node tools/cetz.mjs              # every version in `tested`, newest patch of each
node tools/cetz.mjs 0.4.1 0.5.2  # the ones you name
```

Needs `pdftoppm` (poppler) and `compare` (ImageMagick); no browser. Bumping CeTZ
is: run it, and if it is green, add the minor to `tested`.

## What it does, and what it costs

A label is the only identity the SVG export carries, and a label lands on a
`box`, never on a path. So the element is drawn once per state in a canvas of
its own — one handed the outer canvas's drawing context whole, so its units,
transform, styles, named nodes and current point are the outer one's — and that
stack is placed back exactly where the element was. The copy left behind draws
no ink, which is why the element's `name`, its anchors, `()` and `intersections`
behave as if this package were not here.

- The PDF is pixel-identical to the same canvas written without any of this, and
  shows one state (the last).
- Every state is a drawing in the file: `states × paths per state` is what a
  moving element costs.
- Such an element is atomic in z: nothing can be drawn between its parts.
- A gradient inside one is relative to that element's own canvas.
- Without `over`, the function is CeTZ's own and costs nothing.

Identity _between_ canvases is a different thing and not this package's. A
canvas that is one object across a page turn is a canvas inside a
[vit](../../README.md) `mark` — `mark("fig", cetz.canvas(…))` — and what is
inside it goes on moving as it does anywhere else.
