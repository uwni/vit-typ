/* ── 把标记的区域从页面 SVG 里提出来 ─────────────────────────────────
   view-transition-name 在 SVG 子元素上会被静默忽略，标记的区域待在页面 SVG
   里就没法 morph。这里把每一个提成自己的一个绝对定位的 <svg>——一个 HTML
   层的元素，API 认它。

   身份通道是 Typst 的 label：SVG 导出写成包住内容的 <g data-typst-label="vt-key">，
   这个 <g> 就是内容边界，不用推断：没有几何探测、没有逐节点归属、没有容差、
   没有 mask。两个标记的盒子重叠也仍是两棵子树。

   加载时跑一次，之后全是浏览器的事。 */

(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var PREFIX = "vt-";

  /* getBBox/getCTM return nothing inside a display:none subtree, and every
     slide but the first is hidden at load — so measure them all laid out,
     then put the hidden ones back. */
  var shown = [].slice.call(document.querySelectorAll(".vt-slide, .vt-group"));
  var was = shown.map(function (s) { return s.style.display; });
  shown.forEach(function (s) { s.style.display = "block"; });

  document.querySelectorAll(".vt-slide > .vt-page").forEach(function (page) {
    var root = page.querySelector("svg");
    if (!root) return;
    var vb = root.viewBox.baseVal;

    /* getCTM 的目标空间各家不一致：Chrome 把 viewBox→viewport 的缩放也算进去
       （窗口 1920 宽时 root.getCTM() 是 1.5 倍），Safari 的约定又不同。所以
       绝对值不能直接用——改成**用同一个函数量两次再相除**：root 的逆乘元素的，
       得到的一定是「元素用户空间 → 根 viewBox 空间」，与浏览器约定无关。

       这个 bug 在 1280×720 下完全看不见，因为那时缩放正好是 1；换个窗口大小
       所有提升出来的元素就按比例往右下偏。测试一直只跑 1280×720，正好是它
       隐身的那个尺寸。 */
    var inv = root.getScreenCTM().inverse();
    var toRoot = function (el) { return inv.multiply(el.getScreenCTM()); };

    var byKey = {};
    var STATE = '[data-typst-label^="' + PREFIX + '"][data-typst-label*="@"]';
    page.querySelectorAll("[data-typst-label]").forEach(function (g) {
      var l = g.getAttribute("data-typst-label");
      if (l.slice(0, PREFIX.length) !== PREFIX) return;    // leave the author's own labels alone
      /* 元素动画的状态（vt-key@i）和它们里面的标记都留在原地：运行时要把
         各状态的节点逐个对照着补间，搬走一个就对不上了。外层的 vt-key 照提。 */
      if (l.indexOf("@") >= 0 || g.parentNode.closest(STATE)) return;
      /* "vt-thm|wipe-up"：竖线后面是这个标记自己的进出场效果 */
      var parts = l.slice(PREFIX.length).split("|"), k = parts[0];
      g.vtFx = parts[1];
      (byKey[k] = byKey[k] || []).push(g);
    });

    /* 先量完，再搬。搬动会改变还没量的节点的屏幕位置——外层 mark 被移进
       自己的 host 之后，嵌在它里面的内层 mark 就是在新宿主里量的，而宿主
       的尺寸是百分比，于是内层的结果开始跟着窗口大小走。两遍走：第一遍
       只读，第二遍才动 DOM。 */
    var plan = [];
    Object.keys(byKey).forEach(function (key) {
      /* 一个 label 实例 = 一个 <g> = 一个区域。同一个 key 在一页里出现多次
         是**允许的**——它们各自成区域，名字带上出现序号，运行时再按数量
         配对（一变多 = 分裂，多变一 = 归并）。 */
      byKey[key].forEach(function (n, i) {
        var box = bbox(n, toRoot);
        if (!box || box[2] <= box[0] || box[3] <= box[1]) return;
        /* 记的是**父节点**的 CTM——节点自己的 transform 属性会跟着走，用它自己的
           就套了两次 */
        plan.push({ key: key, at: i, node: n, box: box, mat: toRoot(n.parentNode) });
      });
    });

    plan.forEach(function (p) {
      var x = p.box[0], y = p.box[1], w = p.box[2] - x, h = p.box[3] - y, m = p.mat;

      /* 区域自己的 <svg> 就是一个 HTML 层的元素，名字直接挂在它上面。（套在
         页面 svg **里面**的 <svg> 不行：只有 CSS 盒树里的元素才会被捕获。） */
      var host = document.createElementNS(NS, "svg");
      host.setAttribute("class", "vt-mark");
      host.setAttribute("viewBox", x + " " + y + " " + w + " " + h);
      /* 宿主的盒子会被布局引擎吸附到 1/64 px，默认 xMidYMid meet 按两个方向里较小
         的比例统一缩放——1160px 宽的一块文字会被整体缩 0.02%，右端漂 0.3px，
         整行字的抗锯齿都跟 PDF 对不上。两个方向各自缩放，误差就只剩万分之几 px。 */
      host.setAttribute("preserveAspectRatio", "none");
      host.style.left = ((x - vb.x) / vb.width * 100) + "%";
      host.style.top = ((y - vb.y) / vb.height * 100) + "%";
      host.style.width = (w / vb.width * 100) + "%";
      host.style.height = (h / vb.height * 100) + "%";
      host.dataset.vtKey = p.key;
      if (p.node.vtFx) host.dataset.vtFx = p.node.vtFx;
      host.style.viewTransitionName = "m-" + p.key.replace(/[^A-Za-z0-9_-]/g, "-") + "-" + (p.at + 1);

      var wrap = document.createElementNS(NS, "g");
      wrap.setAttribute("transform", "matrix(" + [m.a, m.b, m.c, m.d, m.e, m.f].join(" ") + ")");
      wrap.appendChild(p.node);                  // 从页面 svg 里摘出来
      host.appendChild(wrap);
      page.appendChild(host);
    });
  });

  shown.forEach(function (s, i) { s.style.display = was[i]; });

  function bbox(el, toRoot) {
    var b;
    try { b = el.getBBox(); } catch (e) { return null; }
    var m = toRoot(el), out = null;
    [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height],
     [b.x + b.width, b.y + b.height]].forEach(function (p) {
      var X = m.a * p[0] + m.c * p[1] + m.e, Y = m.b * p[0] + m.d * p[1] + m.f;
      out = out ? [Math.min(out[0], X), Math.min(out[1], Y),
                   Math.max(out[2], X), Math.max(out[3], Y)] : [X, Y, X, Y];
    });
    return out;
  }
})();
