// One compile per format:
//
//   typst compile --root . examples/demo.typ examples/out/demo.pdf
//   typst compile --root . --features html examples/demo.typ examples/out/demo.html
//
// Once published, replace the next line with #import "@preview/vtslides:0.1.0": *
#import "../lib.typ": *
#import "@preview/cetz:0.4.1"
// Other people's packages, unchanged: theorion writes the theorem environments,
// fletcher draws the commutative diagrams. Both have an HTML branch of their own,
// and neither of them takes it here — a slide is an html.frame, and inside a frame
// the target is the paged one, so what they draw is a picture, which is what
// vtslides can move. `import cosmos.simple: *` brings theorion's environments
// (amsthm style: numbered, bold supplement, italic body, ∎); fletcher is imported
// by name so its own `marks` never shadows vtslides' `mark`.
#import "@preview/theorion:0.6.0": *
#import cosmos.simple: *
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

#show: show-theorion

#let dim = rgb("#8992a5")
#let hi = rgb("#f2f4f8")
#let B(body) = text(size: 40pt, weight: 700, fill: rgb("#7aa2ff"), body)
#let code(body) = text(size: 20pt, fill: dim, body)

// the small heading in every page's corner; same key everywhere, so it stays put across pages
#let head(body) = mark("title")[#text(size: 28pt, weight: 700, fill: hi, body)]

