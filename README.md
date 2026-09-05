# vtslides

Typst 排版整页，标记的元素跨页平滑变形——**转场**由浏览器原生的 View Transitions API 完成；
一个对象随参数变（CeTZ 的图换一个 t）——**元素动画**由 Web Animations API 在 SVG 节点上插值完成。

一份 `.typ` 同时出 PDF 和 HTML，两者逐像素一致。运行时只有翻页导航、一次加载时的 DOM 整理，
和把两个状态的属性差交给浏览器——**没有一行自己写的插值代码**。

```sh
typst compile --root . --features html,bundle --format bundle \
  examples/demo.typ examples/out
#   → examples/out/demo.pdf  +  examples/out/demo.html      一次编译，两个格式
```

`--format bundle` 让文档自己决定产出哪些文件，`bundle()` 就在里面调两次
`document(路径, …)`——一次 `.pdf` 一次 `.html`。同一棵内容树走两个后端，
`target()` 各自正确，所以两份产物**必然**同源，不会出现「改了忘了重编另一个」。

也可以只出一种：

```sh
typst compile --features html --format html demo.typ demo.html
typst compile --features html               demo.typ demo.pdf
```

## 为什么会有这个东西

调研结论：**在此之前没有人把 Typst 和 View Transitions 拼在一起。**

