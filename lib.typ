/// vtslides — Typst 排版整页；要变形的地方用 `mark` 标一下，其余交给浏览器。
///
/// 身份通道是 *label*：SVG 导出把 `<lbl>` 变成包住内容的 `<g data-typst-label>`，
/// 子树就是边界；PDF 侧 label 完全免费，所以不按后端门控。
///
/// 三个词：*转场*是版面状态之间的切换（页与页、帧与帧），走 View Transitions；
/// *元素动画*是一个对象随参数变（`mark` 传多个状态，`→` 一步一步走），走 Web
/// Animations；*连续动画*同样是对象在动，但不停、不用按键（`slide(anim:)`）。
/// 判据只有一句：是版面变了，还是一个对象在动。设计取舍和浏览器的坑都在 README。

/// 转场的名字。每一种都是两帧之间的一对动作，后一帧怎么进、前一帧就怎么出：
/// `"fade"` 交叉淡化；`"slide"` 左右推（前进新的从右边进、旧的往左边出）；`"rise"`
/// 上下推（从下面进）；`"wipe-left"` / `"wipe-right"` / `"wipe-up"` / `"wipe-down"`
/// 揭开，名字是前沿走的方向（`wipe-up` 从底边开始往上扫，新的露出来、旧的被盖掉）；
/// `"none"` 直接切。后退总是原路倒放。
/// -> array
#let transitions = ("fade", "slide", "rise", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// `deck` 在 HTML 那一份里把它拨成 `"html"`。`mark` 需要知道自己在哪个后端，但
/// `html.frame` 里 `target()` 永远是 `"paged"`（帧就是按纸面排的），只能靠这个
/// state 从外面带进来。
/// -> state
#let _target = state("vt-target", "paged")

/// 这一页 `slide(anim:)` 点了名的 key。被连续播的多状态 `mark` 在 PDF 里取第一个
/// 状态（页面静止时的样子），没被点名的取最后一个（搭完的样子）。
/// -> state
#let _anim = state("vt-anim", ())

/// 检查一个转场名字合法。
/// -> none
#let _check(
  /// 转场名，或 `none`。
  /// -> str | none
  t,
) = assert(t == none or t in transitions, message: "transition 只能是 " + repr(transitions))

