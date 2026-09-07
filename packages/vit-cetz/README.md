# vit-cetz

[CeTZ](https://typst.app/universe/package/cetz) for [vit](../../README.md):
`cetz.draw` with an identity on every element, so the parts of one canvas can
travel separately.

A canvas exports native `<path>`s, and a `mark` around the whole of one
interpolates its box and cross-fades its picture. What moves has to be one
picture — so parts that move apart from each other used to need a canvas and a
`mark` each, placed on the page by hand, with the drawing's own coordinates lost
in the process. With a `key`, the element carrying it is a mark of its own,
inside the canvas, in canvas coordinates.

```typst
#import "@preview/cetz:0.4.1"
#import "@preview/vit-cetz:0.1.0": keyed

#let cz = keyed(cetz)                              // once, per file

#cetz.canvas(length: 1cm, {
  let (circle, line) = cz                          // in place of cetz.draw
  line(..track, close: true, key: "track")
  circle(track.first(), radius: .16, key: "dot")   // travels on its own
  circle((2, 1), radius: .3)                       // plain CeTZ, no key
})
```

|||
|---|---|
|`keyed(cetz)`|Everything `cetz.draw` has, with the element functions taking `key` and `transition`; everything else passed through untouched. Plus `over`, `states` and CeTZ's own `canvas`.|
|`key`|The name this element travels under — letters, digits, `_` and `-`, as in `mark` — or `auto` for the element's own `name`. The same key on the next page and the browser interpolates one into the other.|
|`transition`|This element's own enter/leave effect, as in `mark(transition:)`, for when it is on one page and not the other.|
|`(vt-over: (a, b, …))`|In place of any argument: N states of that element, stepped with `→` / `←`. Every marker in one call is walked in step, so the states are one drawing under different numbers by construction. A plain dictionary — there is nothing to import, and `#let over(..v) = (vt-over: v.pos())` in your deck if you want the spelling.|
|`states(key, ..bodies)`|The same, when more than one element varies together.|

## Why it takes your CeTZ

A compatibility layer that imported a CeTZ of its own would make every canvas in
the deck that CeTZ: the elements it builds carry that version's context, and one
canvas cannot hold two. So `keyed` takes the module — `keyed(cetz)`, the module
itself, not `cetz.draw`.

That is also why the surface is a dictionary opened by destructuring rather than
by `import`: Typst imports from a module, and a module is a file with a version
written at the top. Naming the names is no loss — it says what is shadowed, and
shadowing is the point: inside that block `circle` is CeTZ's, and Typst's is
`std.circle`.

## What it knows about CeTZ

As little as it can, and all of it in one place.

- The surface is `dictionary(cetz.draw)`, wrapped whole — no list of what draws
  to keep in step with CeTZ, so a version that adds a shape has it keyed too.
- The drawing context handed to the inner canvas is the outer one, copied whole
  rather than field by field.
- What it calls is `needs`: seven `cetz.draw` functions, plus `process.many` and
  `util.resolve-body`, the utilities CeTZ's own `lib.typ` exposes and its
  `group` measures a body with. `keyed` checks for them when you hand the module
  over and names what is gone — a missing name is a compile error, not something
  placed a hair off.
- The version is *not* a gate. `tested` says what has actually been run, most
  recent last; anything else is taken at its word.

## Checking it

`test.typ` beside this file is six canvases, each drawn twice — with keys and
without — as two pages that have to be pixel-identical. It is the whole claim in
a form a machine can check, including the ones that are easy to get wrong: under
a rotation and a scale, with several states, with `intersections` reading the
keyed element, and in a canvas whose `set-style` would otherwise pad, frame or
scale the placement.

```sh
node tools/cetz.mjs              # every version in `tested`, newest patch of each
node tools/cetz.mjs 0.4.1 0.5.2  # the ones you name
```

Needs `pdftoppm` (poppler) and `compare` (ImageMagick); no browser. Bumping CeTZ
is: run it, and if it is green, add the minor to `tested`.

## What it does, and what it costs

A label is the only identity the SVG export carries, and a label lands on a
`box`, never on a path. So a keyed element is drawn a second time in a canvas of
its own — one handed the outer canvas's drawing context whole, so its units,
transform, styles, named nodes and current point are the outer one's — and that
canvas is placed back exactly where the element was. The copy left behind draws no ink, which is why the element's
`name`, its anchors, `()` and `intersections` behave as if this package were not
here.

- The PDF is pixel-identical to the same canvas written without keys.
- A keyed element costs a nested canvas at compile time and a hoisted region at
  run time. A few dozen on a page is nothing; a few hundred is a decision.
- A keyed element is atomic in z: nothing can be drawn between its parts.
- A gradient inside one is relative to that element's own canvas.
- Without a key, the function is CeTZ's own and costs nothing.

`mark` still carries a *whole* canvas from page to page, and a keyed element may
not sit inside the states of one: there the nodes are compared one by one and
everything stays put.
