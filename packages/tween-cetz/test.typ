// vit-cetz — the whole claim, as a document: a keyed canvas draws exactly what
// the same canvas draws without keys.
//
// Every case is two pages: the plain CeTZ one first, the keyed one second. The
// test is that the pair is *pixel-identical* — no tolerance, no fuzz. That is
// what says the wrapping is only about identity and never about geometry: the
// box is measured, not guessed, and a style the canvas has set does not leak
// into the placement.
//
//   node tools/cetz.mjs              every version in `tested`
//   node tools/cetz.mjs 0.4.1 0.5.2  the ones you name
//
// or by hand, editing the import below:
//
//   typst compile --root . packages/vit-cetz/test.typ /tmp/t.pdf
//   pdftoppm -png -r 150 /tmp/t.pdf /tmp/p
//   magick compare -metric AE /tmp/p-01.png /tmp/p-02.png null:   # 0, and so on
//
// tools/cetz.mjs rewrites the next line for each version it checks.
#import "@preview/cetz:0.4.1"
#import "lib.typ": keyed

#let cz = keyed(cetz)
#set page(width: 340pt, height: 240pt, margin: 10pt, fill: white)

// ── 1. a keyed element among plain ones ──────────────────────────────
// its name is still its own, its anchors still resolve from outside, and the
// current point after it is where it left it
#let one(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (circle: kcircle, content: kcontent) = cz
  rect((-1, -1), (5, 3), stroke: none)
  line((-0.5, -0.5), (4.5, 2.5), stroke: 2pt + blue)
  if k {
    kcircle((1, 1), radius: 0.5, fill: red, stroke: 1pt + black, name: "c", key: "ball")
    kcontent((1, 1), text(fill: white)[x], key: "x")
  } else {
    circle((1, 1), radius: 0.5, fill: red, stroke: 1pt + black, name: "c")
    content((1, 1), text(fill: white)[x])
  }
  line((0, -0.6), "c.south", stroke: 1pt + green)
  circle((), radius: 0.15, fill: purple)
})

// ── 2. under a rotation and a scale ──────────────────────────────────
// the box is in the transformed space; placing it through the CTM again is the
// mistake this catches
#let two(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (circle: kcircle) = cz
  rotate(12deg)
  scale(1.1)
  rect((-1, -1), (5, 3), stroke: none)
  if k { kcircle((1, 1), radius: 0.5, fill: red, key: "ball") } else { circle((1, 1), radius: 0.5, fill: red) }
  circle((3, 2), radius: 0.3, fill: green)
})

// ── 3. states, as over() on the arguments ────────────────────────────
// the control is what the wrapper is expected to draw: every state in the box
// of them all (the pin), and the last state on top, which is what a PDF shows
#let three(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (circle: kcircle, over) = cz
  rect((-1, -1), (5, 3), stroke: none)
  if k {
    kcircle((over(1, 2, 3.5), 1), radius: over(0.3, 0.5, 0.8), fill: red, key: "ball")
  } else {
    rect((0.7, 0.5), (4.3, 1.8), stroke: none, fill: none)
    circle((3.5, 1), radius: 0.8, fill: red)
  }
  circle((0, 2.5), radius: 0.2, fill: green)
})

// ── 4. what else reads a drawing ─────────────────────────────────────
// intersections with a keyed circle, key: auto off the element's name, a keyed
// element inside a plain group (whose bounds must not move), and a keyed group
#let four(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (circle: kcircle, rect: krect, group: kgroup) = cz
  rect((-1, -1), (6, 3), stroke: none)
  intersections("i", {
    if k {
      kcircle((1.5, 1), radius: 0.8, stroke: 2pt + blue, name: "c", key: auto)
    } else {
      circle((1.5, 1), radius: 0.8, stroke: 2pt + blue, name: "c")
    }
    line((-0.5, 0.2), (4, 2), stroke: 1pt + gray)
  })
  circle("i.0", radius: 0.12, fill: orange)
  circle("i.1", radius: 0.12, fill: orange)
  group(name: "g", {
    if k { krect((3, 0), (4.2, 1.2), fill: aqua, key: "box") } else { rect((3, 0), (4.2, 1.2), fill: aqua) }
    circle((4.6, 1.6), radius: 0.2, fill: purple)
  })
  line("g.south-west", (0, -0.8), stroke: 1pt + green)
  let body = {
    hobby((4.6, -0.6), (5.2, 0.4), (5.8, -0.4), stroke: 1.5pt + red)
    content((5.2, 1.2), [h])
  }
  if k { kgroup(name: "h", key: "grp", body) } else { group(name: "h", body) }
  line("h.north-west", "h.south-east", stroke: 0.5pt + black)
})

// ── 5. several elements varying together ─────────────────────────────
#let five(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (states,) = cz
  rect((-1, -1), (5, 2.5), stroke: none)
  if k {
    states(
      "pen",
      ..range(0, 4).map(i => {
        line((0, 0), (i, 1.5), stroke: 1.5pt + blue)
        circle((i, 1.5), radius: 0.2, fill: red)
      }),
    )
  } else {
    rect((-0.2, -0.2), (3.2, 1.7), stroke: none, fill: none)
    line((0, 0), (3, 1.5), stroke: 1.5pt + blue)
    circle((3, 1.5), radius: 0.2, fill: red)
  }
})

// ── 6. a canvas whose styles would move the placement ────────────────
// content padding, a content frame and auto-scale are all set here: the
// placement has to be deaf to them, or the keyed element drifts, gets a border,
// or is scaled twice
#let six(k) = cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let (circle: kcircle, content: kcontent) = cz
  set-style(content: (padding: 0.3, frame: "rect", stroke: 1pt + olive, auto-scale: true))
  scale(1.2)
  rect((-1, -1), (5, 3), stroke: none)
  if k {
    kcircle((1.5, 1), radius: 0.6, fill: red, key: "ball")
  } else {
    circle((1.5, 1), radius: 0.6, fill: red)
  }
  content((3.4, 1), [framed])
})

#let cases = (one, two, three, four, five, six)
#for f in cases {
  f(false)
  pagebreak()
  f(true)
  if f != cases.last() { pagebreak() }
}