#let body = {
  // ── 1. the same key is the same thing ────────────────────────────────
  // note: speaker notes, HTML only, shown in the window opened with `s`.
  slide(
    title: "Title",
    note: "→ : the title shrinks into the corner and the subtitle follows it.",
  )[
    #set align(center + horizon)
    #mark("title")[#text(size: 72pt, weight: 700, fill: hi)[vtslides]]

    #v(16pt)
    #mark("sub")[#text(size: 26pt, fill: dim)[Typst slides with View Transitions]]
  ]

  // Two frames of one page: the second only adds a formula. One thumbnail with two
  // dots; the added line is interpolated in, the page does not jump.
  let intro = [
    #mark("title")[#text(size: 40pt, weight: 700, fill: hi)[vtslides]]

    #mark("sub")[#text(size: 22pt, fill: dim)[Typst slides with View Transitions]]

    #v(40pt)
    $e^(-x^2)$ has no elementary antiderivative. Its integral over the
    half-line is nevertheless known exactly:
  ]

  slide(
    title: "Frames",
    note: [
      Two frames on this page.

      - → adds the formula
      - → again: it fills the next page

      Its value: $sqrt(pi) / 2 approx 0.886$
    ],
    intro,
    intro
      + [
        #v(16pt)
        #mark("eq")[#math.equation(
          block: true,
          alt: "the Gaussian integral equals half the square root of pi",
        )[$integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$]]
      ],
  )

  slide(title: "Gaussian integral", note: "The formula from the previous page, enlarged.")[
    #set align(center + horizon)
    #mark("eq")[#text(size: 44pt)[#math.equation(
      block: true,
      alt: "the Gaussian integral equals half the square root of pi",
    )[$integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$]]]
  ]

  // ── nesting: the browser lifts the inner mark out of the outer snapshot; each flies on its own ──
  let nest(sz, al) = [
    #set align(al)
    #mark("outer")[#text(size: sz, fill: hi)[The quick #mark("inner")[#text(fill: rgb("#ff9f45"))[brown]] fox]]
  ]

  slide(
    title: "Nested marks",
    nest(52pt, center + horizon),
    nest(28pt, left + top),
  )

  // ── the same key several times on one page: one-to-many splits, many-to-one merges ──
  let cell = box(fill: rgb("#2b3a5c"), inset: 14pt, radius: 6pt, text(size: 30pt, weight: 700, fill: hi)[cell])

  slide(
    title: "Split and merge",
    [
      #set align(center + horizon)
      #mark("cell")[#cell]
    ],
    [
      #place(dx: 60pt, dy: 180pt, mark("cell")[#cell])
      #place(dx: 480pt, dy: 380pt, mark("cell")[#cell])
      #place(dx: 880pt, dy: 120pt, mark("cell")[#cell])
    ],
    // three to two: counts need not divide, name i takes source floor(i·k/K)
    [
      #place(dx: 220pt, dy: 260pt, mark("cell")[#cell])
      #place(dx: 760pt, dy: 260pt, mark("cell")[#cell])
    ],
    [
      #set align(center + horizon)
      #mark("cell")[#cell]
    ],
  )

  // ── 2. overlap and crossing: every mark is its own group ─────────────
  // section page: the whole page pushes in from the right (the deck default is fade); the marked heading morphs regardless
  slide(title: "Overlap", transition: "slide")[
    #head[Overlap]

    #v(24pt)
    #text(size: 24pt, fill: dim)[
      Two marks, A and B, over five frames: overlapping, parting,
      crossing diagonally, passing through each other.
    ]
  ]

  // Five frames: overlapping boxes → parting → crossing diagonally → passing through on one line.
  // One thumbnail, five dots.
  // A changes position, size and colour on every frame — five frames read as **one object
  // changing continuously**, not five "vanish and reappear". B only moves, for comparison.
  let ab(ax, ay, bx, by, sz, hue) = [
    #head[Overlap]
    #place(dx: ax, dy: ay, mark("A")[#text(size: sz, weight: 700, fill: hue)[AAAAAAAA]])
    #place(dx: bx, dy: by, mark("B")[#B[BBBBBBBB]])
  ]

  slide(
    title: "Overlap",
    ab(40pt, 120pt, 240pt, 160pt, 40pt, rgb("#ff9f45")),
    ab(40pt, 480pt, 800pt, 120pt, 52pt, rgb("#ffd166")),
    ab(800pt, 480pt, 40pt, 120pt, 64pt, rgb("#8ce99a")),
    ab(40pt, 300pt, 800pt, 300pt, 52pt, rgb("#66d9e8")),
    ab(800pt, 300pt, 40pt, 300pt, 40pt, rgb("#7aa2ff")),
  )

  // ── discs: two marks that overlap, part and cross on their way out; then a word zooms into place ──
  // Frame 2 places the discs beyond the page edges: the layout is clipped to the page, but the
  // transition interpolates the boxes, so each disc grows and crosses the screen as it leaves.
  // Frame 3 is a one-sided mark with an effect of its own: `zoom` shrinks it from three times
  // its size into place. Back replays everything in reverse.
  let amber = rgb("#ff9f45")
  let blue = rgb("#7aa2ff")
  let disc(key, cx, r, hue) = place(dx: cx - r, dy: 360pt - r, mark(key)[#circle(radius: r, fill: hue)])

  slide(
    title: "Discs",
    note: [Two paired marks: they overlap, then each grows and crosses to the other side, out of the page. The word is one-sided and enters with `zoom`.],
    [
      #head[Discs]
      #disc("L", 560pt, 120pt, amber)
      #disc("R", 720pt, 120pt, blue)
    ],
    [
      #head[Discs]
      #disc("L", 1580pt, 240pt, amber)
      #disc("R", -300pt, 240pt, blue)
    ],
    [
      #head[Discs]
      #place(center + horizon, mark("word", transition: "zoom")[#text(size: 96pt, weight: 700, fill: hi)[vtslides]])
      #place(dx: 60pt, dy: 560pt, code[`mark("word", transition: "zoom")`])
    ],
  )

  // ── theorem environment: three blocks revealed from three different edges ──
  // The enter/leave effect sits on the element that appears: mark(transition:). New on
  // this frame, it enters with its own effect (definition wipes down, theorem wipes up,
  // proof wipes in from the right); going back, the one that disappears leaves with the
  // same effect reversed; the ones present on both frames (definition, theorem) just morph.
  // A pair names the two sides separately: the proof wipes in, and when the page is left
  // it grows out of the picture (zoom) — turning back, it shrinks into place again.
  // The environments are theorion's, the box around them is the deck's: the
  // package numbers, names and closes them (∎), the slide gives them its colour.
  // The number is written out because a mark that stands on three frames is one
  // object shown three times — left to the counter, it would count each frame.
  let env(hue, body) = block(
    width: 100%, inset: (left: 24pt, rest: 16pt), radius: 6pt,
    fill: hue.transparentize(88%), stroke: (left: 3pt + hue),
    text(size: 22pt, fill: hi, body),
  )
  let definition = mark("def", transition: "wipe-down", env(rgb("#7aa2ff"))[
    #definition(number: "1", title: "Cauchy sequence")[
      A sequence $(a_n)$ is *Cauchy* if for every $epsilon > 0$ there is an $N$
      such that $|a_m - a_n| < epsilon$ whenever $m, n > N$.
    ]
  ])
  let cauchy = mark("thm", transition: "wipe-up", env(rgb("#ff9f45"))[
    #theorem(number: "2")[A real sequence converges if and only if it is Cauchy.]
  ])
  let cauchy-proof = mark("proof", transition: (enter: "wipe-left", leave: "zoom"), env(rgb("#8ce99a"))[
    #proof[
      Convergent implies Cauchy: $|a_m - a_n| <= |a_m - a| + |a - a_n|$.
      A Cauchy sequence is bounded, so by Bolzano–Weierstrass it has a convergent
      subsequence $a_(n_k) -> a$, and the Cauchy condition pulls the whole sequence to $a$.
    ]
  ])
  slide(
    title: "Cauchy sequences",
    note: [The environments come from theorion, the boxes from the deck. Definition wipes down, theorem wipes up, proof wipes in from the right; ← plays each one back. Leaving the page, the proof zooms out.],
    [#head[Cauchy sequences] #v(20pt) #definition],
    [#head[Cauchy sequences] #v(20pt) #definition #v(14pt) #cauchy],
    [#head[Cauchy sequences] #v(20pt) #definition #v(14pt) #cauchy #v(14pt) #cauchy-proof],
  )

  // ── 3. CeTZ drawings morph too ───────────────────────────────────────
  // One mark around the whole canvas: position and size interpolate between the two frames,
  // the content cross-fades (a transition interpolates boxes; bending a curve into another
  // curve is the element animation on the next page). `import cetz.draw: *` would shadow
  // vtslides' mark, so import by name; Typst's circle is std.circle.
  let fig(r) = cetz.canvas(length: 1cm, {
    import cetz.draw: circle, line, rect, content
    circle((0, 0), radius: r, fill: rgb("#ff9f45"), stroke: none)
    line((-2, 0), (2, 0), stroke: 2pt + rgb("#7aa2ff"))
    rect((-1, -1), (1, 1), stroke: 1.5pt + hi)
    content((0, -1.6), text(fill: hi)[cetz])
  })

  slide(
    title: "CeTZ",
    [
      #set align(center + horizon)
      #mark("fig")[#fig(0.6)]
    ],
    [
      #place(dx: 60pt, dy: 40pt, mark("fig")[#fig(1.0)])
      #place(dx: 60pt, dy: 560pt, code[`mark("fig")[#cetz.canvas(…)]`])
    ],
  )

  // ── 4. element animation: one drawing, a few parameters, stepped with → ──
  // Six states of wave(t): the curve's d, the ball's position and colour interpolate; the
  // "t = n" label swaps glyphs and just switches. The invisible rectangle pins the canvas
  // bounding box so the origin does not jump between states.
  let wave(t) = cetz.canvas(length: 1cm, {
    import cetz.draw: circle, line, rect, content
    rect((-0.5, -1.7), (8.5, 1.7), stroke: none)
    line((0, 0), (8, 0), stroke: .5pt + rgb("#7aa2ff").darken(40%))
    let amp = 0.3 + 0.18 * t
    let f(x) = amp * calc.sin(1.2 * x - 0.5 * t)
    line(..range(0, 41).map(i => (i * 0.2, f(i * 0.2))), stroke: 1.5pt + rgb("#7aa2ff"))
    let x = 1.4 * t
    circle((x, f(x)), radius: .25, stroke: none,
      fill: color.mix((rgb("#8ce99a"), 100% - t * 20%), (rgb("#ff9f45"), t * 20%)))
    content((4, -1.4), text(fill: dim)[t = #t])
  })

  slide(
    title: "Element animation",
    note: [→ steps through the six states, ← steps back; the page turns after the last one.],
  )[
    #head[Element animation]
    #place(dx: 120pt, dy: 200pt, mark("wave", ..range(0, 6).map(wave)))
    #place(dx: 120pt, dy: 560pt, code[`mark("wave", ..range(0, 6).map(wave))`])
  ]

  // ── continuous animation: runs while the page rests on this frame, starts after the transition ──
  // The anim spec is Web Animations keyframes + options, handed to el.animate() as is;
  // follow is the one convenience: run a mark's centre along the path inside another mark
  // (CSS offset-path, on the compositor). Track and ball are two independent marks; the
  // ball can be placed anywhere.
  let lissajous = range(0, 121).map(i => {
    let a = i / 120 * 2 * calc.pi
    (3 * calc.sin(2 * a) + 3.2, 1.6 * calc.sin(3 * a) + 1.8)
  })
  slide(
    title: "Continuous animation",
    note: [The ball runs along the track, the square spins on two keyframes; both pause when the page is left.],
    anim: (
      dot: (follow: "track", duration: 4000),
      spin: (keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")), duration: 6000),
    ),
  )[
    #head[Continuous animation]
    #place(dx: 120pt, dy: 180pt, mark("track")[#cetz.canvas(length: 1cm, {
      import cetz.draw: line
      line(..lissajous, close: true, stroke: 1.5pt + rgb("#7aa2ff"))
    })])
    #place(dx: 120pt, dy: 180pt, mark("dot")[#std.circle(radius: .3cm, fill: rgb("#8ce99a"))])
    #place(dx: 900pt, dy: 300pt, mark("spin")[#std.rect(width: 90pt, height: 90pt, radius: 10pt, fill: rgb("#ff9f45"))])
    #place(dx: 120pt, dy: 560pt, code[
      `anim: (dot: (follow: "track", duration: 4000), spin: (keyframes: …, duration: 6000))`
    ])
  ]

  // ── bouncing balls: continuous keyframes on the marks themselves ─────
  // One mark and one animation per ball; the keyframes are plain WAAPI: per-segment easing
  // plays gravity (accelerating down, decelerating up), a scale squash on touchdown with the
  // transform-origin at the bottom so it squashes against the floor. Offsets are percentages
  // (multiples of the ball's own size), so they scale with the layout. Staggered by delay.
  let ball(i) = (
    keyframes: (
      (transform: "translateY(0) scale(1, 1)", transformOrigin: "50% 100%", easing: "cubic-bezier(.45, 0, 1, .55)"),
      (transform: "translateY(560%) scale(1, 1)", transformOrigin: "50% 100%", offset: .46, easing: "linear"),
      (transform: "translateY(560%) scale(1.3, .7)", transformOrigin: "50% 100%", offset: .5, easing: "linear"),
      (transform: "translateY(560%) scale(1, 1)", transformOrigin: "50% 100%", offset: .54, easing: "cubic-bezier(0, .45, .55, 1)"),
      (transform: "translateY(0) scale(1, 1)", transformOrigin: "50% 100%"),
    ),
    duration: 1500,
    delay: i * 140,
  )
  let hues = (rgb("#ff9f45"), rgb("#ffd166"), rgb("#8ce99a"), rgb("#66d9e8"), rgb("#7aa2ff"))
  slide(
    title: "Bouncing balls",
    note: [Five marks, five keyframe animations: segment easing for gravity, a squash on landing, a delay to stagger them.],
    anim: range(5).map(i => ("ball" + str(i), ball(i))).to-dict(),
  )[
    #head[Bouncing balls]
    #for i in range(5) {
      place(dx: 200pt + i * 180pt, dy: 60pt, mark("ball" + str(i))[#std.circle(radius: 28pt, fill: hues.at(i))])
    }
    #place(dx: 120pt, dy: 430pt, std.line(length: 920pt, stroke: 1pt + dim))
    #place(dx: 120pt, dy: 480pt, code[
      `anim: (ball0: (keyframes: (…), duration: 1500, delay: 0), ball1: …)`
    ])
  ]

  // ── single and double pendulum ───────────────────────────────────────
  // Single: two keyframes rotating about the top (transform-origin at the pivot); alternate
  // + ease-in-out is a harmonic swing. The double pendulum is chaotic and has no closed
  // form — integrate the equations of motion with RK4 in Typst, draw a pose every few
  // steps, put 96 states into the mark; anim names it without keyframes, and the runtime
  // plays the states as keyframes (alternate: a pendulum played backwards is still a
  // pendulum). The faint line is the whole trajectory, identical in every state, so it
  // never moves.
  let pendulum = cetz.canvas(length: 1cm, {
    import cetz.draw: circle, line
    line((0, 0), (0, -6.5), stroke: 2pt + hi)
    circle((0, 0), radius: .1, fill: dim, stroke: none)
    circle((0, -6.5), radius: .55, fill: rgb("#ff9f45"), stroke: none)
  })
  let g = 9.81
  let accel(th1, th2, w1, w2) = {
    let d = th1 - th2
    let den = 3 - calc.cos(2 * d)
    let a1 = (-3 * g * calc.sin(th1) - g * calc.sin(th1 - 2 * th2) - 2 * calc.sin(d) * (w2 * w2 + w1 * w1 * calc.cos(d))) / den
    let a2 = (2 * calc.sin(d) * (2 * w1 * w1 + 2 * g * calc.cos(th1) + w2 * w2 * calc.cos(d))) / den
    (a1, a2)
  }
  let rk4(st, h) = {
    let f(s) = { let (a1, a2) = accel(..s); (s.at(2), s.at(3), a1, a2) }
    let add(a, b, k) = a.zip(b).map(((x, y)) => x + k * y)
    let k1 = f(st)
    let k2 = f(add(st, k1, h / 2))
    let k3 = f(add(st, k2, h / 2))
    let k4 = f(add(st, k3, h))
    range(4).map(i => st.at(i) + h / 6 * (k1.at(i) + 2 * k2.at(i) + 2 * k3.at(i) + k4.at(i)))
  }
  let poses = {
    let st = (2.2, 2.6, 0, 0)
    let out = ()
    for i in range(96) {
      out.push(st)
      for j in range(10) { st = rk4(st, 0.008) }
    }
    out
  }
  let tip(s) = {
    let (th1, th2, ..) = s
    let p1 = (calc.sin(th1), -calc.cos(th1))
    (p1, (p1.at(0) + calc.sin(th2), p1.at(1) - calc.cos(th2)))
  }
  let path = poses.map(s => tip(s).at(1))
  let pose(s) = cetz.canvas(length: 2.2cm, {
    import cetz.draw: circle, line, rect
    rect((-2.2, -2.2), (2.2, 2.2), stroke: none)
    line(..path, stroke: .6pt + rgb("#7aa2ff").transparentize(55%))
    let (p1, p2) = tip(s)
    line((0, 0), p1, p2, stroke: 2pt + hi)
    circle((0, 0), radius: .07, fill: dim, stroke: none)
    circle(p1, radius: .16, fill: rgb("#ff9f45"), stroke: none)
    circle(p2, radius: .16, fill: rgb("#8ce99a"), stroke: none)
  })
  slide(
    title: "Pendulums",
    note: [Left: two keyframes rotating about the pivot. Right: 96 poses integrated with RK4 in Typst, played as keyframes.],
    anim: (
      single: (
        keyframes: ((transform: "rotate(32deg)", transformOrigin: "50% 0"), (transform: "rotate(-32deg)", transformOrigin: "50% 0")),
        duration: 1400, direction: "alternate", easing: (0.42, 0, 0.58, 1),
      ),
      double: (duration: 8000, direction: "alternate"),
    ),
  )[
    #head[Pendulums]
    #place(dx: 260pt, dy: 100pt, mark("single")[#pendulum])
    #place(dx: 560pt, dy: 60pt, mark("double", ..poses.map(pose)))
    #place(dx: 120pt, dy: 520pt, code[
      `mark("double", ..poses.map(pose))` + `anim: (double: (duration: 8000, direction: "alternate"))`
    ])
  ]

  // ── waves ────────────────────────────────────────────────────────────
  // Three layers of summed sines, each with its own wavelength and speed; a small boat
  // rides the front layer, its position from the wave height and its heading from the
  // slope. 25 states with identical first and last, so the loop is seamless.
  let sea(k) = cetz.canvas(length: 2cm, {
    import cetz.draw: circle, line, rect, content
    let phi = k / 24 * 2 * calc.pi
    rect((-0.2, -2.2), (16.2, 3.2), stroke: none)
    circle((13.5, 2.2), radius: .55, fill: rgb("#ffd166"), stroke: none)
    let surf(a, w, v, y0) = x => y0 + a * calc.sin(w * x + v * phi) + a * .35 * calc.sin(2.3 * w * x - 1.7 * v * phi)
    let layer(h, col) = line(..range(0, 65).map(i => (i * .25, h(i * .25))), (16, -2), (0, -2), close: true, fill: col, stroke: none)
    let h = surf(.35, 1.5, 1, -.1)
    layer(surf(.45, .9, 1, 1.1), rgb("#2b3a5c"))
    layer(surf(.4, 1.2, -1, .5), rgb("#3e5aa8"))
    layer(h, rgb("#7aa2ff"))
    let x = 5.5
    let y = h(x)
    let slope = (h(x + .05) - h(x - .05)) / .1
    content((x, y + .25), angle: calc.atan(slope), {
      set text(size: 26pt)
      box(baseline: -8pt, polygon(fill: rgb("#ffd166"), (0pt, 0pt), (36pt, 0pt), (30pt, 12pt), (6pt, 12pt)))
    })
  })
  slide(
    title: "Waves",
    note: [Three layers of waves and a boat, 25 states played continuously; first and last state are equal, so the loop is seamless.],
    anim: (sea: (duration: 4000)),
  )[
    #head[Waves]
    #place(dx: 100pt, dy: 120pt, mark("sea", ..range(0, 25).map(sea)))
    #place(dx: 120pt, dy: 560pt, code[
      `mark("sea", ..range(0, 25).map(sea))` + `anim: (sea: (duration: 4000))`
    ])
  ]

  // ── Liu Hui's π: an inscribed polygon doubling its sides ──────────────
  // Two paths interpolate only with the same number of segments, so every state
  // is drawn with the same 96 points. The points sit *on the vertices*: the
  // 6-gon has 16 points stacked on each corner, the 12-gon 8, and so on. A
  // stacked point draws nothing, so each state is exactly its polygon; and on
  // a step half of every stack stays while the other half swings forward to
  // the new vertex — the polygon opens like a fan, every moving point in the
  // same direction, the starting point never moving. The edges are cubics
  // (control points at a third and two thirds, a straight cubic): the exporter
  // drops a zero-length *line*, which would break the count, but writes every
  // cubic. The labels are drawn the same in every state (all five counts, the
  // current one lit; π with a fixed four decimals) so the glyph count never
  // changes.
  let counts = (6, 12, 24, 48, 96)
  let N = counts.last()
  let corners(k, r) = range(N).map(j => {
    let n = counts.at(k)
    let a = 2 * calc.pi * calc.quo(j * n, N) / n - calc.pi / 2
    (r * calc.cos(a), r * calc.sin(a))
  })
  let lerp(p, q, t) = (p.at(0) + t * (q.at(0) - p.at(0)), p.at(1) + t * (q.at(1) - p.at(1)))
  let fixed(x) = { let t = str(int(calc.round(x * 10000))); t.slice(0, 1) + "." + t.slice(1) }
  let exhaust(k) = cetz.canvas(length: 1.5cm, {
    import cetz.draw: bezier, circle, content, merge-path, rect
    rect((-3.6, -4.5), (3.6, 4.5), stroke: none)
    circle((0, 0), radius: 3, stroke: .6pt + dim)
    let pts = corners(k, 3)
    merge-path(close: true, fill: rgb("#7aa2ff").transparentize(78%), stroke: 1.5pt + rgb("#7aa2ff"), {
      for j in range(N) {
        let (p, q) = (pts.at(j), pts.at(calc.rem(j + 1, N)))
        bezier(p, q, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3))
      }
    })
    content((0, 3.9), text(size: 22pt, fill: dim)[#counts.enumerate().map(((j, n)) => text(fill: if j == k { hi } else { dim })[#n]).join[ · ]])
    content((0, -3.8), text(size: 22pt, fill: hi)[#sym.pi ≈ #fixed(counts.at(k) * calc.sin(calc.pi / counts.at(k)))])
  })
  slide(
    title: "Liu Hui's π",
    note: [→ doubles the sides: 6, 12, 24, 48, 96. The polygon opens like a fan: half of each corner swings forward to the new vertex.],
  )[
    #head[Liu Hui's π]
    #place(dx: 480pt, dy: 90pt, mark("poly", ..range(0, 5).map(exhaust)))
    #place(dx: 120pt, dy: 560pt, code[`mark("poly", ..range(0, 5).map(exhaust))`])
  ]

  // ── a polygon gaining sides, a line gaining segments: nothing drawn specially ──
  // The states differ in segment count. The runtime aligns the paths by padding
  // the shorter one with zero-length segments at the end of its subpath (they
  // draw nothing), so the states interpolate: the new vertex grows out of the
  // last one, the new segment out of the end of the line.
  let gon(k) = cetz.canvas(length: 1.6cm, {
    import cetz.draw: content, polygon, rect
    rect((-3, -3.6), (3, 3), stroke: none)
    polygon((0, 0), k, radius: 2.5, fill: rgb("#7aa2ff").transparentize(78%), stroke: 1.5pt + rgb("#7aa2ff"))
    content((0, -3.2), text(size: 22pt, fill: dim)[#k sides])
  })
  let walk = ((0, 0), (1.2, 1.4), (2.6, 0.6), (3.4, 2.2), (4.8, 1.0), (6.0, 2.6), (7.2, 1.2))
  let trail(k) = cetz.canvas(length: 1.6cm, {
    import cetz.draw: circle, line, rect
    rect((-0.4, -0.4), (7.6, 3.0), stroke: none)
    line(..walk.slice(0, k + 2), stroke: 2pt + rgb("#8ce99a"))
    // the dot is hollow at first and fills in: fill none against a colour fades
    circle(walk.at(k + 1), radius: .18, fill: if k == 0 { none } else { rgb("#8ce99a") }, stroke: 1pt + rgb("#8ce99a"))
  })
  // a line that bends: a line against a curve is written as the straight cubic it is
  let bend(k) = cetz.canvas(length: 1.6cm, {
    import cetz.draw: bezier, line, rect
    rect((-0.3, -1.3), (4.3, 1.3), stroke: none)
    if k == 0 { line((0, 0), (4, 0), stroke: 2pt + rgb("#ffd166")) }
    else { bezier((0, 0), (4, 0), (1.3, 0.6 * k), (2.7, -0.6 * k), stroke: 2pt + rgb("#ffd166")) }
  })
  slide(
    title: "Growing shapes",
    note: [Nothing is drawn specially here: the polygon has one more side per state, the line one more segment, the dot fills in, the straight line bends. The runtime rewrites the shorter or simpler path so the states interpolate.],
  )[
    #head[Growing shapes]
    #place(dx: 160pt, dy: 150pt, mark("gon", ..range(3, 9).map(gon)))
    #place(dx: 600pt, dy: 160pt, mark("trail", ..range(0, 6).map(trail)))
    #place(dx: 660pt, dy: 380pt, mark("bend", ..range(0, 3).map(bend)))
    #place(dx: 120pt, dy: 560pt, code[`mark("gon", ..range(3, 9).map(gon))` · `mark("trail", ..range(0, 6).map(trail))` · `mark("bend", ..range(0, 3).map(bend))`])
  ]

  // ── 5. someone else's diagrams: fletcher ─────────────────────────────
  // fletcher puts the objects on a grid and draws the arrows between them. An
  // object is content, so it can be a mark; an arrow is drawn, so it belongs to
  // the page and cross-fades with it — and a label is content again, so the
  // `exists!` wipes in on its own. Adding X grows the grid up and to the left,
  // which moves everything already on it: same key, so they glide there instead
  // of jumping.
  let cd(body) = {
    set text(size: 30pt, fill: hi)
    diagram(cell-size: 46mm, edge-stroke: 1.1pt + rgb("#d5d9e2"), node-inset: 9pt, body)
  }
  let cospan = {
    node((1, 0), mark("pbB")[$B$])
    node((1, 1), mark("pbD")[$D$])
    node((0, 1), mark("pbC")[$C$])
    edge((1, 0), (1, 1), $f$, "->")
    edge((0, 1), (1, 1), $g$, "->")
  }
  let square = {
    cospan
    node((0, 0), mark("pbA", transition: "zoom")[$B times_D C$])
    edge((0, 0), (1, 0), $p$, "->")
    edge((0, 0), (0, 1), $q$, "->")
  }
  let universal = {
    square
    node((-1, -1), mark("pbX", transition: "rise")[$X$])
    edge((-1, -1), (1, 0), "->", bend: 30deg)
    edge((-1, -1), (0, 1), "->", bend: -30deg)
    edge((-1, -1), (0, 0), mark("pbU", transition: "wipe-right")[$exists!$], "-->")
  }
  slide(
    title: "Pullback",
    note: [The diagram is fletcher's, the objects are marks. The pullback zooms in, X rises, `∃!` wipes in — and when X arrives the grid grows, so the objects that were already there glide to their new places.],
    [#head[Pullback] #place(center + horizon, cd(cospan))],
    [#head[Pullback] #place(center + horizon, cd(square))],
    [#head[Pullback] #place(center + horizon, cd(universal)) #place(dx: 120pt, dy: 600pt, code[`node((0, 0), mark("pbA", transition: "zoom")[$B times_D C$])`])],
  )

  // ── the same drawing, one arrow at a time: duality ───────────────────
  // Two states of one mark, so this is an element animation: every arrow is
  // there in both, only turned round, and the runtime interpolates path against
  // path — the heads slide along the arrows and the diagram becomes its dual.
  let duo(rev) = {
    set text(size: 30pt, fill: hi)
    let arrow(a, b, label) = if rev { edge(b, a, label, "->") } else { edge(a, b, label, "->") }
    diagram(cell-size: 36mm, edge-stroke: 1.1pt + rgb("#d5d9e2"), node-inset: 9pt, {
      node((0, 0), $P$); node((1, 0), $B$); node((0, 1), $C$); node((1, 1), $D$)
      arrow((0, 0), (1, 0), $p$)
      arrow((0, 0), (0, 1), $q$)
      arrow((1, 0), (1, 1), $f$)
      arrow((0, 1), (1, 1), $g$)
    })
  }
  slide(
    title: "Duality",
    note: [→ turns every arrow round: the limit square becomes the colimit one. The two states are the same drawing, so the arrowheads slide along the arrows rather than fading.],
  )[
    #head[Duality]
    #place(center + horizon, mark("dual", duo(false), duo(true)))
    #place(dx: 120pt, dy: 600pt, code[`mark("dual", duo(false), duo(true))`])
  ]
}

#deck(title: "vtslides", body)
