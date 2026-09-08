// vit — the tutorial deck. Every page teaches one part of the API: the
// left column is what you write, the right column is what it does, and the
// line under it says when to reach for it and when not to.
//
// One compile per format:
//
//   typst compile --root . examples/tutorial.typ examples/tutorial.pdf
//   typst compile --root . --features html examples/tutorial.typ examples/tutorial.html
//
// Once published, replace the next line with #import "@preview/vit:0.1.0": *
#import "../lib.typ": *
// Element animation — stepped and played alike — is tween's, not the deck's.
// compat.cetz is its layer for CeTZ: cetz.draw with `over(…)` allowed in place
// of any argument. Once published: #import "@preview/tween:0.1.0": tween, waapi, compat
#import "../packages/tween/lib.typ": tween, waapi, compat
#import "@preview/cetz:0.5.2"
#let cz = compat.cetz.tweened(cetz)
// Third party packages, unchanged: theorion writes the theorem environments,
// fletcher draws the commutative diagrams. Both have an HTML branch of their own,
// and neither of them takes it here — a slide is an html.frame, and inside a frame
// the target is the paged one, so what they draw is a picture, which is what
// vit can move. `import cosmos.simple: *` brings theorion's environments;
// fletcher is imported by name so its own `marks` never shadows vit' `mark`.
#import "@preview/theorion:0.6.0": *
#import cosmos.simple: *
#import "@preview/fletcher:0.5.8" as fletcher: diagram, edge, node
// komet is a WASM plugin: it does the Fourier transform at compile time
#import "@preview/komet:0.2.0" as komet

#show: show-theorion

// ── palette and page furniture ───────────────────────────────────────
#let dim = rgb("#8992a5")
#let hi = rgb("#f2f4f8")
#let blue = rgb("#7aa2ff")
#let amber = rgb("#ff9f45")
#let green = rgb("#8ce99a")
#let cyan = rgb("#66d9e8")
#let gold = rgb("#ffd166")
#let ink = rgb("#1b2130")

// the heading in every page's corner; one key for the whole deck, so it is the
// same object from the title page on and travels rather than being redrawn
#let head(body) = mark("title")[#text(size: 26pt, weight: 700, fill: hi, body)]

// what you write
#let src(body) = block(
  width: 100%,
  inset: (x: 14pt, y: 12pt),
  radius: 6pt,
  fill: rgb("#f5f7fb"),
  text(size: 15pt, fill: ink, body),
)

// what it does: a small stage, so the example is visibly a deck inside the deck
#let SW = 580pt
#let SH = 380pt
#let screen(body) = block(
  width: SW,
  height: SH,
  radius: 8pt,
  fill: rgb("#0c0f15"),
  stroke: 1pt + rgb("#293040"),
  inset: 16pt,
  block(width: 100%, height: 100%, body),
)

// one page of the tutorial: heading, the sentence it teaches, the two columns,
// and the line that says when this is the right tool
#let lesson(title, lead, code, result, when: none) = {
  head(title)
  v(2pt)
  block(width: 100%, height: 46pt, text(size: 19pt, fill: dim, lead))
  grid(
    columns: (1fr, SW),
    column-gutter: 26pt,
    align: (horizon, top),
    code,
    stack(
      spacing: 14pt,
      result,
      if when != none { block(width: SW, text(size: 16pt, fill: dim, when)) },
    ),
  )
}

#let key(body) = box(
  inset: (x: 5pt, y: 2pt),
  radius: 3pt,
  fill: rgb("#222835"),
  stroke: .5pt + rgb("#39415a"),
  text(size: 17pt, fill: hi, body),
)