/// 给一段内容起个名字。同一个 `key` 在相邻两页出现，浏览器就把它们配成一对
/// 补间——位置、大小、颜色、旋转都算在内。这是*转场*：版面变了。
///
/// 传多个 body 就是*元素动画*：同一个对象的 N 个状态，放映时 `→` 从一个状态
/// 走到下一个，`←` 原路退回，走完了才翻页。状态之间不是快照淡入淡出，而是对象
/// 自己的几何在动——浏览器（Web Animations API）在两个状态对应的 SVG 节点之间
/// 插值：path 的 `d`、transform、颜色、线宽、透明度。所以各个状态必须是*同一张
/// 图的不同参数*——同样的结构、同样的元素个数，只有数值不同；写成一个函数
/// `f(t)` 再喂几个 t 最自然：
///
/// ```typ
/// #mark("wave", ..range(0, 6).map(t => wave(t)))
/// ```
///
/// 结构对不上的（元素个数变了）退化成直接切换，控制台会提示。PDF 里没有放映，
/// 取最后一个状态（图搭完的样子，跟讲义一个道理）。HTML 里其余状态叠在第一个
/// 状态的盒子上（`place`，不占版面），由运行时藏起来当数据用。
///
/// 同一页里 `slide(anim:)` 也点了这个 `key` 的话，这些状态改作连续动画的关键帧，
/// 按时间循环播，不再按键走；PDF 里取第一个状态（页面静止时的样子）。
///
/// 里面那层 `box` 不是装饰：label 挂在前一个元素上，不包 box 的话它挂到的东西在
/// SVG 里根本不生成节点。排版代价是 0，长文本照样换行（README 有实测）。
/// -> content
#let mark(
  /// 名字。相邻两页同名的内容配成一对。
  /// -> str
  key,
  /// 这个标记自己的进场/退场效果，名字见 `transitions`：这次过渡里它是单边的
  /// （新出现，或者消失）才生效，配上对的照样 morph；退场是进场的倒放。`"wipe-up"`
  /// 从底边往上揭开，`"slide"` 从右边推进来（按自己的宽度），`"none"` 直接出现。
  /// 不写（`none`）= 并回整页：页内就是随版面交叉淡化，页间就跟整页一起推、揭、淡。
  /// 定义、定理、证明各从不同的边揭开，就是三个 mark 各写一个。
  /// -> none | str
  transition: none,
  /// 一个 body 就是普通标记；多个 body 就是这个对象的各个状态。
  /// -> content
  ..states,
) = {
  let s = states.pos()
  assert(s.len() > 0, message: "mark 至少要一个 body")
  assert(states.named().len() == 0, message: "mark 只有 transition 一个具名参数")
  _check(transition)
  // 效果跟在 key 后面进 label（vt-thm|wipe-up），hoist 拆出来挂到宿主上
  let lbl = label("vt-" + key + if transition == none { "" } else { "|" + transition })
  if s.len() == 1 { [#box(s.first())#lbl] } else {
    context if _target.get() == "html" {
      [#box({
        [#box(s.first())#label("vt-" + key + "@0")]
        for (i, x) in s.enumerate().slice(1) {
          place(top + left, [#box(x)#label("vt-" + key + "@" + str(i))])
        }
      })#lbl]
    } else { [#box(if key in _anim.get() { s.first() } else { s.last() })#lbl] }
  }
}

/// 幻灯片外壳：页面尺寸、字体，HTML 侧再带上样式表和运行时。
///
/// 只出一种格式时直接 `#show: deck.with(title: "…")`；两种都要用 `bundle`。
/// -> content
#let deck(
  /// 文档标题。
  /// -> str
  title: "vtslides",
  /// 版面宽度。PDF 是页面尺寸，HTML 里每一帧的 `html.frame` 也是这个尺寸——`slide`
  /// 从 `page.width` / `page.height` 读，不写死。
  /// -> length
  width: 1280pt,
  /// 版面高度。
  /// -> length
  height: 720pt,
  /// 工具栏上 PDF 下载链接的地址。`auto` = 跟 HTML 同名的 `.pdf`，`none` = 不放
  /// 这个按钮，字符串 = 直接用它。
  /// -> auto | none | str
  pdf: auto,
  /// 过渡时长，毫秒。放映时还能用 `-` / `=` / `0` 临场调倍率。
  /// -> int
  duration: 700,
  /// 页间的默认转场——翻到另一页时没被 `mark` 标记的内容怎么进出，名字见
  /// `transitions`。配上对的标记不受影响照样 morph，单边的标记没写自己的效果就并
  /// 回整页一起走。页内帧与帧之间不用它：版面没动，只是增量变化，一律交叉淡化，
  /// 元素自己的进出场写在 `mark(transition:)` 上。单页可以用 `slide(transition:)` 覆盖。
  /// -> str
  transition: "fade",
  /// 放映器界面（工具栏、总览、演讲者视图）的明暗。`auto` 跟系统，`"dark"` /
  /// `"light"` 固定。只管界面，版面颜色是 Typst 排的。
  /// -> auto | str
  theme: auto,
  /// 版面底色。PDF 走 `page(fill:)`；HTML 的 `html.frame` 不带页面底色，所以同一个
  /// 值再作为 `--vt-page` 交给 CSS 铺在幻灯片和缩略图底下——两边一致，也不会跟着
  /// 界面明暗变。
  /// -> color
  fill: rgb("#111318"),
  /// 字体候选，按顺序逐字形回退。默认里带一个 CJK 家族是有原因的：只写
  /// `"DejaVu Sans"` 的话中文会逐字形散落到系统里任意一个有该字的家族，同一行里
  /// 粗细都能不一样。
  /// -> array
  font: ("DejaVu Sans", "Noto Sans CJK SC"),
  /// 各页。
  /// -> content
  body,
) = {
  _check(transition)
  assert(theme in (auto, "dark", "light"), message: "theme 只能是 auto、\"dark\" 或 \"light\"")
  set document(title: title)
  set page(width: width, height: height, margin: 0pt, fill: fill)
  set text(size: 26pt, fill: rgb("#d5d9e2"), font: font)
  context {
    if target() == "html" {
      _target.update("html")
      html.style(read("deck.css"))
      html.elem(
        "div",
        attrs: (
          class: "vt-deck",
          "data-transition": transition,
          "data-duration": str(duration),
          "data-theme": if theme == auto { "auto" } else { theme },
          style: "--vt-page:" + fill.to-hex() + ";--vt-w:" + str(width.pt()) + ";--vt-h:" + str(height.pt()),
          "data-pdf": if pdf == auto { "auto" } else if pdf == none { "none" } else { pdf },
        ),
        body,
      )
      html.script(read("hoist.js"))
      html.script(read("runtime.js"))
    } else { body }
  }
}

/// 一页。HTML 侧是整页 `html.frame`（所以和 PDF 逐像素一致），PDF 侧就是一页。
///
/// 传多个 body 就是*同一页的多帧*：翻页时一帧一帧走，缩略图里它们合成一张，
/// 右下角用小圆点指示到了第几个位置。帧之间照样走 View Transitions，所以「第二帧
/// 比第一帧多一行」这种增量，是元素级的补间而不是整页跳变。
///
/// ```typ
/// #slide(title: "两帧")[第一帧][第一帧 + 追加的]
/// ```
/// -> content
#let slide(
  /// 只在缩略图的标题栏里出现，不进版面。可以是 content。
  /// -> content | str | none
  title: none,
  /// 演讲者备注。只进 HTML，放在这一页的 `<aside class="vt-note">` 里（版面上
  /// 不显示，也不进 PDF），放映时按 `s` 打开的演讲者视图读它。可以是 content，
  /// 段落、列表、强调照常排。
  /// -> content | str | none
  note: none,
  /// 覆盖 `deck(transition:)`：从别的页翻到这一页时整页怎么进（页间）。页内帧与帧
  /// 之间不用它；单个元素的进出场写在 `mark(transition:)` 上。后退时以离开的那一页
  /// 为准，所以过渡总是原路倒放。
  /// -> none | str
  transition: none,
  /// 连续动画，页面停在这一帧时一直跑。`key → spec`，spec 直接就是 Web Animations
  /// API 的 keyframes + options（`duration` 毫秒、`easing`、`direction`、
  /// `iterations`，默认无限循环、linear），原样交给 `el.animate()`：
  ///
  /// ```typ
  /// anim: (spin: (keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")), duration: 4000))
  /// ```
  ///
  /// 三种关键帧来源：写 `keyframes` 就动这个标记本身（transform、opacity……）；
  /// `(follow: "track", duration: 3000)` 让这个标记的中心沿同一帧里 `mark("track")`
  /// 的第一条 path 跑（小球沿轨迹），`orient: true` 则朝向随切线；两者都不写、而
  /// 这个 `key` 的 `mark` 带了多个状态，那些状态就是关键帧——同一段代码算出的
  /// N 个姿态按时间连续播（双摆、波浪）。翻页过渡播完才开始，离开这一帧就暂停。
  /// -> dictionary
  anim: (:),
  /// 这一页的各帧。一个都不传就是一页空白。
  /// -> content
  ..frames,
) = {
  let bodies = frames.pos()
  if bodies.len() == 0 { bodies = ([],) }
  _check(transition)
  let section = (class: "vt-slide")
  if transition != none { section.insert("data-transition", transition) }
  if anim.len() > 0 { section.insert("data-anim", json.encode(anim)) }
  context {
    _anim.update(anim.keys())
    if target() == "html" {
      html.elem(
        "div",
        attrs: (class: "vt-group"),
        {
          // 标题和备注都藏在组里（CSS display:none），runtime 读 textContent / innerHTML；
          // 让浏览器把 content 压成文字，不用自己遍历内容树
          if title != none { html.elem("div", attrs: (class: "vt-title"), title) }
          bodies
            .map(body => html.elem(
              "section",
              attrs: section,
              html.elem(
                "div",
                attrs: (class: "vt-page"),
                html.frame(block(width: page.width, height: page.height, inset: 60pt, body)),
              ),
            ))
            .join()
          if note != none { html.elem("aside", attrs: (class: "vt-note"), note) }
        },
      )
    } else {
      for body in bodies {
        block(width: 100%, height: 100%, inset: 60pt, body)
        pagebreak(weak: true)
      }
    }
  }
}

/// 一次编译同时出 PDF 和 HTML：
///
/// ```sh
/// typst compile --features html,bundle --format bundle demo.typ out/
/// ```
///
/// 产出 `out/<name>.pdf` 和 `out/<name>.html`，工具栏里的下载链接自动指向前者。
/// `--format bundle` 的顶层不能直接放内容，所以内容先 `let` 出来再传进来。
/// -> content
#let bundle(
  /// 产物基名。
  /// -> str
  name: "slides",
  /// 其余具名参数原样转给 `deck`。
  /// -> arguments
  ..args,
  /// 各页。
  /// -> content
  body,
) = {
  let opts = args.named()
  if "pdf" not in opts { opts.insert("pdf", name + ".pdf") }
  document(name + ".pdf", deck(..opts, body))
  document(name + ".html", deck(..opts, body))
}
