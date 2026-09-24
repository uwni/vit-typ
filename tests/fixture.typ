// A small deck for the invariant suite. Each page covers a case the checks
// need: several frames on one page, steps inside one frame, a key that recurs
// across pages (so the rail holds it many times over), a split, and a page
// with a transition of its own.
//
//   typst compile --root . --features html tests/fixture.typ out.html
// The package as built (`npm run build`), not typst/: only the build has the
// scripts and the stylesheet beside lib.typ.
#import "../dist/0.1.0/lib.typ": *
#import "@local/tween:0.1.0": tween, waapi

#let blue = rgb("#7aa2ff")
#let green = rgb("#8ce99a")
#let amber = rgb("#ff9f45")
#let sq(fill, w: 80pt) = box(width: w, height: 80pt, fill: fill, radius: 6pt)

#show: deck.with(title: "vit fixture", width: 640pt, height: 360pt, duration: 120)

// 1 · one frame, nothing marked: the plain case and the deck's own transition
#slide(title: "Plain", note: [Nothing on this page morphs.])[
  #align(center + horizon, text(40pt)[Plain])
]

// 2 · two frames of one page: navigation walks them, the rail shows one
//     thumbnail with two dots
#slide(title: "Two frames")[
  #place(left + horizon, mark("box", sq(blue)))
][
  #place(left + horizon, mark("box", sq(blue)))
  #place(right + horizon, sq(green))
]

// 3 · the same key once more, so `box` is on three pages at once wherever the
//     rail is up, where its name has to be suppressed
#slide(title: "Same key", note: [`box` crosses from the page before.])[
  #place(right + horizon, mark("box", sq(blue, w: 160pt)))
  #place(left + top, mark("solo", transition: "zoom", sq(amber)))
]

// 4 · steps inside one frame: four states of one drawing
#slide(title: "Steps")[
  #align(center + horizon, tween(..range(4).map(k => sq(green, w: 40pt + 40pt * k))))
]

// 5 · a transition of this page's own, and the one dot the next page splits
#slide(title: "Own transition", transition: (effect: "slide", duration: 90))[
  #place(center + horizon, mark("dot", circle(radius: 24pt, fill: amber)))
]

// 6 · the split: one dot on the page before, three here
#slide(title: "Split", note: [One becomes three.])[
  #place(left + horizon, mark("dot", circle(radius: 16pt, fill: amber)))
  #place(center + horizon, mark("dot", circle(radius: 16pt, fill: amber)))
  #place(right + horizon, mark("dot", circle(radius: 16pt, fill: amber)))
]

// 7 · a drawing that plays itself: not stepped, and it must run only while
//     its page is on stage
#slide(title: "Played")[
  #align(center + horizon, tween(
    play: (duration: 800, iterations: none),
    ..range(4).map(k => sq(amber, w: 40pt + 30pt * k)),
  ))
]

// 8 · an element running along a path: the path is measured in pixels against
//     the frame's own box, so it is only right once the frame is on screen
#slide(title: "Follow")[
  #place(dx: 120pt, dy: 60pt, waapi.track("orbit", polygon(
    stroke: 1.5pt + blue,
    (0pt, 0pt), (160pt, 0pt), (160pt, 90pt), (0pt, 90pt),
  )))
  #place(dx: 120pt, dy: 60pt, waapi.animate(follow: "orbit", duration: 3000)[
    #circle(radius: 8pt, fill: green)
  ])
]

// 9 · layers of one picture, hung from the point the layers share. The point
//     is named with `anchor` in both and sits in the middle of the picture, not
//     at a corner: the second layer grows to the left, so the first has to move
//     for the green box to stay where it is.
#let pin(body) = anchor("pin", body)
#slide(title: "Layers")[
  #place(center + horizon, layers("pic", box(pin(sq(green, w: 40pt)))))
][
  #place(center + horizon, layers(
    "pic",
    box(pin(sq(green, w: 40pt))),
    box({ sq(amber, w: 40pt); h(10pt); pin(sq(green, w: 40pt)) }),
  ))
]

// 10 · several states of one drawing inside a mark, which is what the mark
//      docstring recommends, and a mark that has not arrived yet: `veil` keeps
//      its place and tells the deck not to draw it.
#slide(title: "Marked tween")[
  #place(left + horizon, mark("grow", tween(..range(3).map(k => sq(blue, w: 30pt + 25pt * k)))))
  #place(right + horizon, veil(mark("later", sq(amber, w: 40pt))))
][
  #place(left + horizon, mark("grow", tween(..range(3).map(k => sq(blue, w: 30pt + 25pt * k)))))
  #place(right + horizon, mark("later", sq(amber, w: 40pt)))
]