| 项目 | Typst → HTML 幻灯片 | 动画机制 |
| --- | --- | --- |
| [Typstage](https://github.com/Loewe1000/typstage) | 每页排版成 SVG 内嵌 | **Web Animations API**，逐字形形状匹配 |
| [slipst](https://github.com/Wybxc/slipst) | 是（纵向滚动的 "slip"） | 自己写的 CSS/JS 滑动 |
| [Bifold](https://forum.typst.app/t/bifold-simple-web-presentation-with-typst/9467) | 是（概念验证） | 未涉及过渡 |
| [Touying](https://typst.app/universe/package/touying/) / [Polylux](https://github.com/polylux-typ/polylux) | 否（PDF） | PDF 分步显示 |
| [Marp](https://github.com/orgs/marp-team/discussions/168) / [Slidev](https://sli.dev) | — | **用了 View Transitions**，但源格式是 Markdown |

## 用法

```typst
#import "@preview/vtslides:0.1.0": *

#let body = {
  slide[
    #set align(center + horizon)
    #mark("title")[#text(size: 72pt, weight: 700)[标记，不是坐标]]
  ]

  slide[
    #mark("title")[#text(size: 40pt, weight: 700)[标记，不是坐标]]
    这一页标题小了、跑到左上角了——但源码里没有任何坐标。
  ]
}

#bundle(name: "demo", title: "我的演讲", body)
```

`bundle` 是 `--format bundle` 的入口，顶层不能直接放内容，所以内容先 `let` 出来。
完整的 API 文档由 [tidy](https://typst.app/universe/package/tidy) 从 `lib.typ` 的 `///` 注释生成：
`typst compile --root . docs/api.typ docs/api.pdf`。
只想出一种格式的话直接用 `deck`：`#show: deck.with(title: "我的演讲")`。

| 参数 | 说明 |
| --- | --- |
| `bundle(name:)` | 产物基名，出 `<name>.pdf` + `<name>.html`；其余具名参数原样转给 `deck` |
| `deck(title:)` | 文档标题 |
| `deck(width:, height:)` | 版面尺寸，默认 1280pt × 720pt。PDF 是页面尺寸；HTML 里每一帧的 `html.frame` 从 `page.width` / `page.height` 读同一个值，放映器的宽高比也跟着（`--vt-w` / `--vt-h`） |
| `deck(pdf:)` | 工具栏下载链接。`auto` = 与本页同名的 `.pdf`，`none` = 不放这个按钮，字符串 = 直接用它。走 `bundle` 时自动填好 |
| `slide(title:)` | 只出现在缩略图的标题栏里，不进版面。可以是 content |
| `slide(..frames)` | 传多个 body = **同一页的多帧**。翻页一帧一帧走，缩略图合成一张 |
| `slide(note:)` | 演讲者备注。只进 HTML（这一页的 `<aside class="vt-note">`），版面和 PDF 里都不出现；放映时按 `s` 在演讲者视图里看。可以是 content |
| `deck(duration:)` | 过渡时长，毫秒，默认 700。放映时还能用 `-` / `=` / `0` 临场调倍率 |
| `deck(transition:)` | **页间**的默认转场：`"fade"`（默认，交叉淡化）、`"slide"`（左右推，前进新的从右边进、旧的往左边出）、`"rise"`（上下推）、`"wipe-left"` / `"wipe-right"` / `"wipe-up"` / `"wipe-down"`（揭开，名字是前沿走的方向：`wipe-up` 从底边开始往上扫，新的露出来、旧的被盖掉）、`"none"`。只管没被标记的内容，配上对的标记照样各自 morph。页内帧与帧之间不用它，一律交叉淡化 |
| `slide(transition:)` | 单页覆盖：从别的页翻到这一页时整页怎么进；后退时以离开的那一页为准，所以总是原路倒放 |
| `mark(transition:)` | **这个标记自己的进出场**，名字同上。这次过渡里它是单边的（新出现，或者消失）才生效，配上对的照样 morph；不写的并回整页一起走。推的距离是它自己的盒子，揭开只揭它自己。定义、定理、证明各从不同的边揭开，就是三个 `mark` 各写一个：`mark("thm", transition: "wipe-up")[…]` |
| `mark(key, s0, s1, …)` | **元素动画**：同一个对象的 N 个状态，放映时 `→` 走一步、`←` 退一步，走完了才翻页。状态之间由浏览器在对应的 SVG 节点上插值（path 的 `d`、transform、颜色、线宽、透明度），所以各状态必须是同一张图换参数：`mark("wave", ..range(0, 6).map(wave))`。PDF 取最后一个状态 |
| `slide(anim:)` | 连续动画，页面停在这一帧时一直跑。`key → spec`，spec 就是 Web Animations API 的 keyframes + options（`duration` 毫秒、`easing`、`direction`…，默认无限循环）；`(follow: "track", duration: 3000)` 让标记的中心沿另一个标记里的 path 跑 |
| `deck(theme:)` | 放映器界面（工具栏、总览、演讲者视图）的明暗：`auto`（默认，跟系统）、`"dark"`、`"light"`。**只管界面**，版面颜色是 Typst 排的 |
| `deck(fill:)` | 版面底色，默认 `#111318`。PDF 走 `page(fill:)`；HTML 的 `html.frame` 不带页面底色，所以同一个值再作为 `--vt-page` 铺在幻灯片和缩略图底下，两边一致、不跟界面明暗走 |
| `deck(font:)` | 字体候选，逐字形回退。默认 `("DejaVu Sans", "Noto Sans CJK SC")`——只写拉丁家族的话中文会散落到系统里任意一个有该字的家族，同一行里粗细都能不一样 |

版面完全由 Typst 排，作者只在要变形的地方套一个 `#mark(key)`。上面两页跑出来是：

```
slide 1:  m-title  30.3% 34.6%  39.4%x13.8%
slide 2:  m-title   4.7%  6.5%  21.9%x 7.7%
```

几何是从排版结果里量出来的，不是写出来的。

## 对应关系是怎么建立的

做转场动画最核心的问题是「前后两页谁对应谁」。这里的答案是：**作者声明，浏览器配对，判据是字符串相等。**

```
① 作者写同一个 key      #mark("title")[…]                两页各一次
② 编译期进产物          <g data-typst-label="vt-title">   Typst 的 SVG 导出
③ 加载时落成属性        style="view-transition-name:m-title"   hoist.js
④ 换页时交出去          document.startViewTransition(…)   浏览器按名字配对
```

**没有任何匹配算法**——没有树 diff、没有内容比对、没有形状匹配。实测这有多彻底：
一个 `<div>` 色块和一个 `<h2>` 只要同名就会配对并互相变形，标签、内容、DOM 位置全不参与。

### 同一个 key 可以连着走很多页

这是这套东西最核心的用法，不是限制：**同一个 key 在连续 N 页出现，那个对象就
连着变 N−1 次**。配对是每次过渡独立算的（往前跟下一帧配、往回跟上一帧配），
但只要几何链接得上，看到的就是一个对象在连续运动。

`examples/demo.typ` 最后一页的 A 连着五帧同时换位置、字号和颜色。把每次过渡
两端的 `::view-transition-group(m-A)` 关键帧读出来：

```
→ 第 9 帧   247.27x29.16 @100,202  →  321.44x37.91 @100,562
→ 第 10 帧  321.44x37.91 @100,562  →  395.63x46.66 @860,562
→ 第 11 帧  395.63x46.66 @860,562  →  321.44x37.91 @100,382
→ 第 12 帧  321.44x37.91 @100,382  →  247.27x29.16 @860,382
```

**每一次过渡的起点正好是上一次的终点**，所以五帧连成一条连续的轨迹。
`tools/check.mjs` 把这条当断言在跑（当前 deck 里最长的一条是 `m-title`，
连着走了 6 次）。

> 以前 README 里写过一条「跨页的 mark 没有处理」，指的是**一个标记的内容被
> 分页切开**，跟这里说的完全是两回事，而且那种情况在这个架构里根本不存在
> （一页就是一个固定尺寸的 block）。措辞误导，已删。

三条支撑它成立的性质，都是实测的：

- **唯一性只在「当前渲染的元素」之间要求。** 非当前页 `display:none`，不生成盒子、不进捕获表。
  所以同一个 key 能在每页出现而不冲突——这是整个方案的前提。
- **一页内重名 = 整次过渡作废**，浏览器抛 `InvalidStateError` 并打
  `Unexpected duplicate view-transition-name`。所以落到 DOM 上的名字带出现序号
  （`m-title-1`、`m-cell-2`…），同一个 key 在一页里出现多次也不会撞车——
  见下面的「分裂与归并」。
- **配对每次独立、不跨时间持续。** 往前跟下一页配、往回跟上一页配。单侧才有的 key 产生孤儿快照，
  runtime 在过渡前给它们加 `vt-fx-<效果>`，CSS 按它走进出场动画（见下面「转场是两帧之间的一对动作」）。

## 身份通道：为什么是 label 而不是 link

Typst 的 SVG 导出把 `<lbl>` 写成一个**包住内容**的 `<g>`：

```html
<g transform="translate(37.09)" data-typst-label="vt-title">
  <g transform="matrix(1 0 0 -1 0 12.16)"><use …/>×4</g>   ← 真正的字形在里面
</g>
```

扫过 SVG 的全部属性：`<g>` 只有 `transform`，`<path>`/`<use>`/`<rect>` 只有绘制属性。
唯二的语义通道是 **`<a href>`（link）** 和 **`data-typst-label`（label）**。
box / block / figure 都不留可辨认的节点。`html.elem` 在 `html.frame` **内部**会被直接丢弃
（`elem was ignored during paged export`）。

| | `link()` | `label` |
| --- | --- | --- |
| SVG 形态 | `<a>` 里**只有透明命中矩形**，内容在外面 | `<g data-typst-label>` **包住内容** |
| PDF 副作用 | link annotation + 无障碍树多一个 `<Link>` | **零**：结构树、annotation 数、`/Names` 与不写 label 的版本逐项相同 |
| 要不要按后端门控 | 要（`sys.inputs`） | **不要** |
| 排版扰动 | 0（门控后） | **0** |
| 同 key 跨页 | 可以 | 可以（两页同 label 编译无错） |
| 运行时要做的事 | 探针测几何 → 按重叠比例判归属 | 直接搬子树 |

`<g data-typst-label>` **就是内容边界**，所以运行时不推断任何几何。
这让 `hoist.js` 比探针版少了一半，删掉的全是最脆的部分。

### `mark()` 里那层 `box` 的作用

```typst
#let mark(key, body) = [#box(body)#label("vt-" + key)]   // 单状态时就是这一行
```

Typst 的 label 挂在**前一个元素**上。不包的话它挂到的东西在 SVG 导出里不生成节点，
实测 `data-typst-label` **根本不出现**。`box` 的唯一作用就是给 label 一个能附着、
且会生成节点的单一元素。

代价是零，而且必须是 `box` 不能是 `block`：

```
box 版   vs 完全不写 mark：max diff   0,     0 个像素不同
block 版 vs 完全不写 mark：max diff 255, 44352 个像素不同
```

`box` 是行内级的，塞进段落不改变任何东西——即使 body 里是一个整宽的 `block` 也是 0。
`block()` 会把行内标记强行断行。长文本包在 `box` 里照样换行（包围盒与 `block` 版完全相同）。

## 提升（hoist）

`view-transition-name` 在 SVG 子元素上会被浏览器**静默忽略**——computed style 有值，
但一个 group 都不建。所以 `<g>` 待在原地动不了。`hoist.js` 在加载时做一次：

1. 找 `[data-typst-label]` 里前缀是 `vt-` 的（作者自己的 label 不碰），按 key 分组。
2. `getBBox()` + `getCTM()` 算出它在整页 viewBox 里的包围盒。
3. 造一个绝对定位的 `<svg viewBox="包围盒">` 挂 `view-transition-name`，把那个 `<g>` 搬进去。

**为什么非要搬到 HTML 层**：`view-transition-name` 只对**在 CSS 盒树里**的元素生效。实测四种挂法：

| 挂在哪 | computed style | 浏览器实际建立 group |
| --- | --- | --- |
| SVG 内部的 `<g>` | 有值 | ❌ |
| SVG 内部**嵌套的 `<svg>`** | 有值 | ❌ |
| 作为 HTML 元素的根 `<svg>` | 有值 | ✅ |
| HTML `<div>` | 有值 | ✅ |

SVG 内部的一切（包括嵌套 `<svg>`）都由 SVG 坐标系统排版，不生成 CSS 盒。
所以区域必须是 HTML 层的元素——但**不需要额外的 div**，那个 `<svg>` 自己就能挂名字。

**坑零**：区域 svg 是 `.vt-page` 的直接子元素，会被写给底图的
`.vt-page > svg { width:100%!important }` 打中，尺寸变成整页。选择器要写成
`.vt-page > svg:not(.vt-mark)`。（和 `:last-child` 那个是同一类特异性冲突。）

**坑一**：包装用的必须是**父节点**的 CTM。用节点自己的会把它的 `transform` 应用两次，
内容直接飞出画面。

**坑一点五（最阴的一个）**：`getCTM()` 的目标空间各浏览器不一致。Chrome 会把
viewBox→viewport 的缩放算进去——窗口 1600 宽时 `root.getCTM()` 是 1.25 倍——
而代码是拿它去除以 `viewBox.width` 的，于是**所有提升出来的区域按窗口比例往右下偏、
还等比放大**。1280×720 下缩放正好是 1，什么都看不出来，而测试一直只跑 1280×720。

修法是不看绝对值，**用同一个函数量两次再相除**：

```js
var raw  = function (el) { return el.getScreenCTM(); };
var inv  = raw(root).inverse();
var toRoot = function (el) { return inv.multiply(raw(el)); };   // → 根 viewBox 空间
```

`root` 和元素用的是同一个约定，相除之后剩下的一定是「元素用户空间 → 根 viewBox 空间」，
跟浏览器采哪种约定无关。包装用的那个矩阵同样要走 `toRoot`，否则区域内部的内容也会被缩放两次。
`tools/check.mjs` 现在在 4 个窗口尺寸下跑，断言百分比逐位相同。

**坑二**：`getBBox()` / `getCTM()` 在 `display:none` 子树里返回零，而除首页外所有页在加载时
都是隐藏的。要先把所有页临时 `display:block` 量完再还原。

`<use xlink:href="#g…">` 是全文档解析的，搬走的子树仍然引用留在底图 `<defs>` 里的字形
`<symbol>`，不复制任何字形数据。实测第 2 页：103 个 `<use>` 分成
`title=7 / sub=12 / eq=13 / 底图=71`，加起来正好 103。

### 分裂与归并：一个 key 在一页里出现多次

`#mark("cell")` 在这一帧出现一次、下一帧出现三次，那一个就**分裂成三个**飞向
三处；反过来是三个**归并成一个**。

View Transitions 一个名字只能配一对，所以「一变三」没法直接表达。做法是
**在少的那一边复制**：把那一份原地复制两份，三个名字各挂一个，于是三组各有
old 和 new，三份从同一个地方出发飞向三个终点。复制品在 `vt.finished` 里删掉。

```
【分裂】          m-cell-1  88x49.98 @596,335  →  88x49.98 @120,240
                  m-cell-2  88x49.98 @596,335  →  88x49.98 @540,440
                  m-cell-3  88x49.98 @596,335  →  88x49.98 @940,180
【归并】          m-cell-1  88x49.98 @120,240  →  148x49.98 @566,335
                  m-cell-2  88x49.98 @540,440  →  148x49.98 @566,335
                  m-cell-3  88x49.98 @940,180  →  148x49.98 @566,335
```

**任意数量都行，不只是 1↔N。** 第 `i` 个名字取第 `floor(i·k/K)` 个源
（`K = max(两边数量)`），所以数量不整除也有确定答案：

| | 复制在哪边 | 复制几份 | 结果 |
| --- | --- | --- | --- |
| 1 → 3 | 旧的 | 2 | 一个飞向三处 |
| 3 → 2 | 新的 | 1 | 前两个并到第一处，第三个自己走 |
| 2 → 1 | 新的 | 1 | 两个并到一处 |
| 3 → 5 | 旧的 | 2 | 前两个各分裂成二，第三个自己走 |

`tools/check.mjs` 把这些都当断言在跑：每次过渡后 `.vt-mark` 必须回到静息数量，
且**同页内**名字唯一（跨页重名是正常的——非当前页 `display:none`，不进捕获表）。

有一点要说清楚：**数量变化的那次过渡里，名字不是跨过渡的身份**。
`m-cell-2` 这次可能是个克隆、下次是第二个真元素，所以「连续变化」那条链在
数量变化处本来就该断开，`check.mjs` 会把这种过渡两侧都排除掉再检查剩下的。

复制的是提升出来的区域 `<svg>`，里面只有 `<use xlink:href="#g…">`，字形
`<symbol>` 留在底图的 `<defs>` 里全文档解析——**复制不带 id，也不复制任何
字形数据**（实测被标记的子树里 `id=` 出现 0 次）。过渡里 `.vt-mark` 从 33 个
涨到 35 个，结束后回到 33，静息名字仍然唯一。

### 嵌套的 mark 直接就能用

`#mark("outer")[外面 #mark("inner")[里面] 后面]` 两层各自成组，
浏览器把内层从外层的快照里**拎出去**——这就是 View Transitions 对
「命名元素里还有命名元素」的标准语义，不需要额外做什么。实测过渡里确实是
`::view-transition-group(m-outer)` 和 `::view-transition-group(m-inner)` 两组，
外层剩 4 个 `<use>`、内层 2 个，加起来正好是原来的 6 个。

有一个坑：**必须先把所有区域量完，再开始搬**。外层被移进自己的 host 之后，
嵌在它里面的内层就是在新宿主里量的，而宿主的尺寸写的是百分比——于是内层的
结果开始跟着窗口大小走。`hoist.js` 因此分两遍：第一遍只读几何，第二遍才动 DOM。
（这个 bug 是 `tools/check.mjs` 的四尺寸断言抓出来的，单尺寸下它是隐身的。）

### 一个标记折行也没关系

Typst 的 SVG 导出对一个 label 只出**一个** `<g>`，哪怕内容折了好几行——
实测 61 个字形折成三行仍然是一个节点，所以一个区域就是一个 `<g>`，不用并集。

### 路径交叉不是问题

两个区域是独立的 `::view-transition-group`，运动路径正面对穿也没有干扰——
`examples/demo.typ` 第 8→9 页就是同一水平线上左右对调，中途正常叠在一起。谁画在上面由 group
顺序决定，需要的话用 `::view-transition-group(m-x) { z-index: N }` 控制。

## 保真度实测

`html.frame()` 输出的是字形轮廓 `<path>`（0 个 `<text>`、0 个 `font-family`），
渲染完全是 Typst 自己的，与浏览器装了什么字体无关。

同一次 bundle 编译出的 PDF 和 HTML，都对齐到 1280×720 逐像素比较（`node tools/verify.mjs`）：

```
第 1 页 0.820   第 2 页 0.975   第 3 页 0.276   第 4 页 1.066   第 5-9 页 0.378
```

mean 本身只是量级，真正的判据是差异图（`tools/shots/diff-N.png`）上**只有空心的字形轮廓**：
没有位移重影、没有实心色块——纯粹是 pdftoppm 和 Chromium 两个光栅化器的抗锯齿不同。
把同一页平移 2px 再比是 2 倍以上，所以 `verify.mjs` 的上限画在 1.5。
（第 4 页 1.066 是因为那页密排 24pt 中文，笔画多、边缘像素就多，不是别的原因。）

比之前两张图先各模糊 1px。提升出来的区域是独立的盒子，浏览器把盒子的位置吸附到整像素
（最多差半个像素，把 HTML 截图往回挪 1px 再比就能看到 mean 掉下去）。一块满是 22pt 小字的
定理框光这半个像素就把 mean 顶到 2.3——不是位移，是抗锯齿。模糊掉亚像素之后它回到 1.1，
而真平移 2px 的还有 2.5。宿主 `<svg>` 另外设 `preserveAspectRatio="none"`：盒子被吸附到
1/64 px 后，默认的 `xMidYMid meet` 会按较小的比例统一缩放，1160px 宽的一块文字右端漂 0.3px。

## 走过的弯路（留作记录）

这四条都实测翻过车，而且都是**几何推断**这条路的必然产物。label 方案让它们全部不成立。

1. **搬 `<a>` 子树** → 搬到的是空盒子（`use=0, path=0`）。中间帧看着像在飞，其实是底图在
   交叉淡入淡出。**判据是查 DOM 有没有 `<use>`/`<path>`，不是看截图。**
2. **mask 挖洞 + `<use>` 整页裁剪** → 合成正确，但两个标记的包围盒一重叠，每个区域都拿到
   「矩形里的一切」，各自带着对方的碎片飞走。
3. **按绘制节点归属 + 完全包含** → 被**墨迹盒**坑：`getBBox()` 返回的是墨迹盒，
   下伸部/overshoot 会超出排版盒，矩形一紧就 silently 丢字形（`title` 整个消失、
   `sub` 只捞到 12 个里的 3 个）。要改成重叠比例 > 60%。
4. **`asset()` 导出 JSON 几何** → 精度 0.0000、排版扰动 0，但在浏览器这条路上买不到
   `getBBox()` 没有的东西。它真正的价值在别处（去掉 link、带文字内容做逐字 morph）。

## 一个容易踩的合成陷阱

`::view-transition-old` 和 `new` 是**叠在一起**的两张图。用 `normal` 混合时双向淡入淡出
不是真正的交叉淡化：Chromium 里冻结到中点量底色，(17,19,24) 变成 (28,30,34)——亮出
一截；早先按住旧的、只让新的淡入，则是暗 5%。两张透明度互补的不透明快照要用
**`plus-lighter`** 相加：任一时刻加起来正好是 1，中点量出来 (19,21,26)，只剩 8-bit 取整的
两个量阶，整段过渡是平的。规范的 UA 样式表本来就给 old/new 写了 plus-lighter，Chromium
的伪元素算出来却是 `normal`，所以 `deck.css` 自己写一遍。root 和标记（`.vt-mo`）都这样。

### 转场是两帧之间的一对动作

一个转场是两帧之间的**一对**动作：后一帧怎么进场，前一帧就怎么退场——后者淡入，前者
就淡出；后者从右边推进来，前者就往左边推出去；后者从底边揭开，前者就从底边起被盖掉，
任一时刻两者正好拼成整页。每种效果在 `deck.css` 里就是这样一对：`new` 用 in、`old` 用
out，`--vt-in` / `--vt-out`（推的距离、揭开的边）写在一起，后退时两者对调，所以前进后退
天然镜像，不需要按方向写动画名，也不需要 z-index 把谁提到上面。

root（没被标记的内容）按这次过渡的 **types** 选这一对——runtime 交给
`startViewTransition({ update, types: ["slide", "back"] })`，CSS 用
`html:active-view-transition-type(slide)` 认，这是 API 自己表达"这次过渡是哪种"的机制，
生命周期浏览器管（早先自己往 `<html>` 挂 `data-vt` 属性再用计数器防晚到的收尾摘错，是在
重做它）；**单边的标记**（这次过渡里
没配对上的：新出现，或者消失）分两种——自己写了 `mark(transition:)` 的（效果跟在 key 后面
进 label：`vt-thm|wipe-up`，`hoist.js` 拆成 `data-vt-fx`），runtime 在过渡前给它加
`vt-fx-<名字>`，按自己的效果进出场；没写的，runtime 把它的 `view-transition-name` 临时摘掉、
**并回 root**，它就是整页快照的一部分，整页怎么推、怎么揭、怎么淡它就怎么走，天然对齐成
一张，像滚动一样（早先让它"继承"效果单独成组，推的是它自己的宽度，看着就是背景走了它没走）。
两边共用同一组关键帧，有自己效果的标记把 `--vt-in` / `--vt-out` 直接设在自己的伪元素上，
`@keyframes` 里的 `var()` 按被动画的伪元素解析。

**页间和页内是两回事。** 页级的效果（`deck/slide(transition:)`）只在翻到另一页时用：版面
整个换掉，整页推、揭、淡。同一页帧与帧之间版面没动，只是增量变化——多一行、出一块——root
一律交叉淡化（相同的部分不变，多出来的那块淡入），元素自己的进出场写在 `mark(transition:)`
上。所以一页写了 `transition: "slide"`，进这一页时整页推进来，页内按 `→` 出下一块不会再推。

**单边的标记（这次过渡里没配对上的）不用 `:only-child` 判断。** Chrome 152 起
`:only-child` / `:not(:only-child)` 在过渡伪元素上不再可靠——配了对的 old/new 也被当成
only-child，于是所有靠它区分的规则（镜像、draw）在 152 上全部落空、退回浏览器默认的
交叉淡化，而 147 上一切正常（这个坑是在用户的 Chrome 152 里用探针页逐条规则试出来的，
本地回归全绿）。改为 runtime 在过渡前给没配对上的标记加效果类（它本来就算出了
配对关系），CSS 按类走进出场，播完还原。

### `.vt-mark` 的 `overflow` 必须是 `visible`

`.vt-mark` 的 `overflow` 必须是 `visible`：`getBBox()` 是几何框不含描边，`hidden`
会把四周各裁掉半个线宽（李萨如两端被切平）。View Transitions 的快照本来就带 ink overflow。

## 转场、元素动画、连续动画：三个词各指什么

判据只有一句：**是版面变了，还是一个对象在动。**

- **转场**——版面的状态变了：翻页，或者同一页的下一帧（多出一行、标题挪到左上角）。
  走 View Transitions，浏览器给新旧两个版面各拍快照，标记过的元素按 key 配对补间。
  `slide(..frames)`、`deck(transition:)`、`mark(key)[…]` 都属于这一类。
- **元素动画**——一个对象随参数变：正弦曲线换相位、向量转个角度、小球到下一个位置。
  版面没变，变的是这个对象自己的几何。走 Web Animations API，在 SVG 节点上插值。
  `mark(key, s0, s1, …)` 是手动指定离散状态、按键一步一步走；
- **连续动画**——同样是对象在动，但不停、也不用按键：`slide(anim:)`，页面停在这一帧时一直跑。

## 元素动画

```typst
#let wave(t) = cetz.canvas({
  import cetz.draw: circle, line, rect, content
  rect((-0.5, -1.7), (8.5, 1.7), stroke: none)          // 钉住包围盒
  line(..range(0, 41).map(i => (i * 0.2, amp(t) * calc.sin(1.2 * i * 0.2 - 0.5 * t))))
  circle((1.4 * t, …), radius: .25, fill: …)
  content((4, -1.4), [t = #t])
})
#slide(title: "元素动画")[
  #place(dx: 120pt, dy: 200pt, mark("wave", ..range(0, 6).map(wave)))
]
```

`mark` 传多个 body 就是元素动画：每个 body 是同一个对象的一个状态。放映时 `→` 从一个
状态走到下一个、`←` 原路退回，走完了才翻页（倒退时先退完这一帧的步，再翻页；从后一页
`←` 回来落在最后一步——离开时就是从那儿走的）。

对观众来说帧和步没有区别——都是「按一下往前走一格」，只是一个走 View Transitions、一个走
WAAPI。所以一页的**位置**是帧和步展平后的一个序列：地址栏 `#9.3` 是第 9 页第 3 个位置
（可能是第 3 帧，也可能是第 1 帧的第 3 步），工具栏计数同理；总览里的小圆点一个位置一颗，
悬停预览那一步、点一下打开那一步；进度条按位置走；演讲者视图的预览标「下一步」（还在这一页里，
不管是帧还是步）或「下一页」。

**这不是快照淡入淡出**。两个状态对应的 SVG 节点逐个对照，凡是有差别的属性——路径的 `d`、
`transform`、`fill`/`stroke`、`stroke-width`、`opacity`、`x`/`y`/`width`/`height`——
都是 CSS 属性，交给 `el.animate()` 从旧值插到新值：曲线弯成另一条曲线，小球沿直线滑
到新位置，颜色渐变。时长和缓动跟过渡一样（`deck(duration:)`、`-`/`=` 倍率）。

因此**各状态必须是同一张图换参数**：同样的结构、同样的元素个数，只有数值不同。写成
`f(t)` 再喂几个 t 最自然。元素个数随 t 变的（比如折线"每步多一段"）结构对不上，只能
直接切换，控制台会提示；`d` 的命令数不同时浏览器也是中点切换。文字换的是字形，直接切。
状态之间如果 canvas 的包围盒不一样高，原点就会跳，先画一个看不见的矩形钉住范围。

实现：HTML 里 N 个状态是 N 个并排的 `<g data-typst-label="vt-key@i">`（后面的用 `place`
叠在第一个的盒子上，不占版面），CSS 只显示 `@0`；走一步 = 换显示哪个，同时给新状态的每个
节点一个**只有起点**的关键帧，终点是节点自己的属性，播完自然落定、不用收尾。
起点的值不自己解析 SVG 属性：浏览器早就把 presentation attribute 解析成 CSS 属性了，
`getComputedStyle(旧节点)` 直接给出 CSS 语法——`transform` 是 `matrix()`、`d` 是 `path()`、
`x` 带 px、没写的属性也算好了（没有 `transform` 就是 `none`，`fill` 是继承下来的那个），
在 `display:none` 的子树里照样能读。变没变则看属性字符串——各状态是同一段代码生成的，
字符串相等就是没变。
连按就把还在播的取消——新状态本来就落在自己的属性上，取消即跳到终点，再从那儿走下一步。
`mark` 需要知道自己在哪个后端，但 `html.frame` 里 `target()` 永远是 `"paged"`，所以
`deck` 用一个 state 把 `"html"` 带进去；PDF 里取最后一个状态（图搭完的样子）。
hoist 不提升这些状态和它们里面的标记——搬走一个就对不上了；外层的 `vt-key` 照提，所以
整张图在翻页时仍然是一个可以 morph 的标记。

## 连续动画

```typst
#slide(
  anim: (
    dot: (follow: "track", duration: 4000),
    spin: (keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")), duration: 6000),
  ),
)[
  #place(dx: 120pt, dy: 180pt, mark("track")[#cetz.canvas({ … line(..pts, close: true) })])
  #place(dx: 120pt, dy: 180pt, mark("dot")[#std.circle(radius: .3cm, fill: green)])
  #place(dx: 900pt, dy: 300pt, mark("spin")[#std.rect(width: 90pt, height: 90pt)])
]
```

翻页过渡是一次性的；`slide(anim:)` 是页面停在这一帧时**一直跑**的动画。spec 不另发明
DSL，就是 Web Animations API 的 keyframes + options，原样交给 `el.animate()`，文档看 MDN。
关键帧有三种来源：

- 写了 `keyframes`：动这个标记本身（transform、opacity……）。弹跳小球就是五个标记五条
  这样的动画，分段 `easing` 做重力，落地一帧 `scale` 压扁，`delay` 错开。
- `follow: "track"`：让这个标记的中心沿同一帧里另一个标记的第一条 `<path>` 跑（小球沿
  轨迹），走 CSS `offset-path`——合成器上跑，动的只有 `offset-distance`；`orient: true`
  则朝向随切线。
- 两者都不写、而这个 key 的 `mark` 带了多个状态：那些状态就是关键帧。同一段代码算出的
  N 个姿态按时间连续播——每个节点各自一条动画，关键帧是各状态里对应节点的值，读法和
  元素动画的一步完全一样。双摆是在 Typst 里用 RK4 积出 96 个姿态塞进 `mark`，
  `anim: (double: (duration: 8000, direction: "alternate"))` 把它们连续播（倒放的摆也是摆）；
  海浪是三层正弦叠成的 25 个状态，首尾相同，循环无缝。被这样点了名的标记不再算步，
  PDF 里取第一个状态（页面静止时的样子）。

几个实现细节：路径要换算成 deck 坐标系里的 px，所以在这一帧显示出来之后才采样
（240 段折线），窗口改尺寸就重算；Chrome 把 `path()` 的坐标按元素自己的盒子算、规范按
包含块算，`offset-position` 拧不过来，所以 `follow` 的标记 `left/top` 归零让两种解释重合；
Typst 导出的 `d` 以 `M 0 0 m …` 开头（原点上一个空子路径），`getPointAtLength(0)` 会落在
那儿，采样从一个极小长度起。翻页过渡播完才开始播（过渡里快照是静止的，播着的话结束
时会跳一下），离开这一帧、进总览都暂停，`prefers-reduced-motion` 下不播。

## 已知限制

- **z 序会变**：提升出来的区域总是画在底图之上。原本压在别的内容下面的被标记元素，层次会翻。
- **一页塞不下就静默裁掉**：`slide` 是一个固定尺寸的 `block`，溢出的内容 PDF 和 HTML
  都一样看不见（实测两边逐像素一致，都在同一行截断），但没有溢出检测。
- **过渡中途是位图缩放**：View Transitions 的快照是纹理，尺寸变化大时中途会糊，两端清晰。
  这和任何 magic move 一样。
- 真正**逐字形交错**的两个标记，这个方案解决不了——到那个粒度只能自己逐 glyph 做动画，
  也就是 Typstage 那条路。

## CeTZ 画的东西也能变形

`cetz.canvas(…)` 导出的是原生 SVG `<path>`，`mark()` 包住它就和文字一样按 key 配对
（`examples/demo.typ` 最后两页）：

```typst
#mark("fig")[#cetz.canvas({ import cetz.draw: circle, line; … })]
```

- **整张 canvas 一个 key**：位置、尺寸补间，内容交叉淡入淡出。
- **要单独动的元素各自一张小 canvas、各自一个 key**：各飞各的。
- **canvas 里面也能放 mark**：`content((x, y), mark("dot")[#std.circle(…)])`，嵌在外层
  `mark("wave")` 里，浏览器把它从外层快照里拎出来单独补间。（元素动画的状态里面不行——
  那里面的节点要逐个对照，不提升。）
- **要对象自己动**：用元素动画 `mark("wave", ..range(0, 6).map(wave))`，见上面那一节。

转场不能指望**几何插值**：View Transitions 补的是盒子不是路径，旋转 30° 呈现为两张快照
交叉淡化，曲线也不会弯成另一条曲线。曲线要弯成另一条曲线，就是元素动画的活。

坑一：**canvas 的包围盒按画出来的东西算**。多帧或多状态里小球在 +1.2 和 −1.2 时盒子的
上下边不一样，`place` 钉住的又是盒子左上角，坐标原点就会逐帧上下跳。先画一个看不见的
矩形 `rect((-0.5, -1.7), (8.5, 1.7), stroke: none)` 把范围钉死，每帧盒子一样大、原点不动。

坑二：CeTZ 自己也有 `mark`（箭头标记），`import cetz.draw: *` 会把 vtslides 的 `mark` 盖掉，
报 `expected content, found array`。按名导入，或者别用星号。canvas 块里 `circle` 也是
CeTZ 的，要 Typst 的圆写 `std.circle`。

## 文件

```
typst.toml          包清单
lib.typ             入口：deck / slide / mark / bundle
deck.css            整页 SVG 的定位、幻灯片切换、总览模式、过渡效果、工具栏、激光笔
hoist.js            加载时把标记的 <g> 提升成带 view-transition-name 的 HTML 层 <svg>
runtime.js          翻页导航 + 元素动画的步进 + 连续动画 + 工具栏 + 激光笔 + 总览缩放 + 演讲者视图
examples/demo.typ   唯一的例子：标题变形、多帧、嵌套、分裂归并、重叠交叉、定理环境（逐帧揭开）、CeTZ 变形、元素动画、连续动画、弹跳小球、单摆双摆、海浪
docs/api.typ        API 文档：tidy 从 lib.typ 的 /// 注释生成（typst compile --root . docs/api.typ docs/api.pdf）
examples/out/       bundle 产物（demo.pdf + demo.html）
tools/check.mjs     四尺寸区域几何（断言分辨率无关）、跨帧配对链、分裂/归并的克隆收尾、console 错误
tools/verify.mjs    PDF ↔ HTML 逐像素对照、区域分解、冻结的中间帧
tools/ui.mjs        工具栏 / 激光笔 / 总览缩放 / 触摸路由 / 转场 / 揭开 / 速度 / 明暗 / 元素动画 / 连续动画 / 演讲者视图 的回归
```

`tools/` 需要 `playwright`，`verify.mjs` 另外需要 `pdftoppm`(poppler) 和 `compare`(ImageMagick)。

## 验证方法

**别用 `waitForTimeout` + 截图去抓过渡中间帧**——截图本身有上百毫秒延迟，
会让动画看起来像「瞬移」。正确做法是接管 `document.startViewTransition` 拿到 vt 对象，
`await vt.ready` 之后 `document.getAnimations().forEach(a => { a.pause(); a.currentTime = t })`
冻结到精确时刻再截图。`getAnimations()` 也能直接列出每个伪元素上跑的动画名和时长，
用来确认 CSS 规则真的命中了。

## 放映时的按键

| 键 | 作用 |
| --- | --- |
| `→` `↓` `Space` `Enter` `n` `j` | 往前一个位置：元素动画的下一步 / 下一帧 / 下一页 |
| `←` `↑` `PageUp` `p` `k` | 往回一个位置（从后一页退回来落在这一页的最后一个位置） |
| `Home` / `End` | 首页 / 末页 |
| `1`–`9` | 直接跳转 |
| `f` | 全屏 |
| `o` / `a` | 总览（点缩略图跳转并退出） |
| 总览中 `1`–`9` / `Home` / `End` | 直接打开那一页 |
| 总览里悬停 / 点击缩略图右下角的小圆点 | 预览 / 跳到那个位置（帧或元素动画的步） |
| `l` | 激光笔 |
| `-` / `=` / `0` | 过渡慢一点 / 快一点 / 还原（倍率乘在所有时长上，记在 localStorage） |
| 滚轮 | 向下下一页、向上上一页。鼠标一格一页；触控板累加过阈值翻一页、翻完冷却 300ms 吃掉惯性。总览里滚轮只滚网格 |
| `s` | 演讲者视图：独立窗口，顶部进度条，当前页 / 下一页 / 备注 / 计时 / 工具栏。能拖到另一块屏幕；在窗口里按键、点按钮、指激光都作用在主窗口上 |

### 一页多帧

```typst
#let 底 = [ … ]
#slide(title: "两帧", 底, 底 + [ #mark("eq")[$…$] ])
```

一个 `slide` 传多个 body 就是同一页的多帧：翻页一帧一帧走，PDF 里一帧一页
（和讲义一个道理），**缩略图里它们合成一张**，右下角用小圆点标进度——一个位置一颗，
元素动画的步也算位置（见上面的「元素动画」）：
**走过的一律实心、当前那颗再亮一档、还没到的空心**，点一下直接跳过去。
这个规则对所有页统一，所以翻过去的页整排实心、还没到的整排空心，
一眼能看出讲到哪了。**鼠标停在哪颗点上，缩略图就换成那一步**，不用点进去
也能认出哪一步是哪一步。

帧之间照样走 View Transitions，所以「第二帧比第一帧多一行」这种增量是元素级
的补间，不是整页跳变——这正是 `#pause` 想要的效果，只是这里不需要解析内容。

缩略图显示哪一帧：**正在这一页上就显示当前帧，否则显示最后一帧走到最后一步**
（这一页搭完的样子）。点缩略图打开的就是它正显示的那一步——所见即所得。
地址栏 `#3` 是第 3 页第 1 个位置，`#3.2` 是第 3 页第 2 个位置；工具栏计数同理。

标题栏和圆点都由 `runtime.js` 建，Typst 那边只在组里藏一个 `.vt-title`（`display:none`，runtime 读
`textContent`，浏览器把 content 压成文字，不用自己遍历内容树）——版面里
不该有放映器的零件。它们挂在组上而不是幻灯片上，所以总览缩放（名字挂在组上）
不会把标题栏一起放大到全屏。

### 总览的进出是「整页缩放」，不是翻页

从缩略图点进某一页，跟按 `→` 翻到那一页，是两件事：翻页要的是元素级
morph，打开要的是这一页整个放大到位。所以 `zoomTo()` 把这一整个
`.vt-group` 临时挂上 `view-transition-name: vt-zoom`——缩略图和放映页
本来就是同一个元素（组在放映时是 `position:absolute;inset:0` 的空盒子，
在总览里是网格项，两边都有盒子，且与「打开的是哪一帧」无关），浏览器于是把两个状态下的框补间起来——同时在 CSS 里

```css
html:active-view-transition-type(zoom) .vt-mark { view-transition-name: none !important }
```

把所有标记的名字盖掉（作者样式的 `!important` 压得过 `hoist.js` 写在元素上
的行内名字），让它们并回 root 一起缩放。不盖的话，上一页残留的标记会跟
新页的同名标记配对起飞，看上去就是「打开的时候文字先各飞各的」。
按 `o` 收回总览走的是同一条路，方向相反。

右下角有个工具栏（页码 / 总览 / 激光笔 / 下载 PDF / 全屏），鼠标静止 2.4 秒自动隐去、一动就回来。
下载那个是真的 `<a download target="_blank">`：能下载就不离开当前页，`download` 被忽略时
（跨域、某些 `file://` 情形）也只是新开一个标签页，绝不会在放映途中把 deck 导航掉。
地址默认取跟本页同名的 `.pdf`——走 `bundle` 的话那个文件就在旁边。
它由 `runtime.js` 自己建，Typst 那边不用出任何标记，所以换个 deck 也照样有。
工具栏和激光笔都在 `.vt-deck` 外面、各自带 `view-transition-name`，
**并且把它们的组关掉不做动画**：

```css
::view-transition-group(vt-bar){animation:none}
::view-transition-old(vt-bar){animation:vt-fade-out 1ms linear both}
::view-transition-new(vt-bar){animation:vt-hold var(--vt-dur) linear both}
```

不关就会糊，而且原因不在「参与了过渡」：页码从 `1 / 7` 变成 `2.1 / 7`，
工具栏宽度 198→210px，浏览器于是把这个框补间，旧快照被拉伸到中间尺寸——
**整排图标一起拖影**。实测工具栏区域 vs 静止态（mean/255，越小越清晰）：

| | t=40 | 120 | 250 | 350 | 600 |
| --- | --- | --- | --- | --- | --- |
| 自己的名字 + 默认动画 | 3.08 | **4.20** | 2.77 | 1.06 | 0.24 |
| `view-transition-name:none` | 1.48 | 1.11 | 0.82 | 0.05 | 0.05 |
| 自己的名字 + 组不动画 | **0.52** | **0.52** | **0.52** | 0.00 | 0.00 |

顺带澄清两个常见说法：

- **`view-transition-name: none` 不是「不参与过渡」**。`none` 是这个属性的
  **默认值**，意思是「不单独成组」，于是元素被并进 **root 快照**一起淡入淡出。
  它在这里确实比现状好（1.11 vs 4.20），但那是因为 root 的组不改尺寸、
  工具栏的组会——不是因为它被排除掉了。同文档过渡里**没有**真正的排除机制。

  一个判决性的实验：给 root 加一个平移的转场

  ```css
  @keyframes push-out{to{transform:translateX(-30%)}}
  ::view-transition-old(root){animation:push-out var(--vt-dur) both}
  ```

  `name:none` 下画面里会出现**两个工具栏**——旧 root 那份带着 `1 / 7`
  被一起推向左边。它没有被排除，它被焊进了页面。给它自己的名字则钉住不动。
  也就是说 `none` 在这个 deck 里之所以看着还行，只是因为 root 的转场恰好
  只做淡入淡出、不动几何；换个会动 root 的转场立刻穿帮。
- **把它放进 top layer（`popover`）是最差的**：过渡期间工具栏**整个消失**，
  因为 view transition 的伪元素树本身就在 top layer，画在它上面。
激光笔**按输入类型分流**，判据是事件自带的 `pointerType`，所以同一台设备上两种输入都对：

| 输入 | 实现 | 理由 |
| --- | --- | --- |
| 鼠标 | `cursor: url(SVG) 16 16, none` | 系统光标由合成器绘制，**完全跟手**；DOM 元素靠 `pointermove` 更新 `transform`，至少落后一帧 |
| 触摸 / 笔 | DOM 光点跟随 | `cursor` 只 style 鼠标指针，触摸没有指针可 style，那行 CSS 在触屏上等于不存在 |

走 DOM 那条时会把 `cursor` 收成 `none`，不会出现两个光点。触摸没有 hover，所以是「按住指点、松开消失」。
激光笔开着时**触摸的点按和滑动都不翻页**，免得指点变成翻页。
进总览只是把光标/光点临时收起来，`lasing` 这个放映状态本身不动——
退出总览还是打开着的，不用重按一次 `l`。

光标图和 DOM 光点是**同一张** 32×32 的 SVG data URI（`html{--vt-laser:url(…)}`，一处 `cursor`、一处 `background`），
所以鼠标、触摸、演讲者视图远程指点看到的是同一个点。尺寸有上限，32 最稳。

### 整页转场

`deck(transition:)` 选一个名字，翻到另一页时 runtime 把名字和方向作为 `types: ["slide", "fwd"]`
交给 `startViewTransition`（页内帧与帧之间固定是 `fade`），效果全在 `deck.css` 里按
`:active-view-transition-type()` 写；加一种效果只改 CSS。root 和标记是两回事：
整页效果只管**没被标记的内容**，标记过的元素有自己的组，照样各自 morph——章节页
从右边推进来的时候，同 key 的标题待在原地不动。`slide(transition:)` 单页覆盖。

### 界面明暗

`deck(theme:)`：`auto` 跟系统、`"dark"` / `"light"` 固定。runtime 只把结论落到
`<html data-theme>`，颜色全是 `deck.css` 里 `html{--vt-bg…}` 那一组 token，演讲者
窗口照抄同一份。**版面不在其中**：幻灯片底色是 `deck(fill:)`，写在 `.vt-deck` 的
`--vt-page` 上，缩略图和演讲者预览都用它，切到浅色界面时幻灯片还是它自己的颜色。

### 演讲者视图

```typst
#slide(title: "开场", note: [先讲*为什么*，再讲怎么做。])[ … ]
```

按 `s`（或工具栏按钮）弹出独立窗口，能拖到副屏上。里面的「当前页 / 下一页」
是两个 iframe，装的就是这份 HTML 自己，用 `#3.2` 这样的 hash 定到那个位置——
deck 本来就按 hash 走，不用再写一套渲染，帧之间的过渡、元素动画的步也照常播。翻页时只改
iframe 的 `src`，跟当前 URL 只差 fragment 的导航不会重载。窗口本身是
`about:blank`、跟主窗口同源，DOM 直接建；iframe 里的副本一律不碰（`file://`
下每个文件各是一个 origin），所以**双击打开 HTML 也能用**。同步靠 `vt:slide`
事件，不轮询。备注就是这一页 `.vt-group` 里的 `<aside class="vt-note">`
原样搬过去，段落、列表、强调都是真 HTML。计时从打开算起，点一下归零。
主窗口关掉或刷新时把它一并收掉，免得留一个不再同步的窗口。

顶部一条进度条（按位置算，帧和步都算一格）。
窗口右下角有一份**自己的工具栏**：同一个 `buildBar(doc)` 建的，按钮指向主窗口的
同一组函数，页码 / 总览 / 激光 / 全屏的状态由 `syncTools()` 对两份一起刷，所以
在哪边按都一样。「当前页」预览就是主窗口 deck 的替身：**点它翻页**（左 1/3 上一页、
其余下一页，和主窗口一样）、**滚轮翻页**；激光开着时在上面移动鼠标，**主窗口上会出现光点**，
位置按预览框 → deck 框等比换算（主窗口那边没有鼠标可换光标，走 DOM 光点）。
两个预览 iframe 带 `name="vt-mirror"`，副本看到这个名字就不建工具栏。

鼠标点左侧 1/3 上一页、其余下一页；手机左右滑动。地址栏的 `#3` 就是页码。
**过渡中点击也算数**，连点就快速翻页。这里有两个坑：过渡期间浏览器不对真实 DOM 做
命中测试，事件 target 一律是 `<html>`（给伪元素加 `pointer-events:none` 也没用），
所以点击/滑动绑在 `document` 上按坐标判断，主 deck 和演讲者视图的预览用同一个
`frac()/tap()`；连点时 `next()` 基于已受理的目标 `want` 算而不是画上去的 `cur`——
`paint()` 要等快照捕获完才跑（第一次 100ms+），基于 `cur` 算的话两次点击会变成同一页。
`window.vtslides` 暴露 `{ go, next, prev, index, total, step, steps, speed, deck }`（`step` 可写：走到这一帧的第 k 步），翻页、走一步都在 `.vt-deck` 上派发 `vt:slide`。