#let body = {
  // ── 1. title ───────────────────────────────────────────────────────
  slide(
    title: "vit",
    note: [
      The deck opens on the desk: thumbnails on the left, the page beside them, these notes underneath.
      #key[Enter] presents, #key[Esc] comes back, #key[?] lists every key.

      →: the title shrinks into the corner and stays there for the rest of the deck — one `mark`, one object.
    ],
  )[
    #set align(center + horizon)
    #mark("title")[#text(size: 76pt, weight: 700, fill: hi)[vit]]

    #v(12pt)
    #mark("sub")[#text(size: 26pt, fill: dim)[Typst slides with View Transitions]]

    #v(46pt)
    #text(size: 20pt, fill: dim.darken(15%))[a tutorial — press #key[→]]
  ]

  // ── 2. the smallest deck ───────────────────────────────────────────
  let hello(k) = screen(if k == 1 [
    #set align(center + horizon)
    #mark("hi")[#text(size: 52pt, weight: 700, fill: hi)[Hello]]
  ] else [
    #mark("hi")[#text(size: 24pt, weight: 700, fill: hi)[Hello]]
    #v(10pt)
    #text(size: 21pt, fill: dim)[
      — and the rest of the page arrives around it. Two ordinary Typst
      pages; the only addition is the name on the word that should travel.
    ]
  ])
  let deck-code = src(```typ
  #import "@preview/vit:0.1.0": *

  #deck(title: "My talk")[
    #slide[
      #set align(center + horizon)
      #mark("hi")[#text(size: 52pt)[Hello]]
    ]
    #slide[
      #mark("hi")[#text(size: 24pt)[Hello]]
      — and the rest of the page arrives around it.
    ]
  ]
  ```)
  slide(
    title: "A deck in ten lines",
    note: [`#show: deck.with(title: "…")` at the top of a file, with the slides below, is the same thing written the other way round. The PDF and the HTML come out of the same source and are compared pixel by pixel by `tools/verify.mjs`.],
    ..range(1, 3).map(k => {
      lesson(
        "A deck in ten lines",
        [`deck` is the document, `slide` is a page, `mark` names what should travel. Everything else is ordinary Typst.],
        stack(
          spacing: 14pt,
          deck-code,
          src(```sh
          typst compile --root . talk.typ talk.pdf
          typst compile --root . --features html talk.typ talk.html
          ```),
        ),
        hello(k),
        when: [One source, two compiles: the PDF is the handout, the HTML is the deck, pixel for pixel.],
      )
    }),
  )

  // ── 3. the three words, and which API each one is ──────────────────
  let card(name, question, api, engine, hue) = block(
    width: 100%,
    height: 400pt,
    inset: 16pt,
    radius: 6pt,
    fill: hue.transparentize(90%),
    stroke: (left: 3pt + hue),
    stack(
      spacing: 12pt,
      text(size: 24pt, weight: 700, fill: hi, name),
      text(size: 19pt, fill: dim, question),
      text(size: 17pt, fill: hue, raw(api)),
      text(size: 17pt, fill: dim.darken(10%), engine),
    ),
  )
  slide(
    title: "One question, three answers",
    note: [Everything in this deck is one of these three. The test is a single sentence, and it decides which API you are looking for.],
    ..reveal(3, (step, at) => [
      #head[One question, three answers]

      #v(4pt)
      #text(size: 21pt, fill: dim)[
        *Did the layout change, or is one object moving?* The answer picks the API.
      ]

      #v(16pt)
      #grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 22pt,
        at(1, mark("w-tr", transition: "rise", card(
          "Transition",
          "The layout changed: another page, or the next frame of this one.",
          "slide(..frames)\nmark(\"key\")[…]\ndeck/slide/mark(transition:)",
          "View Transitions: the browser pairs marks by key.",
          blue,
        ))),
        at(2, mark("w-el", transition: "rise", card(
          "Element animation",
          "One object varies with a parameter: the wave at its next phase.",
          "mark(\"key\", s0, s1, …)",
          "Web Animations, on the SVG nodes; stepped with → and ←.",
          amber,
        ))),
        at(3, mark("w-co", transition: "rise", card(
          "Continuous animation",
          "Something moving on its own, with nobody pressing anything.",
          "tween(play: …) · waapi.animate",
          "Web Animations, running while the page rests here.",
          green,
        ))),
      )
    ]),
  )

  // ── 4. mark: identity ──────────────────────────────────────────────
  let chip(hue, sz) = box(
    fill: hue.transparentize(75%),
    stroke: 2pt + hue,
    inset: (x: sz * 0.5, y: sz * 0.3),
    radius: 6pt,
    text(size: sz, weight: 700, fill: hue)[chip],
  )
  let chips(k) = screen({
    let (x, y, sz, hue) = ((20pt, 20pt, 22pt, amber), (170pt, 130pt, 34pt, gold), (330pt, 250pt, 26pt, cyan)).at(k - 1)
    place(dx: x, dy: y, mark("chip")[#chip(hue, sz)])
  })
  slide(
    title: "mark: one name, one object",
    note: [Press → twice: the chip does not disappear and reappear, it goes. Position, size and colour are all interpolated, because the browser is given two boxes with one name. Keys are letters, digits, `_` and `-`; nothing is inferred from what is inside.],
    ..range(1, 4).map(k => lesson(
      "mark: one name, one object",
      [The same key on two adjacent frames or pages is *one object*. The browser pairs the boxes by name and interpolates position, size and colour.],
      src(```typ
      #slide(
        title: "Chips",
        [#place(dx: 20pt, dy: 20pt,
           mark("chip")[#chip(amber, 22pt)])],
        [#place(dx: 170pt, dy: 130pt,
           mark("chip")[#chip(gold, 34pt)])],
        [#place(dx: 330pt, dy: 250pt,
           mark("chip")[#chip(cyan, 26pt)])],
      )
      ```),
      chips(k),
      when: [Identity is the key and only the key — nothing is inferred from the content.],
    )),
  )

  // ── 5. frames and positions ────────────────────────────────────────
  let mini(label, on) = block(
    width: 160pt,
    height: 96pt,
    radius: 5pt,
    fill: if on { blue.transparentize(82%) } else { rgb("#141922") },
    stroke: 1pt + if on { blue } else { rgb("#2a3141") },
    inset: 8pt,
    align(center + horizon, text(size: 19pt, fill: if on { hi } else { dim }, label)),
  )
  slide(
    title: "Frames and positions",
    note: [The counter in the toolbar, the dots in the overview, the progress bar and the speaker view's "next step" all count positions, not pages.],
    ..range(1, 4).map(k => lesson(
      "Frames and positions",
      [Several bodies in one `slide` are *frames of one page*: one thumbnail, one dot each, #raw("#5." + str(k)) in the address bar, and one PDF page each.],
      src(```typ
      #let a = [ … ]
      #slide(
        title: "Frames",     // the thumbnail's caption
        note: [what to say], // the desk and the speaker view
        a,
        a + b,
        a + b + c,
      )
      ```),
      screen[
        #set align(center + horizon)
        #stack(
          dir: ltr,
          spacing: 20pt,
          ..range(1, 4).map(i => mini("5." + str(i), i == k)),
        )
        #v(24pt)
        #text(size: 19pt, fill: dim)[
          A frame and an animation step are the same press, so a page's
          *positions* are its frames and steps in one sequence.
        ]
      ],
      when: [Frames are for "one more line". The page cross-fades and the marks morph: never a page jump.],
    )),
  )

  // ── 6. build ───────────────────────────────────────────────────────
  let item(n, hue, what) = block(
    width: 100%,
    inset: 12pt,
    radius: 5pt,
    fill: hue.transparentize(88%),
    stroke: (left: 3pt + hue),
    text(size: 21pt, fill: hi)[*#n* — #what],
  )
  slide(
    title: "build: frames that accumulate",
    note: [What stays on the page is written once; the source then reads as what each step adds.],
    ..build(
      item("measure", blue, "every marked box, before anything moves"),
      item("hoist", amber, "each one into an SVG host with a name"),
      item("pair", green, "old against new, by name — the browser's own job"),
    ).map(r => lesson(
      "build: frames that accumulate",
      [`build(a, b, c)` is the three frames `a`, `a + b`, `a + b + c`. Content in, content out — it builds the body of a drawing just as well.],
      src(```typ
      #slide(title: "How it works", ..build(
        item("measure", blue, "every marked box…"),
        item("hoist", amber, "each one into an SVG host…"),
        item("pair", green, "old against new, by name…"),
      ))
      ```),
      screen(stack(spacing: 14pt, r)),
      when: [`build` when the later parts are *meant* to push the layout. When they must not, the next page.],
    )),
  )

  // ── 7. reveal ──────────────────────────────────────────────────────
  let quad(at) = {
    let cell(label) = block(
      width: 130pt,
      height: 90pt,
      radius: 5pt,
      fill: blue.transparentize(88%),
      stroke: 1.5pt + blue,
      inset: 8pt,
      align(center + horizon, text(size: 26pt, fill: hi, label)),
    )
    box(width: 390pt, height: 250pt, {
      place(dx: -12pt, dy: -12pt, rect(width: 414pt, height: 274pt, radius: 8pt, stroke: at(3, 1pt + amber)))
      place(dx: 0pt, dy: 0pt, cell[A])
      place(dx: 260pt, dy: 0pt, cell[B])
      place(dx: 0pt, dy: 160pt, cell[C])
      place(dx: 260pt, dy: 160pt, at(2, mark("rv-d", transition: "zoom", cell[D])))
      place(dx: 138pt, dy: 44pt, at(2, line(length: 114pt, stroke: 1.5pt + dim)))
    })
  }
  slide(
    title: "reveal: frames that stay put",
    note: [D arrives, and nothing else moves — because D's space was already there. That is the whole trick: identical layout on every frame is what lets the marks morph instead of the page reflowing under them. `build` stacks, `reveal` holds still.],
    ..reveal(3, (step, at) => lesson(
      "reveal: frames that stay put",
      [`reveal(n, (step, at) => …)` writes the frames once. `at(k, x)` is x from frame k on; before that it *keeps x's space*, so the layout never moves.],
      src(```typ
      #slide(..reveal(3, (step, at) => box({
        place(dx: 0pt,   dy: 0pt,   cell[A])
        place(dx: 260pt, dy: 0pt,   cell[B])
        place(dx: 0pt,   dy: 160pt, cell[C])
        place(dx: 260pt, dy: 160pt,
          at(2, mark("d", transition: "zoom", cell[D])))
        place(dx: 138pt, dy: 44pt,       // holds its box
          at(2, line(length: 114pt)))
        rect(.., stroke: at(3, 1pt))     // else none
      })))
      ```),
      screen(align(center + horizon, quad(at))),
      when: [What has not arrived is `hide`n and holds its box; anything else is `none` — a stroke switched off.],
    )),
  )

  // ── 8. split and merge ─────────────────────────────────────────────
  let cellbox = box(fill: rgb("#2b3a5c"), inset: 12pt, radius: 6pt, text(size: 26pt, weight: 700, fill: hi)[cell])
  let cells(ps) = screen(for p in ps { place(dx: p.at(0), dy: p.at(1), mark("cell")[#cellbox]) })
  slide(
    title: "Split and merge",
    note: [One name pairs one couple, so the runtime clones the shorter side for the length of the transition and takes the clones away afterwards. Any counts work, not only 1 ↔ N.],
    ..(
      ((210pt, 140pt),),
      ((10pt, 20pt), (390pt, 250pt), (200pt, 130pt)),
      ((60pt, 250pt), (350pt, 30pt)),
      ((210pt, 140pt),),
    ).map(ps => lesson(
      "Split and merge",
      [A key that stands once on this frame and three times on the next *splits* into three; three to one *merges*. The counts need not divide.],
      src(```typ
      #let at(x, y) = place(dx: x, dy: y, mark("cell")[#cell])

      #slide(
        at(210pt, 140pt),                     // one
        at(10pt, 20pt) + at(390pt, 250pt) + at(200pt, 130pt),
        at(60pt, 250pt) + at(350pt, 30pt),    // three to two
        at(210pt, 140pt),                     // back to one
      )
      ```),
      cells(ps),
      when: [Names carry an occurrence index (`m-cell-1`, `m-cell-2`), so one key may stand several times.],
    )),
  )

  // ── 9. nesting ─────────────────────────────────────────────────────
  let nest(sz, al) = screen[
    #set align(al)
    #mark("outer")[#text(size: sz, fill: hi)[The quick #mark("inner")[#text(fill: amber)[brown]] fox]]
  ]
  slide(
    title: "Marks nest",
    note: [The inner mark is lifted out of the outer snapshot, as the View Transitions API specifies: two groups, each flying on its own.],
    ..range(1, 3).map(k => lesson(
      "Marks nest",
      [A mark inside a mark is a group of its own. The outer one carries what is left once the inner ones are lifted out.],
      src(```typ
      #let nest(sz, al) = [
        #set align(al)
        #mark("outer")[#text(size: sz)[
          The quick #mark("inner")[#text(fill: amber)[brown]] fox
        ]]
      ]
      #slide(title: "Nested marks",
        nest(44pt, center + horizon),
        nest(24pt, left + top),
      )
      ```),
      if k == 1 { nest(44pt, center + horizon) } else { nest(24pt, left + top) },
      when: [Nesting is how one change's result takes part in the next *as a whole* — see `layers`.],
    )),
  )

  // ── 10. mark(transition:) ──────────────────────────────────────────
  let env(hue, body) = block(
    width: 100%,
    inset: (left: 16pt, rest: 10pt),
    radius: 5pt,
    fill: hue.transparentize(88%),
    stroke: (left: 3pt + hue),
    text(size: 17pt, fill: hi, body),
  )
  slide(
    title: "How a thing enters",
    note: [The environments are theorion's, the boxes are the deck's. Definition wipes down, theorem wipes up, proof wipes in from the right; ← plays each one back, and leaving the page the proof zooms out. A mark with no effect of its own folds into the page and travels with it.],
    ..build(
      mark("def", transition: "wipe-down", env(blue)[
        #definition(number: "1", title: "Cauchy sequence")[
          A sequence $(a_n)$ is *Cauchy* if for every $epsilon > 0$ there is an $N$
          with $|a_m - a_n| < epsilon$ whenever $m, n > N$.
        ]
      ]),
      [#v(10pt) #mark("thm", transition: "wipe-up", env(amber)[
          #theorem(number: "2")[A real sequence converges if and only if it is Cauchy.]
        ])],
      [#v(10pt) #mark("proof", transition: (enter: "wipe-left", leave: "zoom"), env(green)[
          #proof[A Cauchy sequence is bounded, so it has a convergent subsequence, and the Cauchy condition pulls the whole sequence to that limit.]
        ])],
    ).map(r => lesson(
      "How a thing enters",
      [`mark(transition:)` is *this object's own* entrance and exit. It is used only where the mark is one-sided; a mark that is on both sides morphs regardless.],
      src(```typ
      #let definition = mark("def", transition: "wipe-down",
        env(blue)[#definition(number: "1")[…]])
      #let cauchy = mark("thm", transition: "wipe-up",
        env(amber)[#theorem(number: "2")[…]])
      #let cauchy-proof = mark("proof",
        transition: (enter: "wipe-left", leave: "zoom"),
        env(green)[#proof[…]])

      #slide(..build(definition, cauchy, cauchy-proof))
      ```),
      screen(stack(spacing: 0pt, r)),
      when: [One object, one effect: any occurrence may give it, and two may not disagree.],
    )),
  )

  // ── 11. the catalogue of effects ───────────────────────────────────
  let fxrow(name, what) = (text(size: 19pt, fill: gold, name), text(size: 18pt, fill: dim, what))
  slide(
    title: "Page transitions",
    transition: "slide",
    note: [This page came in with `slide`: press ← and → to watch it again. The nine names are the whole vocabulary — everything else is a setting. Between frames of one page the root always cross-fades and elements enter by `mark(transition:)` instead.],
  )[
    #lesson(
      "Page transitions",
      [`deck(transition:)` is the default for turning to another page; `slide(transition:)` overrides it for one page. A string is the same effect both ways, `(enter:, leave:)` names the sides.],
      src(```typ
      #deck(transition: "fade")[…]     // the default
      #slide(transition: "slide")[…]   // this page only
      #slide(transition: (enter: "wipe-up", leave: "fade"))[…]
      #deck(transition: none)[…]       // no page transitions
      ```),
      screen(grid(
        columns: (auto, 1fr), column-gutter: 18pt, row-gutter: 13pt, align: (top, top),
        ..fxrow(raw("fade"), [cross-fade — the default]),
        ..fxrow(raw("slide"), [horizontal push; forward, the new page comes from the right]),
        ..fxrow(raw("rise"), [vertical push, in from the bottom]),
        ..fxrow(
          raw("zoom"),
          [the new one shrinks into place from three times life size, out of focus, and lands sharp],
        ),
        ..fxrow(
          stack(spacing: 6pt, raw("wipe-left  wipe-right"), raw("wipe-up  wipe-down")),
          [reveal, named by the direction the front travels],
        ),
        ..fxrow(raw("none"), [that side switches at once, while the transition still runs]),
      )),
      when: [Page effects govern *unmarked* content, and only between pages. `transition: none` turns them off.],
    )
  ]

  // ── 12. settings ───────────────────────────────────────────────────
  let knob(name, what) = (text(size: 19pt, fill: cyan, raw(name)), text(size: 18pt, fill: dim, what))
  slide(
    title: "Settings ride along",
    transition: (effect: "zoom", duration: 900, zoom: 4),
    note: [This page was given `(effect: "zoom", duration: 900, zoom: 4)`, so it comes in slower and from further away than the deck's default. The presenter's speed keys still divide it.],
  )[
    #lesson(
      "Settings ride along",
      [The same dictionary that names the effects carries the settings for *this* transition. Settings beside the effects belong to both sides; settings inside a side belong to that side and beat them.],
      src(```typ
      #slide(transition: (effect: "zoom", duration: 900, zoom: 4))[…]

      #slide(transition: (
        enter: (effect: "slide", duration: 200, push: -100%),
        leave: (effect: "fade", duration: 900),
        easing: (0.4, 0, 0.2, 1),
      ))[…]

      #mark("word", transition: (effect: "rise", duration: 400))[…]
      ```),
      screen(grid(
        columns: (auto, 1fr), column-gutter: 16pt, row-gutter: 11pt, align: (top, top),
        ..knob("duration", "milliseconds, as in deck(duration:)"),
        ..knob("easing", "the four numbers of a cubic Bézier"),
        ..knob("zoom", "how many times life size the zoom starts at"),
        ..knob("push", "how far slide and rise travel; negative goes the other way"),
        ..knob("fit", "\"none\" draws both images at their own size instead of stretching them into the box"),
        ..knob("anchor", "the corner they are pinned to when fit is none"),
      )),
      when: [A setting is a variable `deck.css` reads, so a typo is a compile error. Deck, slide and mark all take the same dictionary.],
    )
  ]

  // ── 13. layers, fit and anchor ─────────────────────────────────────
  let cd(body) = {
    set text(size: 22pt, fill: hi)
    diagram(cell-size: 26mm, edge-stroke: 1pt + rgb("#d5d9e2"), node-inset: 7pt, body)
  }
  slide(
    title: "Assemblies: layers",
    note: [When X's layer arrives the square glides over as one picture, because it *is* one picture: written once, laid out the same on every frame, and only ever moved as a whole. `meet` is the corner the arriving layer does not push; it has to be given, because HTML export reports sizes but not positions (typst\#5512).],
    ..reveal(3, (step, at) => lesson(
      "Assemblies: layers",
      [A group interpolates its *box* and cross-fades its two *pictures* — what is inside them is never moved. So what moves has to be one picture.],
      src(```typ
      #layers("pb", meet: bottom + right,
        cd({                     // the square, written once
          node((1, 0), $B$); node((1, 1), $D$)
          node((0, 0), at(2, mark("pbA", transition: "zoom")[$A$]))
          edge((0, 0), (1, 0), at(2, $p$), "->",
               stroke: at(2, 1pt + grey))
        }),
        if step >= 3 { cd({      // X, a layer of its own,
          node((0, 0), hide($A$))    // anchors drawn hidden
          node((-1, -1), mark("pbX", transition: "rise")[$X$])
        }) },
      )
      ```),
      screen(align(center + horizon, layers(
        "pb",
        // X arrives up and to the left, so the corner it does not push is the other one
        meet: bottom + right,
        cd({
          node((1, 0), $B$)
          node((1, 1), $D$)
          node((0, 1), $C$)
          edge((1, 0), (1, 1), $f$, "->")
          edge((0, 1), (1, 1), $g$, "->")
          node((0, 0), at(2, mark("pbA", transition: "zoom")[$A$]))
          edge((0, 0), (1, 0), at(2, $p$), "->", stroke: at(2, 1pt + rgb("#d5d9e2")))
          edge((0, 0), (0, 1), at(2, $q$), "->", stroke: at(2, 1pt + rgb("#d5d9e2")))
        }),
        if step >= 3 {
          cd({
            node((1, 0), hide($B$))
            node((1, 1), hide($D$))
            node((0, 1), hide($C$))
            node((0, 0), hide($A$))
            node((-1, -1), mark("pbX", transition: "rise")[$X$])
            edge((-1, -1), (1, 0), "->", bend: 30deg)
            edge((-1, -1), (0, 1), "->", bend: -30deg)
            edge((-1, -1), (0, 0), mark("pbU", transition: "wipe-right")[$exists!$], "-->")
          })
        },
      ))),
      when: [`reveal` keeps a picture from being re-laid-out; `layers` is for what arrives *outside* it.],
    )),
  )

  // ── 14. element animation ──────────────────────────────────────────
  let wave = cetz.canvas(length: 1.25cm, {
    import cetz.draw: circle, content, line, rect
    let (states,) = cz
    // the box and the axis are the canvas's own, drawn once
    rect((-0.5, -2.1), (8.5, 2.1), stroke: none)
    line((0, 0), (8, 0), stroke: .5pt + blue.darken(40%))
    states(
      ..range(0, 6).map(t => {
        let amp = 0.3 + 0.18 * t
        let f(x) = amp * calc.sin(1.2 * x - 0.5 * t)
        line(..range(0, 41).map(i => (i * 0.2, f(i * 0.2))), stroke: 1.5pt + blue)
        let x = 1.4 * t
        circle((x, f(x)), radius: .25, stroke: none, fill: color.mix((green, 100% - t * 20%), (amber, t * 20%)))
        content((4, -1.7), text(size: 30pt, fill: dim)[t = #t])
      }),
    )
  })
  slide(
    title: "Element animation",
    note: [→ steps through the six states and ← steps back; the page turns only once they are exhausted. Nothing here cross-fades: the curve bends, the ball slides, the colour blends. A transition would only cross-fade the two pictures.],
  )[
    #lesson(
      "Element animation",
      [Several bodies are the states of one drawing: `tween(s0, s1, …)`, or `states(…)` inside a canvas, where only what moves is a state. A drawing needs no `mark` — a mark is identity between pages, and this is motion inside one. `→` moves to the next, `←` back along the same path, and the browser interpolates the SVG nodes.],
      src(```typ
      #import "@preview/tween:0.1.0": compat
      #let cz = compat.cetz.tweened(cetz)   // once, per file

      #let wave = cetz.canvas({
        import cetz.draw: circle, line, rect, content
        let (states,) = cz
        rect((-0.5, -2.1), (8.5, 2.1), stroke: none)  // pin the box
        line((0, 0), (8, 0))              // the axis never moves
        states(..range(0, 6).map(t => {   // …these do
          let amp = 0.3 + 0.18 * t
          let f(x) = amp * calc.sin(1.2 * x - 0.5 * t)
          line(..range(0, 41).map(i => (i * .2, f(i * .2))))
          circle((1.4 * t, f(1.4 * t)), radius: .25, fill: …)
          content((4, -1.7), [t = #t])
        }))
      })

      #slide[#wave]
      ```),
      screen(align(center + horizon, wave)),
      when: [The states are *one drawing under different parameters*: write `f(t)`, feed it a few values.],
    )
  ]

  // ── 15. what interpolates ──────────────────────────────────────────
  let gon = cetz.canvas(length: 0.9cm, {
    import cetz.draw: content, polygon, rect
    let (states,) = cz
    rect((-2.6, -3.1), (2.6, 2.6), stroke: none)
    states(
      ..range(3, 9).map(k => {
        polygon((0, 0), k, radius: 2.2, fill: blue.transparentize(78%), stroke: 1.5pt + blue)
        content((0, -2.8), text(size: 26pt, fill: dim)[#k sides])
      }),
    )
  })
  let walk = ((0, 0), (1.2, 1.4), (2.6, 0.6), (3.4, 2.2), (4.8, 1.0), (6.0, 2.6), (7.2, 1.2))
  let trail = cetz.canvas(length: 0.9cm, {
    import cetz.draw: circle, line, rect
    let (states,) = cz
    rect((-0.4, -0.4), (7.6, 3.0), stroke: none)
    states(
      ..range(0, 6).map(k => {
        line(..walk.slice(0, k + 2), stroke: 2pt + green)
        // the dot is hollow at first and fills in: fill none against a colour fades
        circle(walk.at(k + 1), radius: .18, fill: if k == 0 { none } else { green }, stroke: 1pt + green)
      }),
    )
  })
  let bend = cetz.canvas(length: 0.9cm, {
    import cetz.draw: bezier, line, rect
    let (states,) = cz
    rect((-0.3, -1.4), (4.3, 1.4), stroke: none)
    states(
      ..range(0, 3).map(k => {
        if k == 0 { line((0, 0), (4, 0), stroke: 2pt + gold) } else {
          bezier((0, 0), (4, 0), (1.3, 0.6 * k), (2.7, -0.6 * k), stroke: 2pt + gold)
        }
      }),
    )
  })
  slide(
    title: "What interpolates",
    note: [Nothing here is drawn specially: the polygon gains a side, the line a segment, the dot a fill, the straight line becomes a curve. The runtime rewrites the shorter or simpler path so the two are the same list of commands: `H`/`V` against `L`, `S`/`T` against `C`/`Q`, a line as the straight curve it is, and zero-length segments to make up the count.],
  )[
    #lesson(
      "What interpolates",
      [The states' SVG nodes are compared one by one, and every property that differs is handed to `el.animate()`. Paths that are not the same list of commands are reconciled first.],
      src(```typ
      // each is one canvas, and inside it one states(…)
      states(..range(3, 9).map(k => polygon((0, 0), k)))  // a side more
      states(..range(0, 6).map(k => line(..walk.slice(0, k + 2))))
      states(..range(0, 3).map(k =>                       // a line
        if k == 0 { line((0, 0), (4, 0)) }                // becomes
        else { bezier((0, 0), (4, 0), c1(k), c2(k)) }))   // a curve
      ```),
      screen[
        #place(dx: 10pt, dy: 30pt, gon)
        #place(dx: 230pt, dy: 14pt, trail)
        #place(dx: 250pt, dy: 190pt, bend)
      ],
      when: [`none` against a colour becomes `transparent`. What has no in-between — text, an arc — cross-fades.],
    )
  ]

  // ── 16. designing the states ───────────────────────────────────────
  let counts = (6, 12, 24, 48, 96)
  let N = counts.last()
  let corners(k, r) = range(N).map(j => {
    let n = counts.at(k)
    let a = 2 * calc.pi * calc.quo(j * n, N) / n - calc.pi / 2
    (r * calc.cos(a), r * calc.sin(a))
  })
  let lerp(p, q, t) = (p.at(0) + t * (q.at(0) - p.at(0)), p.at(1) + t * (q.at(1) - p.at(1)))
  let fixed(x) = {
    let t = str(int(calc.round(x * 10000)))
    t.slice(0, 1) + "." + t.slice(1)
  }
  let exhaust = cetz.canvas(length: 1.12cm, {
    import cetz.draw: bezier, circle, content, merge-path, rect
    let (states,) = cz
    rect((-3.6, -4.6), (3.6, 4.6), stroke: none)
    circle((0, 0), radius: 3, stroke: .6pt + dim)
    states(
      ..range(0, 5).map(k => {
        let pts = corners(k, 3)
        merge-path(close: true, fill: blue.transparentize(78%), stroke: 1.5pt + blue, {
          for j in range(N) {
            let (p, q) = (pts.at(j), pts.at(calc.rem(j + 1, N)))
            bezier(p, q, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3))
          }
        })
        content((0, 3.9), text(size: 22pt, fill: dim)[#(
          counts.enumerate().map(((j, n)) => text(fill: if j == k { hi } else { dim })[#n]).join[ · ]
        )])
        content((0, -3.9), text(
          size: 22pt,
          fill: hi,
        )[#sym.pi ≈ #fixed(counts.at(k) * calc.sin(calc.pi / counts.at(k)))])
      }),
    )
  })
  slide(
    title: "Designing the states",
    note: [Liu Hui's exhaustion, and a lesson in writing states: every state is 96 points, the spare ones stacked on the corners, so a step swings half of every stack forward and the polygon opens like a fan.],
  )[
    #lesson(
      "Designing the states",
      [Two paths interpolate point for point, so *you* choose where the new vertices come from: draw every state with the same points and stack the spare ones where they should start.],
      src(```typ
      #let counts = (6, 12, 24, 48, 96)
      #let N = counts.last()      // one budget for all states
      #let corners(k, r) = range(N).map(j => {
        let n = counts.at(k)      // j-th point of the n-gon,
        let a = 2 * calc.pi * calc.quo(j * n, N) / n
        (r * calc.cos(a), r * calc.sin(a))   // spares stacked
      })
      // edges drawn as cubics: a zero-length *line* is dropped
      #states(..range(0, 5).map(exhaust))   // inside the canvas
      ```),
      screen(align(center + horizon, exhaust)),
      when: [Same for the labels: all five counts are drawn in every state, π keeps four decimals.],
    )
  ]

  // ── 17. dashes ─────────────────────────────────────────────────────
  let R = 1.35
  let CIRC = 2 * calc.pi * R // the ring's length, in canvas units
  let LEN = CIRC / 4 // the ink on it
  let SU = 1.25cm // the canvas's unit, as a length on the page
  let frame(f) = rect(
    width: 190pt,
    height: 142pt,
    radius: 6pt,
    stroke: (
      paint: hi,
      thickness: 2.5pt,
      // the period stays 12pt, so every dash keeps its place and grows
      // forward into its own gap: the gaps close, the pattern does not slide
      dash: (array: (6pt + 6pt * f, 6pt - 6pt * f), phase: 0pt),
    ),
  )
  let ring = cetz.canvas(length: SU, {
    import cetz.draw: rect
    let (circle, over) = cz
    rect((-1.62, -1.62), (1.62, 1.62), stroke: none)
    circle((0, 0), radius: R, stroke: 0.8pt + dim.transparentize(55%))
    circle(
      (0, 0),
      radius: R,
      // an empty dash, a gap up to where the ink starts, the ink, then a gap
      // longer than the path: one run placed anywhere, moved by one number —
      // and the number is the only thing over() varies, so the ring itself is
      // one circle in one canvas from first state to last
      stroke: (
        paint: blue,
        thickness: 3pt,
        dash: (
          array: over(..range(5).map(j => (0pt, j / 4 * (CIRC - LEN) * SU, LEN * SU, 2 * CIRC * SU))),
          phase: 0pt,
        ),
      ),
    )
  })
  let cap(body) = text(size: 15pt, fill: dim, body)
  // The box is Typst's own rect, so its states are a mark's; the ring is one
  // canvas whose interior moves. Both are on the same frame, and the frame
  // steps everything on it together.
  let inked = grid(
    columns: 2,
    column-gutter: 40pt,
    align: horizon + center,
    // The captions are the same words in every state on purpose: a number
    // that changes changes its glyphs, the states then differ in structure,
    // and the whole mark falls back to a cross-fade.
    stack(spacing: 16pt, tween(..range(5).map(j => frame(j / 4))), cap[the gaps close]),
    stack(spacing: 16pt, ring, cap[the ink travels]),
  )
  slide(
    title: "Dashes",
    note: [Both of these are one property. Growing a line from its end needs no dash — pad the states with points and `paths.js` aligns them — but a pattern cannot be written in points at all, and a piece of ink sliding along a path would mean re-listing that path's vertices in every state, which is geometry in motion and judders at the state rate. Here the box and the ring are the same points in every state and only four numbers move.],
  )[
    #lesson(
      "Dashes",
      [`stroke-dasharray` interpolates like any other property. It is worth reaching for when what you want is *not* expressible as points: a pattern, or ink that moves along a path that stays still.],
      src(```typ
      // gaps close: the period stays 12pt, so the dashes grow
      // forward into their own gaps instead of sliding along
      #let frame(f) = rect(..., stroke: (dash: (
        array: (6pt + 6pt * f, 6pt - 6pt * f), phase: 0pt)))

      // ink placed anywhere on the path: an empty dash, a gap
      // up to where it starts, the ink, a gap longer than the
      // path. Never `phase:` — Typst writes it to
      // stroke-dashoffset without flipping the sign, and the
      // PDF and the browser then disagree.
      #let ring = cetz.canvas(length: 1cm, {
        let (circle, over) = cz
        circle((0, 0), radius: R, stroke: (dash: (
          array: over(..range(5).map(j => (0pt,
            j / 4 * (CIRC - LEN) * 1cm, LEN * 1cm,
            2 * CIRC * 1cm))), phase: 0pt)))
      })

      #tween(..range(5).map(j => frame(j / 4)))
      #ring
      ```),
      screen(align(center + horizon, inked)),
      when: [Not for a line that simply grows from its end: give the states their points and let `paths.js` pad the shorter one. Reach for a dash when points cannot say it. Every state must carry the attribute — write the solid box as a zero gap, not as no dash — or the states differ in their attributes and the whole node cross-fades instead.],
    )
  ]

  // ── 18. continuous animation: keyframes ────────────────────────────
  let ball(i) = (
    keyframes: (
      (transform: "translateY(0) scale(1, 1)", transformOrigin: "50% 100%", easing: "cubic-bezier(.45, 0, 1, .55)"),
      (transform: "translateY(420%) scale(1, 1)", transformOrigin: "50% 100%", offset: .46, easing: "linear"),
      (transform: "translateY(420%) scale(1.3, .7)", transformOrigin: "50% 100%", offset: .5, easing: "linear"),
      (
        transform: "translateY(420%) scale(1, 1)",
        transformOrigin: "50% 100%",
        offset: .54,
        easing: "cubic-bezier(0, .45, .55, 1)",
      ),
      (transform: "translateY(0) scale(1, 1)", transformOrigin: "50% 100%"),
    ),
    duration: 1500,
    delay: i * 140,
  )
  let hues = (amber, gold, green, cyan, blue)
  slide(
    title: "Continuous animation",
    note: [Five marks, five keyframe animations: piecewise easing plays gravity, a scale squash lands them, a delay staggers them. Each ball says so itself; the page only starts them after the transition and pauses them when it is left.],
  )[
    #lesson(
      "Continuous animation",
      [`waapi.animate` is Web Animations from Typst: keyframes and options as the API takes them, handed to `el.animate()` as they are. No DSL of our own, and no deck required — it moves the same figure in a blog post.],
      src(```typ
      #let ball(i) = (
        keyframes: (
          (transform: "translateY(0)",
           easing: "cubic-bezier(.45, 0, 1, .55)"),
          (transform: "translateY(420%) scale(1.3, .7)",
           offset: .5, easing: "linear"),
          (transform: "translateY(0)"),
        ),
        duration: 1500, delay: i * 140,
      )
      #import "@preview/tween:0.1.0": waapi
      #for i in range(5) {
        place(…, waapi.animate(..ball(i))[…])
      }
      ```),
      screen[
        #for i in range(5) {
          place(
            dx: 40pt + i * 100pt,
            dy: 20pt,
            waapi.animate(..ball(i))[#std.circle(radius: 22pt, fill: hues.at(i))],
          )
        }
        #place(dx: 20pt, dy: 240pt, std.line(length: 500pt, stroke: 1pt + dim))
      ],
      when: [`duration`, `delay`, `easing`, `direction`, `iterations`; nothing plays under `prefers-reduced-motion`.],
    )
  ]

  // ── 19. follow ─────────────────────────────────────────────────────
  let lissajous = range(0, 121).map(i => {
    let a = i / 120 * 2 * calc.pi
    (3.1 * calc.sin(2 * a) + 3.3, 1.5 * calc.sin(3 * a) + 1.7)
  })
  slide(
    title: "follow: an element along a path",
    note: [The track and the ball are independent of each other; the ball may be placed anywhere, because `offset-path` puts its centre on the track. `orient: true` turns it with the tangent. Neither is a mark: nothing here is about the page.],
  )[
    #lesson(
      "follow: an element along a path",
      [`waapi.track` names a path and `follow:` runs an element's centre along it, on the compositor. It is the one convenience in the binding.],
      src(```typ
      #place(dx: 20pt, dy: 30pt, waapi.track("orbit", cetz.canvas({
        import cetz.draw: line
        line(..lissajous, close: true)
      })))
      #place(dx: 20pt, dy: 30pt, waapi.animate(
        follow: "orbit", duration: 4000,
      )[#std.circle(radius: .3cm)])
      #place(dx: 430pt, dy: 120pt, waapi.animate(
        keyframes: ((transform: "rotate(0)"),
                    (transform: "rotate(1turn)")),
        duration: 6000,
      )[#std.rect(…)])
      ```),
      screen[
        #place(dx: 20pt, dy: 40pt, waapi.track("orbit", cetz.canvas(length: 1cm, {
          import cetz.draw: line
          line(..lissajous, close: true, stroke: 1.5pt + blue)
        })))
        #place(
          dx: 20pt,
          dy: 40pt,
          waapi.animate(follow: "orbit", duration: 4000)[
            #std.circle(radius: .26cm, fill: green)
          ],
        )
        #place(
          dx: 430pt,
          dy: 130pt,
          waapi.animate(
            keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")),
            duration: 6000,
          )[#std.rect(width: 70pt, height: 70pt, radius: 8pt, fill: amber)],
        )
      ],
      when: [Three sources of keyframes: `keyframes` for the mark itself, `follow` for a path, and — next page — the mark's own states.],
    )
  ]

  // ── 20. states played over time ────────────────────────────────────
  // A treble clef, outlined the way a handwriting tutorial draws one. Not the
  // boundary of the filled glyph — that is four separate curves, the silhouette
  // and the three holes the stroke encloses — but the outline of the *pen*: the
  // stroke's centreline offset to both sides by the local ink width, with a cap
  // at each end. Where the stroke crosses itself the two outlines simply cross,
  // so this is one closed curve by construction, sampled here at 128 points.
  // Being closed, its series is periodic: the turn closes and the loop needs no
  // `alternate`. (tools/clef.py derives it from the glyph.)
  let clef = (
    (-0.0264, -1.1348),
    (-0.1029, -1.1888),
    (-0.0056, -1.2455),
    (0.1104, -1.2291),
    (0.2035, -1.1588),
    (0.2447, -1.0493),
    (0.2419, -0.9314),
    (0.2209, -0.8151),
    (0.1961, -0.6995),
    (0.1721, -0.5837),
    (0.1491, -0.4677),
    (0.1259, -0.3517),
    (0.1027, -0.2358),
    (0.0794, -0.1198),
    (0.0561, -0.0039),
    (0.0328, 0.112),
    (0.0098, 0.228),
    (-0.0153, 0.3435),
    (-0.0397, 0.4592),
    (-0.0631, 0.5751),
    (-0.0865, 0.6911),
    (-0.1019, 0.8082),
    (-0.108, 0.9263),
    (-0.0975, 1.044),
    (-0.0691, 1.1586),
    (-0.0073, 1.2581),
    (0.0996, 1.3),
    (0.2036, 1.2487),
    (0.2611, 1.1474),
    (0.2758, 1.0302),
    (0.274, 0.9121),
    (0.2556, 0.7954),
    (0.2208, 0.6826),
    (0.1585, 0.5824),
    (0.0882, 0.4873),
    (0.0178, 0.3923),
    (-0.0588, 0.3024),
    (-0.1434, 0.2198),
    (-0.2251, 0.1342),
    (-0.295, 0.0391),
    (-0.3488, -0.0661),
    (-0.3727, -0.1813),
    (-0.3672, -0.2992),
    (-0.329, -0.4104),
    (-0.2566, -0.5034),
    (-0.1623, -0.5743),
    (-0.0522, -0.6161),
    (0.0652, -0.6268),
    (0.1794, -0.5987),
    (0.2873, -0.551),
    (0.3627, -0.4616),
    (0.3875, -0.3468),
    (0.3725, -0.2302),
    (0.3077, -0.1328),
    (0.1978, -0.0959),
    (0.0816, -0.0753),
    (-0.0244, -0.1234),
    (-0.0889, -0.2207),
    (-0.0833, -0.3373),
    (-0.0174, -0.4339),
    (-0.0134, -0.475),
    (-0.1073, -0.4044),
    (-0.1644, -0.3019),
    (-0.1766, -0.1852),
    (-0.138, -0.0742),
    (-0.0617, 0.0151),
    (0.0438, 0.0668),
    (0.1607, 0.0636),
    (0.2758, 0.0365),
    (0.3789, -0.0182),
    (0.4413, -0.1177),
    (0.4664, -0.2328),
    (0.4586, -0.3505),
    (0.4253, -0.4636),
    (0.357, -0.5592),
    (0.2568, -0.6202),
    (0.1439, -0.6553),
    (0.0266, -0.6649),
    (-0.0897, -0.6447),
    (-0.1976, -0.5971),
    (-0.2918, -0.526),
    (-0.3688, -0.4366),
    (-0.4224, -0.3315),
    (-0.453, -0.2174),
    (-0.4664, -0.1002),
    (-0.4498, 0.0166),
    (-0.4117, 0.1284),
    (-0.3576, 0.2335),
    (-0.2898, 0.3302),
    (-0.2132, 0.4203),
    (-0.1294, 0.5037),
    (-0.0443, 0.5859),
    (0.0409, 0.6678),
    (0.1227, 0.7529),
    (0.1803, 0.856),
    (0.2141, 0.9689),
    (0.2155, 1.0868),
    (0.1657, 1.1893),
    (0.062, 1.1722),
    (-0.003, 1.074),
    (-0.0403, 0.9621),
    (-0.0518, 0.8446),
    (-0.0447, 0.7266),
    (-0.0237, 0.6103),
    (-0.0015, 0.4941),
    (0.0206, 0.378),
    (0.0467, 0.2627),
    (0.0709, 0.1469),
    (0.0945, 0.031),
    (0.118, -0.0849),
    (0.1414, -0.2008),
    (0.1646, -0.3167),
    (0.1878, -0.4327),
    (0.2117, -0.5485),
    (0.2394, -0.6635),
    (0.2674, -0.7783),
    (0.2898, -0.8944),
    (0.2992, -1.0121),
    (0.2787, -1.128),
    (0.2135, -1.2254),
    (0.1122, -1.2846),
    (-0.0043, -1.3),
    (-0.1175, -1.2693),
    (-0.2013, -1.1876),
    (-0.2299, -1.0751),
    (-0.1948, -0.9657),
    (-0.0837, -0.9435),
    (-0.0039, -1.0236),
  )
  let M = 45 // harmonics kept: the fastest turns 28 times a turn, under the S / 2 below
  let C = 6 // epicycle circles drawn
  let S = 120 // states in one turn
  let P = 360 // pen samples: the curve's own resolution
  let SUB = calc.quo(P, S) // samples per piece — a piece is a little polyline
  let step = calc.quo(P, S) // a whole number: state j puts the pen on sample step * j
  let TAIL = 40 // pieces the light reaches back over: a third of the turn
  let DOT = 0.035 // the pen's radius
  // One piece per state, and that is the whole design: a piece spans exactly
  // what the pen travels between two states, so the piece the pen is crossing
  // can carry its own dash and the browser fills it from 0 to 1 over exactly the
  // keyframe in which the pen crosses it — the ink ends on the pen at every
  // instant, not only on the states. Pieces shorter than that would be crossed
  // several per keyframe and would fill together, which is a comb, not a pen.
  // How finely a piece is *drawn* is a separate question: it is a polyline of
  // SUB samples, so the curve is as smooth as P makes it and the corners inside
  // a piece are proper joins.

  // komet's fft is a WASM plugin: complex in, complex out, run at compile time.
  // Its "backward" normalisation puts no factor on the forward transform, so a
  // coefficient is the transform over N; an index past N/2 is a negative frequency.
  let coef = {
    let n = clef.len()
    let out = ()
    for (k, z) in komet.fft(clef).enumerate() {
      let (re, im) = (z.at(0) / n, z.at(1) / n)
      out.push((n: if k * 2 <= n { k } else { k - n }, re: re, im: im, r: calc.sqrt(re * re + im * im)))
    }
    out.sorted(key: e => -e.r).slice(0, M)
  }
  // the chain at time t: every term turns at its own frequency, and the end of
  // the chain is the pen
  let chain(t) = {
    let (x, y) = (0.0, 0.0)
    let out = ((0.0, 0.0),)
    for e in coef {
      let (cs, sn) = (calc.cos(e.n * t), calc.sin(e.n * t))
      x += e.re * cs - e.im * sn
      y += e.re * sn + e.im * cs
      out.push((x, y))
    }
    out
  }
  let chains = range(S).map(j => chain(2 * calc.pi * j / S))
  let pen = range(P).map(i => chain(2 * calc.pi * i / P).last())
  // each piece's own length on the page: the dash that fills it is measured in
  // absolute lengths, and the pieces are not equal — the pen is sampled in the
  // series' time, so it covers more ground on the straight runs
  let U = 4.20cm // one canvas unit
  let seg = range(S).map(a => {
    let t = 0.0
    for k in range(SUB) {
      let (x0, y0) = pen.at(calc.rem(a * SUB + k, P))
      let (x1, y1) = pen.at(calc.rem(a * SUB + k + 1, P))
      t += calc.sqrt(calc.pow(x1 - x0, 2) + calc.pow(y1 - y0, 2))
    }
    t * U
  })
  let clef = cetz.canvas(length: 4.20cm, {
    import cetz.draw: circle, line, rect
    let (states,) = cz
    // the widest the circles ever reach, over every state: pin it, or the
    // origin moves from state to state
    rect((-0.83, -1.43), (0.83, 1.34), stroke: none)
    states(
      play: (duration: 6000),
      ..range(S + 1).map(j => {
        let j = calc.rem(j, S) // the last state is the first: the turn closes
        let ch = chains.at(j)
        for i in range(C) { circle(ch.at(i), radius: coef.at(i).r, stroke: 0.4pt + dim.transparentize(48%)) }
        line(..ch, stroke: 0.5pt + hi.transparentize(30%))
        // The trail. The pieces never move — a piece is the same two points in every
        // state — so there is no geometry to interpolate; what the states move is
        // the light on each piece, and how much of it is inked. Both are numbers the
        // browser interpolates, so both are continuous in time. Gone, not removed:
        // the states of a mark must have the same nodes, so a dead piece stays in
        // the drawing at zero opacity and zero ink.
        for a in range(S) {
          let age = calc.rem(j - a + S * 4, S)
          // ink only where the pen has already been, and only as far back as the
          // tail reaches: the piece ahead of the pen must be empty at the state, or
          // it would empty itself while it brightens and put ink in front of the pen
          let ink = if age >= 1 and age <= TAIL { 1.0 } else { 0.0 }
          let f = calc.max(0.0, 1 - calc.max(0.0, age - 1) / TAIL)
          line(
            ..range(SUB + 1).map(k => pen.at(calc.rem(a * SUB + k, P))),
            stroke: (
              paint: blue.transparentize(100% - 100% * f),
              thickness: (0.3 + 2.2 * f) * 1pt,
              // butt, so that two pieces meeting end to end do not paint the same
              // millimetre twice — with a translucent stroke that would bead at every
              // joint. The turn inside a piece is a proper join, and the turn at a
              // joint is small because the curve is sampled far finer than the pieces.
              cap: "butt",
              join: "round",
              dash: (array: (ink * seg.at(a), 4 * seg.at(a)), phase: 0pt),
            ),
          )
        }
        // The pen, at the end of the chain.
        circle(pen.at(step * j), radius: DOT, fill: green, stroke: none)
      }),
    )
  })
  slide(
    title: "States played over time",
    note: [
      A treble clef, outlined the way a handwriting tutorial draws one: the pen's own
      outline, crossing itself wherever the stroke does, so it is a single closed curve.
      Sampled at 128 points and turned into #M rotating vectors by komet's FFT, a WASM
      plugin run at compile time, so the HTML carries only the states it produced. The
      end of the chain is the pen.

      One turn of the series is one period, so the last state *is* the first and the loop
      has no seam to hide: `direction` stays `normal`. The outline is cut into #S pieces
      that never move — one per state, so a piece spans exactly what the pen travels
      between two of them — and what the states move is the light on each piece and how
      much of it is inked. Nothing is displaced from one state to the next, so there is no
      geometry for the browser to interpolate; the first version of this page listed the
      trail's strokes relative to the pen, moved 180 vertices every state, and juddered at
      exactly the keyframe rate. The piece the pen is crossing carries its own dash, and
      the browser fills that dash over exactly the keyframe in which the pen crosses it,
      so the ink ends on the pen at every instant and not only on the states. How finely a
      piece is drawn is a separate question: each is a polyline of #SUB samples of the
      curve, so the outline is smooth and the corners inside a piece are proper joins.
    ],
  )[
    #lesson(
      "States played over time",
      [Give an object an `anim:` with neither `keyframes` nor `follow`, and the *states of the drawings inside it become the keyframes*: stepping turns into playing.],
      src(```typ
      #import "@preview/komet:0.2.0" as komet

      #let coef = {               // the M largest terms of the DFT
        let n = clef.len()
        let out = ()
        for (k, z) in komet.fft(clef).enumerate() {
          let (re, im) = (z.at(0) / n, z.at(1) / n)
          out.push((n: if k * 2 <= n { k } else { k - n },
                    re: re, im: im, r: calc.sqrt(re * re + im * im)))
        }
        out.sorted(key: e => -e.r).slice(0, M)
      }
      // epicycles(j) draws the chain at t = 2πj/S over the outline,
      // whose pieces are lit by how far behind the pen they lie
      // and inked by how much of them the pen has crossed
      #let clef = cetz.canvas({
        let (states,) = cz
        rect((-0.83, -1.43), (0.83, 1.34))   // pin the box
        states(play: (duration: 6000), ..range(S + 1).map(epicycles))
      })
      #clef
      ```),
      screen(align(center + horizon, clef)),
      when: [An object animated this way counts no steps. The states are a sampling rate, and between two of them every number moves at a constant rate: anything turning faster than S/2 is aliased, and geometry re-listed per state changes velocity at every keyframe. Hence #M vectors, and a trail that is fixed pieces with moving light and moving ink.],
    )
  ]

  // ── 21. waves ──────────────────────────────────────────────────────
  let sea = cetz.canvas(length: 1.15cm, {
    import cetz.draw: circle, content, line, rect
    let (states,) = cz
    // the box and the sun do not move, so they are the canvas's own
    rect((-0.2, -2.2), (14.2, 3.2), stroke: none)
    circle((11.8, 2.2), radius: .5, fill: gold, stroke: none)
    states(
      play: (duration: 4000),
      ..range(0, 25).map(k => {
        let phi = k / 24 * 2 * calc.pi
        let surf(a, w, v, y0) = x => y0 + a * calc.sin(w * x + v * phi) + a * .35 * calc.sin(2.3 * w * x - 2 * v * phi)
        let layer(h, col) = line(
          ..range(0, 57).map(i => (i * .25, h(i * .25))),
          (14, -2),
          (0, -2),
          close: true,
          fill: col,
          stroke: none,
        )
        let h = surf(.35, 1.5, 1, -.1)
        layer(surf(.45, .9, 1, 1.1), rgb("#2b3a5c"))
        layer(surf(.4, 1.2, -1, .5), rgb("#3e5aa8"))
        layer(h, blue)
        let x = 4.5
        let y = h(x)
        let slope = (h(x + .05) - h(x - .05)) / .1
        content((x, y + .25), angle: calc.atan(slope), {
          set text(size: 22pt)
          box(baseline: -7pt, polygon(fill: gold, (0pt, 0pt), (30pt, 0pt), (25pt, 10pt), (5pt, 10pt)))
        })
      }),
    )
  })
  slide(
    title: "A seamless loop",
    note: [Three layers of summed sines, each with its own wavelength and speed, and a boat whose height and heading come from the front layer. The first and last state are equal, so the loop has no seam.],
  )[
    #lesson(
      "A seamless loop",
      [The same mechanism, twenty-five states, and one rule of composition: make the first state and the last state equal and the loop has nowhere to jump.],
      src(```typ
      #let sea = cetz.canvas({
        let (states,) = cz
        rect(…)                             // box and sun stay put
        circle((11.8, 2.2), radius: .5, fill: gold)
        states(play: (duration: 4000), ..range(0, 25).map(k => {
          let phi = k / 24 * 2 * calc.pi    // 0 … 2π over 25 states
          let surf(a, w, v, y0) = x => y0
            + a * calc.sin(w * x + v * phi)
            + a * .35 * calc.sin(2.3 * w * x - 2 * v * phi)
          …three layers, then the boat on the front one…
        }))
      })

      #sea
      ```),
      screen(align(center + horizon, sea)),
      when: [`iterations` is infinite by default; animations pause when the frame is left.],
    )
  ]

  // ── 22. CeTZ ───────────────────────────────────────────────────────
  let fig(r) = cetz.canvas(length: 1.3cm, {
    import cetz.draw: circle, content, line, rect
    circle((0, 0), radius: r, fill: amber, stroke: none)
    line((-2, 0), (2, 0), stroke: 2pt + blue)
    rect((-1, -1), (1, 1), stroke: 1.5pt + hi)
    content((0, -1.7), text(size: 24pt, fill: hi)[cetz])
  })
  slide(
    title: "CeTZ",
    note: [One key for the whole canvas: the box interpolates, the picture cross-fades. Elements that must move apart from each other want a canvas and a key each.],
    ..range(1, 3).map(k => lesson(
      "CeTZ",
      [`cetz.canvas` exports native SVG paths, so a canvas in a `mark` pairs by key exactly as text does — and its nodes are what an element animation interpolates.],
      src(```typ
      // CeTZ has a `mark` of its own (arrow heads), so
      // `import cetz.draw: *` shadows this one — by name.
      #import "@preview/cetz:0.5.2"

      #let fig(r) = cetz.canvas({
        import cetz.draw: circle, rect, content
        circle((0, 0), radius: r)   // cetz's circle here;
        rect((-1, -1), (1, 1))      // std.circle for Typst's
        content((0, -1.7), [cetz])
      })
      #slide(title: "CeTZ", [#mark("fig")[#fig(0.6)]],
                            [#mark("fig")[#fig(1.2)]])
      ```),
      screen(align(center + horizon, mark("fig")[#fig(if k == 1 { 0.6 } else { 1.2 })])),
      when: [The bounding box follows what is drawn: pin it with an invisible `rect(…, stroke: none)`.],
    )),
  )

  // ── 23. Third party packages ────────────────────────────────────
  let duo(rev) = {
    set text(size: 24pt, fill: hi)
    let arrow(a, b, label) = if rev { edge(b, a, label, "->") } else { edge(a, b, label, "->") }
    diagram(cell-size: 24mm, edge-stroke: 1pt + rgb("#d5d9e2"), node-inset: 7pt, {
      node((0, 0), $P$)
      node((1, 0), $B$)
      node((0, 1), $C$)
      node((1, 1), $D$)
      arrow((0, 0), (1, 0), $p$)
      arrow((0, 0), (0, 1), $q$)
      arrow((1, 0), (1, 1), $f$)
      arrow((0, 1), (1, 1), $g$)
    })
  }
  slide(
    title: "Third party packages",
    note: [→ turns every arrow round. Both states are the same drawing, so the arrowheads slide along the arrows instead of fading — an element animation over someone else's diagram.],
  )[
    #lesson(
      "Third party packages",
      [A slide is an `html.frame`, and inside a frame Typst's target is the *paged* one — so theorion and fletcher take their PDF branch and hand us a picture, which is what a mark can move.],
      src(```typ
      #import "@preview/theorion:0.6.0": *
      #import cosmos.simple: *
      #import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

      #let duo(rev) = diagram({
        let arrow(a, b, l) = if rev { edge(b, a, l, "->") }
                             else   { edge(a, b, l, "->") }
        node((0, 0), $P$); node((1, 0), $B$)
        node((0, 1), $C$); node((1, 1), $D$)
        arrow((0, 0), (1, 0), $p$); …
      })
      #slide[#tween(duo(false), duo(true))]
      ```),
      screen(align(center + horizon, tween(duo(false), duo(true)))),
      when: [Mark what the package takes as *content*; its arrows are drawn, so keep the geometry still.],
    )
  ]

  // ── 24. inside a formula ───────────────────────────────────────────
  let sq = mark.with("sq")
  let rhs = mark.with("rhs")
  let half = mark.with("half", transition: "rise")
  let add = mark.with("add", transition: "rise")
  let eqn(body) = align(center + horizon, text(size: 34pt, body))
  slide(
    title: "Inside a formula",
    note: [→ adds $(b/2)^2$ to both sides, then folds the left one up. The two left terms carry one key, so they converge into the square; the one added on the left leaves the way it came. What is left unmarked is the page's: `+` and `=` cross-fade, so a formula whose operators travel wants them marked too.],
    ..(
      eqn($ #sq($x^2$) + #sq($b x$) = #rhs($c$) $),
      eqn($ #sq($x^2$) + #sq($b x$) + #half($(b/2)^2$) = #rhs($c$) + #add($(b/2)^2$) $),
      eqn($ #sq($(x + b/2)^2$) = #rhs($c$) + #add($(b/2)^2$) $),
    ).map(r => lesson(
      "Inside a formula",
      [A mark is content and a formula is made of content, so a term is marked where it stands — handed over *as an equation*, not as bare math.],
      src(```typ
      #let sq = mark.with("sq")
      #let rhs = mark.with("rhs")
      #let half = mark.with("half", transition: "rise")
      #let add = mark.with("add", transition: "rise")

      #slide(title: "Completing the square",
        $ #sq($x^2$) + #sq($b x$) = #rhs($c$) $,
        $ #sq($x^2$) + #sq($b x$) + #half($(b/2)^2$)
            = #rhs($c$) + #add($(b/2)^2$) $,
        $ #sq($(x + b/2)^2$) = #rhs($c$) + #add($(b/2)^2$) $,
      )
      ```),
      screen(r),
      when: [A box lays content out as markup, which would set `b x` upright; as an equation it is untouched.],
    )),
  )

  // ── 25. the deck ───────────────────────────────────────────────────
  let opt(name, what) = (text(size: 17pt, fill: gold, raw(name)), text(size: 16pt, fill: dim, what))
  slide(
    title: "The deck",
    note: [Everything the player needs is decided here, on the Typst side: the runtime reads these and decides nothing of its own.],
  )[
    #lesson(
      "The deck",
      [`deck` is the document. Its arguments are the only global settings there are, and the PDF and the HTML both read them.],
      src(```typ
      #deck(
        title: "My talk",
        width: 1280pt, height: 720pt,
        pdf: auto,                  // the .pdf beside the .html
        duration: 700,              // milliseconds
        easing: (0.32, 0.72, 0, 1),
        transition: "fade",
        theme: auto,                // player chrome only
        fill: rgb("#111318"),
        font: ("DejaVu Sans", "Noto Sans CJK SC"),
        body,
      )

      #slide(title: "…", note: [speaker notes], …frames)
      ```),
      screen(grid(
        columns: (auto, 1fr), column-gutter: 14pt, row-gutter: 9pt, align: (top, top),
        ..opt("title", "document title"),
        ..opt("width / height", "layout size; the PDF page and the player's aspect ratio"),
        ..opt("pdf", "the toolbar's download link; none removes the button"),
        ..opt("duration", "default transition duration, in milliseconds"),
        ..opt("easing", "the four numbers of a cubic Bézier"),
        ..opt("transition", "default page-to-page effect"),
        ..opt("theme", "light or dark player chrome"),
        ..opt("fill", "layout background, painted the same in both formats"),
        ..opt("font", "font stack, glyph-by-glyph fallback"),
        ..opt("slide(title:)", "thumbnail caption; never in the layout"),
        ..opt("slide(note:)", "speaker notes; HTML only"),
      )),
      when: [`title` and `note` are content, not just strings: paragraphs, lists and emphasis all render in the notes.],
    )
  ]

  // ── 26. presenting ─────────────────────────────────────────────────
  let krow(k, what) = (key(k), text(size: 16pt, fill: dim, what))
  slide(
    title: "Presenting",
    note: [The deck opens on the desk, not in the show. Press #key[?] at any time for this table; #key[s] opens the speaker view, which you can drag to another screen.],
  )[
    #lesson(
      "Presenting",
      [The player is part of the deck: no server, no build step. Open the HTML file and it is a presentation.],
      src(```js
      window.vit
      // { go, next, prev, index, total,
      //   step, steps, speed, mode, deck }
      // step, speed and mode are writable;
      // mode is "desk" | "present" | "overview"

      const deck = document.querySelector('.vit-deck')
      // the new position is in the DOM, and then
      // it has finished moving — one for one,
      // e.detail is { index, step } for both
      deck.addEventListener('vit:move-ready', on)
      deck.addEventListener('vit:move-done', on)
      ```),
      screen(grid(
        columns: (auto, 1fr), column-gutter: 14pt, row-gutter: 6pt, align: (top, horizon),
        ..krow[→ ↓ Space][next position: next step, next frame, next page],
        ..krow[← ↑ ⌫][previous position],
        ..krow[Home End][first / last page],
        ..krow[1–9][jump to a page],
        ..krow[Esc / Enter][desk ⇄ presenting],
        ..krow[o / a][overview; a dot per position, hover to peek],
        ..krow[l][laser pointer],
        ..krow[b / .][black screen],
        ..krow[− = 0][slower / faster / reset, kept in localStorage],
        ..krow[s][speaker view: next page, notes, timer],
        ..krow[f][full screen],
        ..krow[?][this table],
      )),
      when: [The desk is what opens; its preview is a copy of this HTML at a hash, so it plays the real thing.],
    )
  ]

  // ── 27. choosing ───────────────────────────────────────────────────
  let pick(q, a, hue) = (
    block(
      width: 100%,
      inset: (x: 10pt, y: 7pt),
      radius: 5pt,
      fill: hue.transparentize(90%),
      stroke: (left: 3pt + hue),
      text(size: 16pt, fill: hi, q),
    ),
    text(size: 15pt, fill: dim, a),
  )
  slide(
    title: "Choosing",
    note: [The map: which question sends you to which call. Out of reach: hoisted regions paint above the page, overflow is clipped silently, a view transition is a bitmap halfway through a large size change, and glyph-level morphing between two different pieces of text is not attempted.],
  )[
    #lesson(
      "Choosing",
      [Nine calls, and the question each of them answers. When two would do, the one that keeps the layout still is the one that morphs.],
      src(```typ
      mark("key")[…]                 // this thing is that thing
      tween(s0, s1, …)               // one drawing, N parameters
      mark(transition: …)            // how this thing enters
      slide(a, b, c)                 // frames, written out
      build(a, b, c)                 // frames that accumulate
      reveal(n, (step, at) => …)     // frames that stay put
      layers(key, meet: …, a, b)     // an assembly that grows
      mark(key, anim: …)             // it moves on its own
      deck(transition:, duration:, …)// how pages turn
      ```),
      screen(grid(
        columns: (300pt, 1fr), column-gutter: 14pt, row-gutter: 9pt, align: (top, horizon),
        ..pick("Something is in two places?", [`mark`, one key], blue),
        ..pick("A page grows a line at a time?", [`build` — the later parts push the layout], green),
        ..pick("Parts arrive but nothing may shift?", [`reveal` — what is to come holds its space], cyan),
        ..pick("A drawing gains something outside itself?", [`layers` — what was there glides as one picture], gold),
        ..pick("A curve must bend, a pose must change?", [`tween` — a transition only cross-fades], amber),
        ..pick("It must move with nobody pressing?", [`tween(play:)`, `waapi.animate`], rgb("#e599f7")),
      )),
      when: [Out of reach: z-order, silently clipped overflow, a bitmap halfway through a big size change.],
    )
  ]
}

#deck(title: "vit — a tutorial", body)
