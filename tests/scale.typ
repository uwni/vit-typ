// A deck two hundred pages long. Nothing may grow with the page count: not the
// show-rule depth (Typst stops at 64), not the layout passes (two), not the
// number of regions the browser fails to move. Two frames a page, a mark, a
// veiled mark around a tween, and an equation: what the invariants compile and
// count, nothing they look at.
#import "../dist/0.1.0/lib.typ": *
#import "@local/tween:0.1.0": tween
#let sq(w) = box(width: w, height: 20pt, fill: rgb("#7aa2ff"))
#show: deck.with(title: "scale", width: 640pt, height: 360pt)
#for i in range(200) {
  slide(title: "page " + str(i + 1), ..reveal(2, (step, at) => [
    #mark("a", transition: "rise", sq(30pt))
    #at(2, mark("b", tween(sq(20pt), sq(40pt))))
    #mark("c" + str(i), [$x_#i$])
  ]))
}
