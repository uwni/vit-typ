// One compile produces examples/out/demo.pdf and examples/out/demo.html:
//
//   typst compile --features html,bundle --format bundle examples/demo.typ examples/out
//
// Once published, replace the next line with #import "@preview/vtslides:0.1.0": *
#import "../lib.typ": *
#import "@preview/cetz:0.4.1"

#let dim = rgb("#8992a5")
#let hi = rgb("#f2f4f8")
#let B(body) = text(size: 40pt, weight: 700, fill: rgb("#7aa2ff"), body)

// the small heading in every page's corner; same key everywhere, so it stays put across pages
#let head(body) = mark("title")[#text(size: 28pt, weight: 700, fill: hi, body)]

#let body = {
  // ── 1. the same key is the same thing ────────────────────────────────
  // note: speaker notes, HTML only, shown in the window opened with `s`.
  slide(
    title: "标记，不是坐标",
    note: "开场：这套东西的核心只有一句话——给要变形的内容起个名字，其余交给 Typst 和浏览器。",
  )[
    #set align(center + horizon)
    #mark("title")[#text(size: 72pt, weight: 700, fill: hi)[标记，不是坐标]]

    #v(16pt)
    #mark("sub")[#text(size: 26pt, fill: dim)[版面完全由 Typst 决定]]
  ]

  // Two frames of one page: the second only adds a formula. One thumbnail with two
  // dots; the added line is interpolated in, the page does not jump.
  let expanded = [
    #mark("title")[#text(size: 40pt, weight: 700, fill: hi)[标记，不是坐标]]

    #v(20pt)
    这一页的标题小了、跑到左上角了——但源码里没有任何坐标。
    两页都只是普通的 Typst 排版，只在要变形的地方套了一个 `#mark("title")`。

    #v(10pt)
    #mark("sub")[#text(size: 26pt, fill: dim)[版面完全由 Typst 决定]]
  ]

  slide(
    title: "版面完全由 Typst 决定",
    note: [
      两帧共用一条备注。先讲标题为什么会*自己*缩小到左上角，
      再按一下出公式：

      - 源码里没有坐标
      - 第二帧只是多了一行
      note 由 typst 编译成 HTML，因此支持公式 $sqrt(4) = 2$
    ],
    expanded,
    expanded
      + [
        #v(16pt)
        #mark("eq")[#math.equation(
          block: true,
          alt: "高斯积分等于根号 pi 的一半",
        )[$integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$]]
      ],
  )

  slide(title: "高斯积分", note: "公式从上一页的小字变成整页大字——同一个 key，浏览器自己补间。")[
    #set align(center + horizon)
    #mark("eq")[#text(size: 44pt)[#math.equation(
      block: true,
      alt: "高斯积分等于根号 pi 的一半",
    )[$integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$]]]
  ]

  // ── nesting: the browser lifts the inner mark out of the outer snapshot; each flies on its own ──
  let nest(sz, al) = [
    #set align(al)
    #mark("outer")[#text(size: sz, fill: hi)[外面 #mark("inner")[#text(fill: rgb("#ff9f45"))[里面]] 后面]]
  ]

  slide(
    title: "嵌套的标记",
    nest(52pt, center + horizon),
    nest(28pt, left + top),
  )

  // ── the same key several times on one page: one-to-many splits, many-to-one merges ──
  let cell(body) = box(fill: rgb("#2b3a5c"), inset: 14pt, radius: 6pt, text(size: 30pt, weight: 700, fill: hi, body))

  slide(
    title: "分裂与归并",
    [
      #set align(center + horizon)
      #mark("cell")[#cell[一个]]
    ],
    [
      #place(dx: 60pt, dy: 180pt, mark("cell")[#cell[一个]])
      #place(dx: 480pt, dy: 380pt, mark("cell")[#cell[一个]])
      #place(dx: 880pt, dy: 120pt, mark("cell")[#cell[一个]])
    ],
    // three to two: counts need not divide, name i takes source floor(i·k/K)
    [
      #place(dx: 220pt, dy: 260pt, mark("cell")[#cell[三变二]])
      #place(dx: 760pt, dy: 260pt, mark("cell")[#cell[三变二]])
    ],
    [
      #set align(center + horizon)
      #mark("cell")[#cell[又合回来]]
    ],
  )

  // ── 2. overlap and crossing: every mark is its own group ─────────────
  // section page: the whole page pushes in from the right (the deck default is fade); the marked heading morphs regardless
  slide(title: "重叠与交叉 · 引子", transition: "slide")[
    #head[重叠与交叉]

    #v(24pt)
    #text(size: 24pt, fill: dim)[
      接下来五页里 A 和 B 会包围盒重叠、分道扬镳、对角交叉、正面对穿。
      每个标记在过渡里是*自己的一组快照*，所以谁挡谁只是 z-index 的事，
      不是「算不出来」的事。
    ]
  ]

  // Five frames: overlapping boxes → parting → crossing diagonally → passing through on one line.
  // One thumbnail, five dots.
  // A changes position, size and colour on every frame — five frames read as **one object
  // changing continuously**, not five "vanish and reappear". B only moves, for comparison.
  let ab(ax, ay, bx, by, sz, hue) = [
    #head[重叠与交叉]
    #place(dx: ax, dy: ay, mark("A")[#text(size: sz, weight: 700, fill: hue)[AAAAAAAA]])
    #place(dx: bx, dy: by, mark("B")[#B[BBBBBBBB]])
  ]

  slide(
    title: "重叠与交叉",
    ab(40pt, 120pt, 240pt, 160pt, 40pt, rgb("#ff9f45")),
    ab(40pt, 480pt, 800pt, 120pt, 52pt, rgb("#ffd166")),
    ab(800pt, 480pt, 40pt, 120pt, 64pt, rgb("#8ce99a")),
    ab(40pt, 300pt, 800pt, 300pt, 52pt, rgb("#66d9e8")),
    ab(800pt, 300pt, 40pt, 300pt, 40pt, rgb("#7aa2ff")),
  )

  // ── theorem environment: three blocks revealed from three different edges ──
  // The enter/leave effect sits on the element that appears: mark(transition:). New on
  // this frame, it enters with its own effect (definition wipes down, theorem wipes up,
  // proof wipes in from the right); going back, the one that disappears leaves with the
  // same effect reversed; the ones present on both frames (definition, theorem) just morph.
  let env(kind, hue, body) = block(
    width: 100%, inset: (left: 24pt, rest: 16pt), radius: 6pt,
    fill: hue.transparentize(88%), stroke: (left: 3pt + hue),
    text(size: 22pt, fill: hi)[#text(weight: 700, fill: hue)[#kind]#h(12pt)#body],
  )
  let definition = mark("def", transition: "wipe-down", env("定义", rgb("#7aa2ff"))[
    数列 $(a_n)$ 是*柯西列*：对任意 $epsilon > 0$，存在 $N$，使得 $m, n > N$ 时 $|a_m - a_n| < epsilon$。
  ])
  let theorem = mark("thm", transition: "wipe-up", env("定理", rgb("#ff9f45"))[实数列收敛，当且仅当它是柯西列。])
  let proof = mark("proof", transition: "wipe-left", env("证明", rgb("#8ce99a"))[
    收敛则柯西：$|a_m - a_n| <= |a_m - a| + |a - a_n|$。
    柯西则有界，由 Bolzano–Weierstrass 取收敛子列 $a_(n_k) -> a$，
    再用柯西性把整列拉到 $a$。$qed$
  ])
  slide(
    title: "定义 · 定理 · 证明",
    note: [三个 `mark(transition:)`：定义 wipe-down、定理 wipe-up、证明 wipe-left。新出现的按自己的效果进场，后退时倒放退场。],
    [#head[定义 · 定理 · 证明] #v(20pt) #definition],
    [#head[定义 · 定理 · 证明] #v(20pt) #definition #v(14pt) #theorem],
    [#head[定义 · 定理 · 证明] #v(20pt) #definition #v(14pt) #theorem #v(14pt) #proof],
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
    title: "CeTZ 也能变形",
    [
      #set align(center + horizon)
      #mark("fig")[#fig(0.6)]
    ],
    [
      #place(dx: 60pt, dy: 40pt, mark("fig")[#fig(1.0)])
      #place(dx: 60pt, dy: 300pt, text(size: 22pt, fill: dim)[
        `mark("fig")[#cetz.canvas(…)]` —— canvas 导出的是原生 SVG path，\
        和文字一样按 key 配对：位置、尺寸补间，内容交叉淡入淡出。
      ])
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
    title: "CeTZ · 元素动画",
    note: [`mark("wave", ..range(0, 6).map(wave))`：六个状态叠在一处，→ 走一步、← 退一步，走完才翻页。曲线是 path 的 `d` 在插值，小球是 transform 和 fill，"t = 几" 是字形，直接切。],
  )[
    #head[元素动画]
    #place(dx: 120pt, dy: 200pt, mark("wave", ..range(0, 6).map(wave)))
    #place(dx: 120pt, dy: 560pt, text(size: 22pt, fill: dim)[
      `mark("wave", ..range(0, 6).map(wave))` —— 同一张图的六个参数，→ 一步一步走。
    ])
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
    title: "连续动画",
    note: [小球沿 `mark("track")` 里的 path 循环跑（`follow`），方块是原生 keyframes 旋转。离开这页就暂停。],
    anim: (
      dot: (follow: "track", duration: 4000),
      spin: (keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")), duration: 6000),
    ),
  )[
    #head[连续动画]
    #place(dx: 120pt, dy: 180pt, mark("track")[#cetz.canvas(length: 1cm, {
      import cetz.draw: line
      line(..lissajous, close: true, stroke: 1.5pt + rgb("#7aa2ff"))
    })])
    #place(dx: 120pt, dy: 180pt, mark("dot")[#std.circle(radius: .3cm, fill: rgb("#8ce99a"))])
    #place(dx: 900pt, dy: 300pt, mark("spin")[#std.rect(width: 90pt, height: 90pt, radius: 10pt, fill: rgb("#ff9f45"))])
    #place(dx: 120pt, dy: 560pt, text(size: 22pt, fill: dim)[
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
    title: "弹跳小球",
    note: [五个球五条 WAAPI 动画，keyframes 原样写在 `anim:` 里：分段 easing 是重力，落地一帧压扁。],
    anim: range(5).map(i => ("ball" + str(i), ball(i))).to-dict(),
  )[
    #head[弹跳小球]
    #for i in range(5) {
      place(dx: 200pt + i * 180pt, dy: 60pt, mark("ball" + str(i))[#std.circle(radius: 28pt, fill: hues.at(i))])
    }
    #place(dx: 120pt, dy: 430pt, std.line(length: 920pt, stroke: 1pt + dim))
    #place(dx: 120pt, dy: 480pt, text(size: 20pt, fill: dim)[
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
    title: "单摆与双摆",
    note: [单摆是两帧 keyframes（绕悬点 rotate，alternate）。双摆在 Typst 里用 RK4 积分出 96 个姿态塞进 `mark`，`anim: (double: (duration: 8000, direction: "alternate"))` 把它们当关键帧连续播。],
    anim: (
      single: (
        keyframes: ((transform: "rotate(32deg)", transformOrigin: "50% 0"), (transform: "rotate(-32deg)", transformOrigin: "50% 0")),
        duration: 1400, direction: "alternate", easing: "ease-in-out",
      ),
      double: (duration: 8000, direction: "alternate"),
    ),
  )[
    #head[单摆与双摆]
    #place(dx: 260pt, dy: 100pt, mark("single")[#pendulum])
    #place(dx: 560pt, dy: 60pt, mark("double", ..poses.map(pose)))
    #place(dx: 120pt, dy: 520pt, text(size: 20pt, fill: dim)[
      左：`keyframes` 绕悬点转。右：RK4 积出 96 个姿态，`mark("double", ..poses.map(pose))`，`anim` 点名连续播。
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
    title: "海浪",
    note: [`mark("sea", ..range(0, 25).map(sea))` + `anim: (sea: (duration: 4000))`：三层浪各自的 path 在插值，小船的位置和朝向是 transform 在插值。首尾状态相同，循环无缝。],
    anim: (sea: (duration: 4000)),
  )[
    #head[海浪]
    #place(dx: 100pt, dy: 120pt, mark("sea", ..range(0, 25).map(sea)))
    #place(dx: 120pt, dy: 560pt, text(size: 20pt, fill: dim)[
      `mark("sea", ..range(0, 25).map(sea))` —— 三层浪、一条船，25 个状态连续播。
    ])
  ]
}

#bundle(name: "demo", title: "vtslides — 标记，不是坐标", body)
