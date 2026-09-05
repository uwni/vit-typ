/* ── vtslides · runtime ─────────────────────────────────────────────────
   放映器。三件事：
   · 转场——翻页/换帧时起一次 View Transition，types 报两个词：效果名和方向，
     画面全在 deck.css 里按 :active-view-transition-type() 写；加一种效果只改 CSS。
   · 元素动画——mark(key, s0, s1, …) 的各个状态，按键一步一步走，节点之间
     由 Web Animations 插值；slide(anim:) 则让一个标记（或它的状态）连续播。
   · 界面——总览、工具栏、激光笔、演讲者视图。
   无依赖，file:// 下直接开。                                              */

(function () {
  "use strict";

  var root  = document.documentElement;
  var deck  = document.querySelector(".vt-deck");
  if (!deck) return;

  var slides = Array.prototype.slice.call(deck.querySelectorAll(".vt-slide"));
  var n      = slides.length;
  if (!n) return;

  /* ── 组 = 一页，帧 = 这一页的一个版面状态 ─────────────────────────────
     翻页按帧走，缩略图按组走。标题是组里藏着的 .vt-title，浏览器把它压成纯文本。 */
  var groups = [];      // { el, title, from, to, pos }  to 不含
  var gOf    = [];      // 帧下标 → 组下标
  Array.prototype.forEach.call(deck.querySelectorAll(".vt-group"), function (el) {
    var t = el.querySelector(".vt-title");
    var g = { el: el, title: t ? t.textContent.trim() : "", from: gOf.length, to: gOf.length };
    Array.prototype.forEach.call(el.querySelectorAll(".vt-slide"), function () { gOf.push(groups.length); g.to++; });
    groups.push(g);
  });
  var gn = groups.length;

  var defaultFx = deck.dataset.transition || "fade";
  var defaultMs = parseInt(deck.dataset.duration, 10) || 700;

  /* 放映时可调的速度倍率：- 慢、= 快、0 还原，乘在每一段时长上，记在
     localStorage 里下次打开还在。deck(duration:) 是基准，这个是临场的旋钮。 */
  var speed = 1;
  try { speed = parseFloat(localStorage.getItem("vt-speed")) || 1; } catch (e) {}
  function durMs(ms) { return Math.round(ms / speed); }
  function dur(ms) { return durMs(ms) + "ms"; }
  function setSpeed(v) {
    speed = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    try { localStorage.setItem("vt-speed", speed); } catch (e) {}
    root.style.setProperty("--vt-dur", dur(defaultMs));
    flash(speed + "×");
  }

  var cur   = -1;       /* 画上去的那一帧 */
  var want  = -1;       /* 已受理的目标。paint() 在快照捕获完成后才跑（第一次过渡要
                           100ms+），这期间再来的 next() 要基于目标算，不然两次点击都
                           变成「去同一页」。只在受理处写，paint() 不碰它——被跳过的
                           旧过渡的 update 回调会晚一点才跑，让它写就会把目标拨回去 */

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var canVT   = typeof document.startViewTransition === "function";
  var EASE    = getComputedStyle(root).getPropertyValue("--vt-ease").trim() || "ease-in-out";
  var STATE   = '[data-typst-label^="vt-"][data-typst-label*="@"]';   // 元素动画的一个状态

  function clamp(i) { return i < 0 ? 0 : i > n - 1 ? n - 1 : i; }
  function at(i) { return slides[i].vtAt || 0; }
  function over() { return deck.classList.contains("vt-all"); }

  /* ── 位置 = 帧 × 步，展平成一个序列 ─────────────────────────────────
     对观众来说一页里只有「按一下往前走一格」，帧（转场，View Transitions）和
     元素动画的步（WAAPI）表现是一样的，只是浏览器 API 不同。所以圆点、计数、
     进度条、hash、演讲者视图的下一步，都按这个序列算，不区分帧和步。
     POS 是整个 deck 的位置 { i, at, n }，g.pos 是一页的；abs[i] 是第 i 帧第 0 步
     的序号，head[i] 是它在页内的序号。 */
  var POS = [], head = [], abs = [];
  groups.forEach(function (g) {
    g.pos = [];
    for (var i = g.from; i < g.to; i++) {
      head[i] = g.pos.length;
      abs[i] = POS.length;
      for (var k = 0; k <= stepsOf(slides[i]).n; k++) {
        var q = { i: i, at: k, n: POS.length };
        g.pos.push(q);
        POS.push(q);
      }
    }
  });

  /* 第 i 帧第 k 步的序号；不传 k 就是这一帧现在的步 */
  function idx(i, k) { return abs[i] + (k == null ? at(i) : k); }
  function progress(i) { return (POS.length < 2 ? 100 : idx(i) / (POS.length - 1) * 100) + "%"; }

  /* 「3」或者「3.2」——只有多个位置的那一页才带小数点 */
  function label(i, k) {
    var g = groups[gOf[i]];
    return (gOf[i] + 1) + (g.pos.length > 1 ? "." + (head[i] + (k == null ? at(i) : k) + 1) : "");
  }

  function paint(i) {
    cur = i;
    slides.forEach(function (s, k) {
      s.classList.toggle("is-active", k === i);
      if (k === i) prepare(s); else { still(s); halt(s); }
    });
    announce();
  }

  /* 缩略图、计数、地址栏、演讲者视图都从这儿知道现在在哪：翻页、走一步都发 */
  function announce() {
    syncThumbs();
    try { history.replaceState(null, "", "#" + label(cur)); } catch (e) {}
    deck.dispatchEvent(new CustomEvent("vt:slide", { detail: { index: cur, step: at(cur) } }));
  }

  /* 悬停预览：把某一组的缩略图临时换成第 f 帧第 k 步，null = 还原。
     步是帧自己的状态，预览时拨过去、离开时拨回来。 */
  var peeked = null;
  function peek(f, k) {
    if (peeked) { stepTo(slides[peeked.i], peeked.at, true); peeked = null; }
    if (f == null) { syncThumbs(); return; }
    var g = groups[gOf[f]];
    peeked = { i: f, at: at(f) };
    stepTo(slides[f], k, true);
    for (var i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === f);
    if (g.dots) g.pos.forEach(function (q, d) { g.dots[d].classList.toggle("is-peek", q.i === f && q.at === k); });
  }

  /* 缩略图显示哪一帧：正在这一页上就显示当前帧，否则显示最后一帧走到最后一步
     （这页搭完的样子，跟讲义一个道理）。 */
  function syncThumbs() {
    var now = idx(cur);
    groups.forEach(function (g, k) {
      var here = gOf[cur] === k;
      var pick = here ? cur : g.to - 1;
      /* 按 want 不按 cur：正要进去的那一页（过渡还没落定）已经落好位了，别拨回去。
         总览缩放一开始浏览器就不再对真实 DOM 做命中测试，圆点会先收到 pointerleave */
      if (!here && gOf[want] !== k) stepTo(slides[pick], stepsOf(slides[pick]).n, true);
      for (var i = g.from; i < g.to; i++) slides[i].classList.toggle("is-thumb", i === pick);
      g.el.classList.toggle("is-here", here);
      /* 圆点是进度不是位置：走过的一律实心，当前那颗再亮一档。
         规则对所有页统一——已经翻过去的页整排实心，还没到的整排空心。 */
      if (g.dots) g.pos.forEach(function (q, d) {
        g.dots[d].classList.toggle("is-on", q.n <= now);
        g.dots[d].classList.toggle("is-now", q.n === now);
        g.dots[d].classList.remove("is-peek");
      });
    });
  }

  /* 缩略图的标题栏和位置指示点。跟工具栏一样由 runtime 自己建——版面里不该有
     放映器的零件。它们是组的子节点、不是幻灯片的，所以总览缩放（名字挂在组上）
     不会把标题栏一起放大到全屏。 */
  groups.forEach(function (g, k) {
    var cap = document.createElement("div");
    cap.className = "vt-cap";
    cap.innerHTML = "<b></b><span></span>";
    cap.firstChild.textContent = k + 1;
    cap.lastChild.textContent = g.title;
    cap.lastChild.title = g.title;
    g.el.insertBefore(cap, g.el.firstChild);

    if (g.pos.length < 2) return;
    var dots = document.createElement("div");
    dots.className = "vt-dots";
    g.dots = g.pos.map(function (q, d) {
      var el = document.createElement("i");
      el.dataset.frame = q.i;
      el.dataset.at = q.at;
      el.title = "第 " + (d + 1) + " 步";
      /* 悬停就把缩略图换成那一步——不用点进去也能看清哪一步是哪一步 */
      el.addEventListener("pointerenter", function () { peek(+this.dataset.frame, +this.dataset.at); });
      dots.appendChild(el);
      return el;
    });
    dots.addEventListener("pointerleave", function () { peek(null); });
    g.el.appendChild(dots);
  });

  /* ── 同一个 key 在一页里出现多次 ────────────────────────────────────
     View Transitions 一个名字只能配一对，所以「一个变三个」没法直接表达。
     做法是**在少的那一边复制**：把那一个原地复制两份、三个名字各挂一个，
     于是三组各有 old 和 new，三份从同一个地方出发飞向三个终点——看起来
     就是分裂。反过来就是归并。复制品在过渡结束后删掉，改过的名字改回去。

     复制的是提升出来的区域 <svg>，里面只有 <use xlink:href="#g…">，引用的
     字形 <symbol> 留在底图的 <defs> 里、全文档解析，所以复制不带 id、
     也不复制任何字形数据。 */

  function safe(k) { return k.replace(/[^A-Za-z0-9_-]/g, "-"); }

  function marksOf(slide) {
    var by = {};
    Array.prototype.forEach.call(slide.querySelectorAll(".vt-mark[data-vt-key]"), function (m) {
      (by[m.dataset.vtKey] = by[m.dataset.vtKey] || []).push(m);
    });
    return by;
  }

  /* 把 els 摊成 K 个名字：第 i 个名字取第 floor(i*k/K) 个源，
     同一个源被取第二次就复制一份压在原处。记下动过的，过渡完还原。 */
  function spread(els, K, key, undo) {
    var k = els.length, used = {};
    for (var i = 0; i < K; i++) {
      var si = Math.floor((i * k) / K), el;
      if (used[si]) {
        el = els[si].cloneNode(true);
        els[si].parentNode.insertBefore(el, els[si].nextSibling);
        undo.push(function (el) { el.remove(); }.bind(null, el));
      } else {
        el = els[si];
        used[si] = 1;
        undo.push(function (el, was) { el.style.viewTransitionName = was; }.bind(null, el, el.style.viewTransitionName));
      }
      el.style.viewTransitionName = "m-" + safe(key) + "-" + (i + 1);
    }
  }

  function balance(from, to, undo) {
    var A = marksOf(from), B = marksOf(to);
    Object.keys(A).forEach(function (k) {
      if (!B[k] || A[k].length === B[k].length) return;     // 单边的走进出场；数量一样的不用管
      var K = Math.max(A[k].length, B[k].length);
      spread(A[k], K, k, undo);
      spread(B[k], K, k, undo);
    });
  }

  /* 单边的标记（这次过渡里名字没配对上的）：自己写了 mark(transition:)（hoist 落成
     data-vt-fx）的加 vt-fx-<效果>，CSS 按它走进出场；没写的把名字摘掉、并回 root——
     它就是整页快照的一部分，整页怎么推、怎么揭、怎么淡它就怎么走，天然对齐成一张
     （单独成组再按自己的盒子推，只挪自己那么宽，看着就是背景走了它没走）。
     以前靠 :only-child 认单边，Chrome 152 起它在过渡伪元素上不可靠。 */
  function soloize(from, to, undo) {
    var names = function (s) {
      var o = {};
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) { o[m.style.viewTransitionName] = 1; });
      return o;
    };
    var A = names(from), B = names(to);
    var tag = function (s, other) {
      Array.prototype.forEach.call(s.querySelectorAll(".vt-mark"), function (m) {
        if (other[m.style.viewTransitionName]) return;
        var name = m.style.viewTransitionName, cls = m.style.viewTransitionClass;
        if (m.dataset.vtFx) m.style.viewTransitionClass = (cls || "vt-mo") + " vt-fx-" + m.dataset.vtFx;
        else m.style.viewTransitionName = "none";
        undo.push(function () { m.style.viewTransitionName = name; m.style.viewTransitionClass = cls; });
      });
    };
    tag(from, B);
    tag(to, A);
  }

  /* ── 元素动画（mark(key, s0, s1, …)）────────────────────────────────
     一个标记的 N 个状态在 SVG 里是 N 个并排的 <g data-typst-label="vt-key@i">，
     同一张图的不同参数：结构一样、只差数值。任何时候只显示一个。走一步 =
     换显示哪一个，同时让新状态的每个节点从旧状态对应节点的值出发，动画到
     它自己的值——transform、path 的 d、颜色、线宽、透明度都是 CSS 属性，
     交给 Web Animations 插值，补的是几何本身。倒退就是反过来走同一段。
     结构对不上（节点数或类型不同）的只切换不补间，控制台会说。
     一帧里有几个这样的标记就一起走，步数取最多的那个，少的走到头就停。 */

  function stepsOf(s) {
    if (s.vtSteps) return s.vtSteps;
    var marks = [], m = null, spec = animSpec(s);
    /* 按文档顺序扫，遇到 @0 就起一个新标记：同一个 key 在一帧里出现两次也各是各的。
       状态里面再套状态不支持——里面的一律当普通节点（hoist 也不提它们）。 */
    Array.prototype.forEach.call(s.querySelectorAll(STATE), function (g) {
      if (g.parentNode.closest(STATE)) return;
      var l = g.getAttribute("data-typst-label"), at = l.lastIndexOf("@"), i = parseInt(l.slice(at + 1), 10);
      if (i === 0 || !m) marks.push(m = { key: l.slice(3, at), states: [] });
      m.states[i] = g;
    });
    var all = function (g) { return Array.prototype.slice.call(g.querySelectorAll("*")); };
    var n = 0;
    marks.forEach(function (m) {
      m.states = m.states.filter(Boolean);
      m.nodes = m.states.map(all);
      var ok = m.nodes.every(function (list) {
        return list.length === m.nodes[0].length &&
          list.every(function (el, q) { return el.tagName === m.nodes[0][q].tagName; });
      });
      if (!ok) {
        console.warn("[vtslides] " + m.key + " 的各个状态结构不一样（节点数或类型不同），只能切换、不能补间");
        m.nodes = null;
      }
      /* slide(anim:) 点了名的标记，状态归连续动画用，不算步 */
      m.anim = m.key in spec && fromStates(spec[m.key]);
      if (!m.anim) n = Math.max(n, m.states.length - 1);
    });
    return (s.vtSteps = { marks: marks, n: n });
  }

  /* 逐节点对照这些属性。变没变看属性字符串——各状态是同一段代码生成的，相等
     就是没变。值不自己解析：浏览器早把 SVG 的 presentation attribute 解析成 CSS
     属性了，getComputedStyle 直接给 CSS 语法——transform 是 matrix()，d 是
     path()，x 带 px，没写的也算好了（没有 transform 就是 none，fill 继承下来），
     display:none 的子树里照样能读。表是 SVG 属性名 → 同一个属性在 CSSOM /
     关键帧里的名字（关键帧只认 IDL 名，传 "stroke-width" 会被静默丢掉）。 */
  var PROPS = { d: "d", transform: "transform", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth",
                opacity: "opacity", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
                x: "x", y: "y", width: "width", height: "height", r: "r", cx: "cx", cy: "cy", rx: "rx", ry: "ry" };

  /* 同一位置的节点 list 里，哪些属性不全相同 */
  function changed(list) {
    return Object.keys(PROPS).filter(function (a) {
      var v = list[0].getAttribute(a);
      return list.some(function (el) { return el.getAttribute(a) !== v; });
    });
  }
  /* 节点 el 的这些属性现在的值，关键帧写法 */
  function values(el, attrs, kf) {
    var cs = getComputedStyle(el);
    attrs.forEach(function (a) { kf[PROPS[a]] = cs[PROPS[a]]; });
    return kf;
  }

  function stepTo(s, k, instant) {
    var st = stepsOf(s), from = s.vtAt || 0;
    k = Math.max(0, Math.min(st.n, k));
    if (k === from) return;
    s.vtAt = k;
    halt(s);
    var live = !instant && !reduced.matches;
    st.marks.forEach(function (m) {
      if (m.anim) return;
      var a = Math.min(from, m.states.length - 1), b = Math.min(k, m.states.length - 1);
      m.states.forEach(function (g, i) { g.style.display = i === b ? "inline" : "none"; });
      if (a === b || !live || !m.nodes) return;
      /* 新状态的节点只给一个起点关键帧（旧状态对应节点的值）；终点是节点自己的属性，
         播完自然落在那儿，不用收尾 */
      m.nodes[b].forEach(function (el, j) {
        var diff = changed([m.nodes[a][j], el]);
        if (diff.length) s.vtRun.push(el.animate([values(m.nodes[a][j], diff, { offset: 0 })], { duration: durMs(defaultMs), easing: EASE }));
      });
    });
    /* 瞬时的那些（落位、预览、缩略图）都不是「走了一步」，不发；发的由调用方 paint() 去发 */
    if (!instant && s === slides[cur]) announce();
  }

  /* 正在播的一步立刻收掉——新状态本来就落在自己的属性上，取消就是跳到终点 */
  function halt(s) {
    (s.vtRun || []).forEach(function (a) { a.cancel(); });
    s.vtRun = [];
  }

  /* ── 连续动画（slide(anim:)）──────────────────────────────────────
     <section data-anim='{"dot":{"follow":"track","duration":3000}}'>。
     不发明 DSL：spec 就是 Web Animations API 的 keyframes + options，原样交给
     el.animate()。三种关键帧来源：写了 keyframes 就动标记本身；follow 沿同一帧里
     另一个标记的第一条 <path> 跑（CSS offset-path，合成器上跑，动的只有
     offset-distance）；两者都没写、标记又带了多个状态，那些状态就是关键帧——
     每个节点各自一条动画，关键帧是各状态里对应节点的值。
     路径要换算成 deck 里的 px，所以在这一帧显示出来之后才建、尺寸变了重算；
     翻页过渡播完才开始（过渡里快照是静止的，播着的话结束时会跳一下），
     不在台上的帧一律暂停。 */

  function animSpec(s) {
    if (!s.vtSpec) { s.vtSpec = {}; try { s.vtSpec = JSON.parse(s.dataset.anim || "{}"); } catch (e) {} }
    return s.vtSpec;
  }
  function fromStates(o) { return !o.keyframes && !o.follow; }

  function prepare(s) {
    if (!s.vtAnims) {
      s.vtAnims = [];
      var spec = animSpec(s);
      Object.keys(spec).forEach(function (key) {
        var o = spec[key], el = s.querySelector('.vt-mark[data-vt-key="' + key + '"]');
        if (!el) { console.warn("[vtslides] anim: 这一帧里没有标记 " + key); return; }
        var opts = { duration: 1000, iterations: Infinity, easing: "linear" };
        Object.keys(o).forEach(function (k) {
          if (k !== "keyframes" && k !== "follow" && k !== "orient") opts[k] = o[k];
        });
        var keep = function (a, fit) { a.pause(); s.vtAnims.push({ a: a, fit: fit }); };
        if (fromStates(o)) {
          var m = stepsOf(s).marks.filter(function (m) { return m.key === key; })[0];
          if (!m || !m.nodes) { console.warn("[vtslides] anim: " + key + " 没有 keyframes、follow，也没有多个状态可播"); return; }
          m.nodes[0].forEach(function (node, j) {
            var column = m.nodes.map(function (list) { return list[j]; }), diff = changed(column);
            if (diff.length) keep(node.animate(column.map(function (el) { return values(el, diff, {}); }), opts));
          });
        } else if (o.follow) {
          var track = s.querySelector('.vt-mark[data-vt-key="' + o.follow + '"] path');
          if (!track) { console.warn("[vtslides] anim: " + key + " 要沿着 " + o.follow + " 跑，但这一帧里没有它或它里面没有 path"); return; }
          el.style.offsetRotate = o.orient ? "auto" : "0deg";
          /* path() 的坐标 Chrome 按元素自己的盒子算、规范按包含块算，offset-position
             也拧不过来。把元素挪到包含块原点，两种解释就重合了；反正它从 0% 起步，
             静息位置无所谓。 */
          el.style.left = el.style.top = "0";
          keep(el.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], opts),
               function () { el.style.offsetPath = pathIn(track); });
        } else keep(el.animate(o.keyframes, opts));
      });
    }
    s.vtAnims.forEach(function (x) { if (x.fit) x.fit(); });
  }

  /* 把 path 采样成 deck 坐标系（px）里的折线。containing block 就是 .vt-page，
     和 deck 同框。 */
  function pathIn(path) {
    var m = path.getScreenCTM(), r = deck.getBoundingClientRect();
    if (!m) return "none";
    var L = path.getTotalLength(), N = 240, d = [];
    for (var i = 0; i <= N; i++) {
      /* Typst 导出的 d 以 "M 0 0 m …" 开头：原点上有个空子路径，getPointAtLength(0)
         会落在那儿。从一个极小长度起采，绕开它。 */
      var q = path.getPointAtLength(i ? L * i / N : Math.min(L, 0.01)).matrixTransform(m);
      d.push((i ? "L" : "M") + (q.x - r.left).toFixed(1) + " " + (q.y - r.top).toFixed(1));
    }
    return 'path("' + d.join("") + '")';
  }

  function still(s) { (s.vtAnims || []).forEach(function (x) { x.a.pause(); }); }
  function play() {
    var s = slides[cur];
    if (!s.vtAnims || reduced.matches || over()) return;
    s.vtAnims.forEach(function (x) { x.a.play(); });
  }
  new ResizeObserver(function () {
    (slides[cur].vtAnims || []).forEach(function (x) { if (x.fit) x.fit(); });
  }).observe(deck);

  /* ── 过渡 ────────────────────────────────────────────────────────────
     types 是这次过渡的类型（["slide", "back"]、["zoom"]），交给 API，CSS 用
     html:active-view-transition-type(slide) 选规则；生命周期浏览器自己管，被跳过的
     过渡不会把后一次的类型带走。假值 = 不过渡直接落位。setup 在捕获旧快照之前跑
     （配名字、加效果类、临时名），往 undo 里塞的收尾在播完后跑。 */
  function transition(types, update, setup) {
    if (!types) { update(); play(); return; }
    root.style.setProperty("--vt-dur", dur(defaultMs));
    var undo = [];
    if (setup) setup(undo);
    var vt = document.startViewTransition({ update: update, types: types });
    var clear = function () { undo.forEach(function (f) { f(); }); play(); };
    vt.finished.then(clear, clear);
  }

  function go(i, k) {
    i = clamp(i);
    if (i === want) return;
    var dir  = i > want ? "fwd" : "back";
    var dest = slides[i];
    /* 页间过渡才用页级的效果（整页推、揭、淡）：进入的那一页决定怎么进，后退时按
       离开的那一页，所以过渡总是原路倒放。页内帧与帧之间版面没动，只是增量变化，
       root 一律交叉淡化——相同的部分不变，多出来的那块淡入；元素自己的进出场由
       mark(transition:) 管。 */
    var owner = dir === "fwd" ? dest : slides[want];
    var fx    = gOf[i] === gOf[want] ? "fade" : owner.dataset.transition || defaultFx;
    want = i;
    stepTo(dest, k || 0, true);
    var live = canVT && !reduced.matches && fx !== "none" && !over();
    transition(live && [fx, dir], function () { paint(i); }, function (undo) {
      balance(slides[cur], dest, undo);
      soloize(slides[cur], dest, undo);
    });
  }

  /* 走到某个位置：同一帧里就是走一步（动画），换了帧就是翻页 */
  function goto(q) { if (q.i === want) stepTo(slides[q.i], q.at); else go(q.i, q.at); }
  /* 往前/往后一格。总览里按帧走，不管步。 */
  function step(d) {
    var q = !over() && POS[idx(want) + d];
    if (q) goto(q); else go(want + d);
  }
  var next = function () { step(1); };
  var prev = function () { step(-1); };

  /* ── input ────────────────────────────────────────────────────────── */

  var NEXT = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, " ": 1, Enter: 1, n: 1, j: 1 };
  var PREV = { ArrowLeft: 1, ArrowUp: 1, PageUp: 1, Backspace: 1, p: 1, k: 1 };

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    if (NEXT[e.key])      { e.preventDefault(); next(); }
    else if (PREV[e.key]) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); pick(0); }
    else if (e.key === "End")  { e.preventDefault(); pick(groups[gn - 1].from); }
    else if (e.key === "f") { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === "l") { e.preventDefault(); toggleLaser(); }
    else if (e.key === "s") { e.preventDefault(); openSpeaker(); }
    else if (e.key === "-") { e.preventDefault(); setSpeed(speed / 1.25); }
    else if (e.key === "=" || e.key === "+") { e.preventDefault(); setSpeed(speed * 1.25); }
    else if (e.key === "0") { e.preventDefault(); setSpeed(1); }
    else if (e.key === "a" || e.key === "o") { e.preventDefault(); toggleOverview(); }
    else if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      pick(groups[Math.min(parseInt(e.key, 10) - 1, gn - 1)].from);
    }
  });

  /* 点击 = 翻页：左 1/3 上一页，其余下一页。主窗口的 deck 和演讲者视图里的
     「当前页」预览走的是同一个 tap()，只是各自的框不同。

     绑在 document 上按坐标判断，而不是绑在 deck 上按 target 冒泡：过渡期间
     浏览器不再对真实 DOM 做命中测试，事件 target 一律是 <html>，绑在 deck 上
     的监听器在动画播完前一次都收不到——那就是「落定了才能点」。给伪元素
     加 pointer-events:none 也没用（计算值确实变 none，但 target 还是 html）。 */
  function frac(pt, el) {
    var r = el.getBoundingClientRect();
    var x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x: x, y: y } : null;
  }
  function tap(q) { if (q.x < 1 / 3) prev(); else next(); }

  document.addEventListener("click", function (e) {
    if (over()) {
      var dot = e.target.closest(".vt-dots i");
      if (dot) { openSlide(+dot.dataset.frame, +dot.dataset.at); return; }
      var g = e.target.closest(".vt-group");
      if (g) openSlide(slides.indexOf(g.querySelector(".vt-slide.is-thumb")));   // 所见即所得
      return;
    }
    if (e.target.closest("a, button, input, select, textarea, pre, table")) return;
    if (bar && frac(e, bar)) return;         // 过渡期间点在工具栏上，也不当成翻页
    if (lasing && touching) return;          // 触摸指点中，不当成翻页
    var q = frac(e, deck);
    if (q) tap(q);
  });

  var tx = 0, ty = 0, swiping = false;
  document.addEventListener("touchstart", function (e) {
    var t = e.changedTouches[0];
    swiping = !!frac(t, deck);
    tx = t.clientX;
    ty = t.clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!swiping || lasing) return;          // 激光笔开着时不吃滑动
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  /* 滚轮翻页：向下下一页、向上上一页。鼠标滚轮一格 deltaY≈100，一格一页；
     触控板一次手势是一串小 delta，累加过阈值才翻，翻完清零并冷却 300ms，
     手势收尾的惯性大多落在冷却期里被吃掉。总览里滚轮是滚网格，不翻页。
     主窗口的 deck 和演讲者视图的预览用同一个 wheel()。 */
  var wheelAcc = 0, wheelAt = 0;
  function wheel(e) {
    var now = Date.now();
    if (now - wheelAt < 300) { wheelAcc = 0; return; }
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    wheelAt = now;
    if (wheelAcc > 0) next(); else prev();
    wheelAcc = 0;
  }
  document.addEventListener("wheel", function (e) {
    if (!over() && frac(e, deck)) wheel(e);
  }, { passive: true });

  /* 地址栏改了就跟过去（replaceState 不触发这个事件，自己发的不会绕回来） */
  window.addEventListener("hashchange", function () { goto(fromHash()); });

  /* "#3" = 第 3 页第 1 个位置，"#3.4" = 第 3 页第 4 个位置（帧和步展平后数） */
  function fromHash() {
    var m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return POS[0];
    var g = groups[Math.min(Math.max(parseInt(m[1], 10) - 1, 0), gn - 1)];
    return g.pos[Math.min(Math.max(m[2] ? parseInt(m[2], 10) - 1 : 0, 0), g.pos.length - 1)];
  }

  /* ── modes ────────────────────────────────────────────────────────── */

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(function () {});
  }

  /* 总览 ←→ 放映：整页缩放，不做元素级 morph。
     缩略图和放映页是同一个 .vt-slide，给它一个临时的 view-transition-name，
     浏览器就把两个状态下的框补间起来 —— 看上去就是这一页放大/缩小到位。
     同时在 CSS 里用 !important 盖掉每个 .vt-mark 的名字，让标记并回 root：
     不然上一页残留的标记会各自配对起飞，那是「翻页」的动画，不是「打开」。*/
  function zoomTo(i, update) {
    var dest = groups[gOf[i]].el;
    transition(canVT && !reduced.matches && ["zoom"], update, function (undo) {
      dest.style.viewTransitionName = "vt-zoom";
      undo.push(function () { dest.style.viewTransitionName = ""; });
    });
  }

  function toggleOverview() {
    if (over()) openSlide(cur);
    else zoomTo(cur, function () { deck.classList.add("vt-all"); still(slides[cur]); syncTools(); });
  }

  /* 从总览挑一页进去；不指定步就按缩略图里正显示的那一步。
     点的是预览中的那个点，就是要它——退出总览时圆点的 pointerleave 别再拨回去。 */
  function openSlide(i, k) {
    want = i;
    peeked = null;
    if (k != null) stepTo(slides[i], k, true);
    zoomTo(i, function () { deck.classList.remove("vt-all"); paint(i); });
  }

  /* 总览里选页 = 打开；放映里 = 普通翻页 */
  function pick(i) { if (over()) openSlide(i); else go(i); }

  /* ── 工具栏 ──────────────────────────────────────────────────────────
     由 runtime 建，任何 deck 都有。在 .vt-deck 外面、自带 view-transition-name，
     翻页过渡不会把它带上。一套工具栏可以建在任何文档里：主窗口一份（自动
     隐藏），演讲者视图一份（常驻右下角）。按钮都指向同一组函数，状态由
     syncTools() 一起刷。 */

  var ICON = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    laser: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
    down: "M12 4v10M8 12l4 4 4-4M5 20h14",
    notes: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
    full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    unfull: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"
  };

  function svg(d, extra) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      d.split("M").filter(Boolean).map(function (seg) { return '<path d="M' + seg + '"/>'; }).join("") +
      (extra || "") + "</svg>";
  }

  /* PDF 下载。同一份 .typ 出的 PDF 就在旁边，观众问「有讲义吗」时不用翻聊天记录。
     data-pdf="auto"（默认）= 跟本页同名的 .pdf；"none" = 不放这个按钮。
     download + target=_blank 是配合：能下载就不离开当前页，
     下载属性被忽略时（跨域、某些 file:// 情形）也只是新开一个标签页。 */
  var pdfHref = (function () {
    var v = deck.dataset.pdf || "auto";
    if (v === "none") return "";
    if (v !== "auto") return v;
    var m = /^([^?#]*)\.x?html?$/i.exec(location.href);
    return m ? m[1] + ".pdf" : "";
  })();

  function buildBar(doc) {
    function button(label, markup, onClick) {
      var el = doc.createElement("button");
      el.type = "button";
      el.title = label;
      el.setAttribute("aria-label", label);
      el.innerHTML = markup;
      el.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
      return el;
    }
    var b = { el: doc.createElement("div"), count: doc.createElement("div") };
    b.el.className = "vt-bar";
    b.count.className = "vt-count";
    b.el.appendChild(b.count);

    b.overview = button("总览 (o)", svg(ICON.grid), toggleOverview);
    b.el.appendChild(b.overview);
    b.laser = button("激光笔 (l)", svg(ICON.laser, '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'), toggleLaser);
    b.el.appendChild(b.laser);
    b.el.appendChild(button("演讲者视图 (s)", svg(ICON.notes), openSpeaker));

    if (pdfHref) {
      var a = doc.createElement("a");
      a.className = "vt-dl";
      a.href = pdfHref;
      a.download = "";
      a.target = "_blank";
      a.rel = "noopener";
      a.title = "下载 PDF";
      a.setAttribute("aria-label", "下载 PDF");
      a.innerHTML = svg(ICON.down);
      a.addEventListener("click", function (e) { e.stopPropagation(); });
      b.el.appendChild(a);
    }

    b.full = button("全屏 (f)", svg(ICON.full), toggleFullscreen);
    b.el.appendChild(b.full);
    return b;
  }

  /* 演讲者视图里的两个预览是这份 HTML 的副本（iframe name="vt-mirror"）：
     它们只负责显示，不要工具栏。 */
  var bars = [];
  var bar = null;
  if (window.name !== "vt-mirror") {
    var mainBar = buildBar(document);
    bars.push(mainBar);
    bar = mainBar.el;
    document.body.appendChild(bar);
    bar.addEventListener("pointerenter", showBar);
  }

  /* 自动隐藏：工具栏是界面不是内容 */
  var hideAt = 0, barTimer = null;

  function showBar() {
    if (!bar) return;
    bar.classList.add("is-shown");
    hideAt = Date.now() + 2400;
    if (!barTimer) barTimer = setInterval(function () {
      if (Date.now() < hideAt || bar.matches(":hover") || bar.contains(document.activeElement)) return;
      bar.classList.remove("is-shown");
      clearInterval(barTimer);
      barTimer = null;
    }, 300);
  }

  /* ── 激光笔 ──────────────────────────────────────────────────────────
     鼠标用 CSS cursor 换成光点（零延迟，deck.css 里）；触摸和笔没有光标可换，
     改走 DOM 光点。按每个事件自己的 pointerType 分流，鼠标和触屏都有的机器
     也各得其所。演讲者视图在预览上指点时也走 DOM 光点（主窗口没有鼠标）。

     lasing 是放映状态，进出总览一律不动它——总览里只是把光标/光点临时收起来
     （cursor 由 CSS 还原，光点由 route 挡掉），退出总览自然恢复。 */

  var lasing = false;
  var touching = false;   // 最近一次输入是不是非鼠标
  var laser = document.createElement("div");
  laser.className = "vt-laser";
  document.body.appendChild(laser);

  function route(e) {
    var mouse = e.pointerType === "mouse" || e.pointerType === "";
    touching = !mouse;
    document.body.classList.toggle("vt-nomouse", touching);
    if (!lasing || mouse || over()) { laser.classList.remove("is-on"); return; }
    dot(e.clientX, e.clientY);
  }

  function dot(x, y) {
    laser.style.transform = "translate(" + x + "px," + y + "px)";
    laser.classList.add("is-on");
  }

  document.addEventListener("pointermove", function (e) { showBar(); route(e); });
  document.addEventListener("pointerdown", route);
  document.addEventListener("pointerup", function () { if (touching) laser.classList.remove("is-on"); });
  document.addEventListener("pointercancel", function () { laser.classList.remove("is-on"); });

  function toggleLaser() {
    lasing = !lasing;
    document.body.classList.toggle("vt-lasing", lasing);
    if (!lasing) laser.classList.remove("is-on");
    syncTools();
    showBar();
  }

  function syncTools() {
    var text = label(cur) + " / " + gn;
    var fs = !!document.fullscreenElement;
    bars.forEach(function (b) {
      b.el.ownerDocument.body.classList.toggle("vt-lasing", lasing);   // 演讲者窗口的光标也跟着换
      b.count.textContent = text;
      b.overview.setAttribute("aria-pressed", String(over()));
      b.laser.setAttribute("aria-pressed", String(lasing));
      b.full.innerHTML = svg(fs ? ICON.unfull : ICON.full);
      b.full.title = fs ? "退出全屏 (f)" : "全屏 (f)";
      b.full.setAttribute("aria-label", b.full.title);
    });
  }

  document.addEventListener("fullscreenchange", syncTools);
  deck.addEventListener("vt:slide", syncTools);

  /* 在计数的位置闪一下（速度倍率之类），900ms 后 syncTools 会把页码写回来 */
  var flashTimer = null;
  function flash(text) {
    bars.forEach(function (b) { b.count.textContent = text; });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncTools, 900);
    showBar();
  }

  /* 界面明暗：deck(theme:) 固定，auto 跟系统。这里只把结论落到
     <html data-theme>，颜色全在 deck.css 的 token 里；演讲者窗口照抄。 */
  var speaker = null, spk = null, spkFrom = 0;
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)");
  function applyTheme() {
    var t = deck.dataset.theme || "auto";
    root.dataset.theme = t === "auto" ? (prefersLight.matches ? "light" : "dark") : t;
    if (speaker && !speaker.closed) speaker.document.documentElement.dataset.theme = root.dataset.theme;
  }
  prefersLight.addEventListener("change", applyTheme);
  applyTheme();

  /* ── 演讲者视图 ─────────────────────────────────────────────────────
     独立窗口，能拖到另一块屏幕。里面「当前页 / 下一步」是两个 iframe，
     装的就是这份 HTML 自己，用 #hash 定到那个位置——deck 本来就按 hash 走，
     不用再写一套渲染，过渡和元素动画也照常播。窗口是 about:blank、跟主窗口
     同源，DOM 直接建；iframe 里的副本一律不碰（file:// 下每个文件各是一个
     origin），只改 src。同步靠 announce() 发出的 vt:slide，不轮询。
     备注就是这一页 .vt-group 里的 <aside class="vt-note">，原样搬过去。 */

  var SPEAKER_CSS =
    "html{color:var(--vt-fg2);font:15px/1.55 ui-sans-serif,system-ui,sans-serif}" +
    "body{margin:0;height:100vh;box-sizing:border-box;padding:12px;display:grid;gap:12px;" +
      "grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:auto auto minmax(0,1fr)}" +
    ".prog{grid-column:1/-1;height:3px;margin:-12px -12px 0;background:var(--vt-line)}" +
    ".prog i{display:block;height:100%;width:0;background:var(--vt-accent);transition:width .3s var(--vt-ease)}" +
    "header{grid-column:1/-1;display:flex;align-items:baseline;gap:10px;color:var(--vt-muted)}" +
    "header b{color:var(--vt-fg);font-variant-numeric:tabular-nums}" +
    "header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "header time{margin-left:auto;font:600 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "color:var(--vt-fg);cursor:pointer;font-variant-numeric:tabular-nums}" +
    "main,aside{display:flex;flex-direction:column;gap:8px;min-height:0}" +
    "small{color:var(--vt-muted)}" +
    "iframe{display:block;border:0;width:100%;aspect-ratio:var(--vt-w)/var(--vt-h);border-radius:6px;" +
      "background:var(--vt-page,#111318);pointer-events:none}" +
    "main{cursor:default}body.vt-lasing main{cursor:var(--vt-laser) 16 16,none}" +
    "[hidden]{display:none}" +
    ".note{flex:1;overflow:auto;padding:10px 14px;border-radius:6px;background:var(--vt-panel);" +
      "border:1px solid var(--vt-line);color:var(--vt-fg);font-size:17px}" +
    ".note:empty::before{content:'这一页没有备注';color:var(--vt-muted)}" +
    ".note>:first-child{margin-top:0}.note>:last-child{margin-bottom:0}" +
    ".note ul,.note ol{padding-left:1.3em}";

  var base = location.href.replace(/#.*$/, "");

  /* 界面样式从 deck.css 里原样抄过去：html 上的 token（含明暗两套和 --vt-laser）
     和选择器以 .vt-bar 开头的工具栏规则。 */
  function chromeCSS() {
    var out = [];
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      var rules;
      try { rules = sheet.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules, function (r) {
        if (r.selectorText && /^(html\b|\.vt-bar)/.test(r.selectorText)) out.push(r.cssText);
      });
    });
    return out.join("");
  }

  function openSpeaker() {
    if (speaker && !speaker.closed) { speaker.focus(); return; }
    speaker = window.open("", "vt-speaker", "popup,width=1040,height=640");
    if (!speaker) { console.warn("[vtslides] 演讲者视图被浏览器拦下了，请允许本页打开弹窗。"); return; }

    var d = speaker.document;
    d.head.innerHTML = "<style>" + chromeCSS() + SPEAKER_CSS + "</style>";
    d.documentElement.dataset.theme = root.dataset.theme;
    ["--vt-page", "--vt-w", "--vt-h"].forEach(function (v) {
      d.documentElement.style.setProperty(v, getComputedStyle(deck).getPropertyValue(v));
    });
    d.title = "演讲者视图 · " + document.title;
    d.body.innerHTML =
      "<div class='prog'><i></i></div>" +
      "<header><b></b><span></span><time title='点一下归零'>00:00</time></header>" +
      "<main><iframe name='vt-mirror'></iframe><div class='note'></div></main>" +
      "<aside><small>下一页</small><iframe name='vt-mirror'></iframe></aside>";
    spk = {
      page: d.querySelector("header b"), title: d.querySelector("header span"),
      clock: d.querySelector("time"), note: d.querySelector(".note"),
      now: d.querySelector("main iframe"), next: d.querySelector("aside iframe"),
      nextCap: d.querySelector("aside small"), prog: d.querySelector(".prog i")
    };

    /* 计时：从打开算起，点一下归零 */
    spkFrom = Date.now();
    spk.clock.addEventListener("click", function () { spkFrom = Date.now(); tick(); });
    var timer = setInterval(function () {
      if (speaker.closed) { clearInterval(timer); return; }
      tick();
    }, 1000);

    /* 自己的一份工具栏，常驻右下角；按钮和状态都是主窗口的 */
    var b = buildBar(d);
    b.el.classList.add("is-shown");
    d.body.appendChild(b.el);
    bars.push(b);
    speaker.addEventListener("pagehide", function () { bars.splice(bars.indexOf(b), 1); });

    /* 在这个窗口里按键 = 在主窗口里按键，所以它也是个遥控器 */
    d.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, cancelable: true }));
    });

    /* 「当前页」预览就是主窗口 deck 的替身：点它 = 点 deck（同一个 frac/tap），
       激光开着时在上面移动 = 在主窗口上指点。主窗口那边没有鼠标可换光标，
       走 DOM 光点；坐标按预览框 → 主 deck 框等比换算。 */
    d.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      var q = frac(e, spk.now);
      if (q) tap(q);
    });
    d.addEventListener("wheel", function (e) { if (frac(e, spk.now)) wheel(e); }, { passive: true });
    d.addEventListener("pointermove", function (e) {
      if (!lasing || over()) return;
      var q = frac(e, spk.now);
      if (!q) { laser.classList.remove("is-on"); return; }
      var m = deck.getBoundingClientRect();
      dot(m.left + q.x * m.width, m.top + q.y * m.height);
    });
    d.documentElement.addEventListener("pointerleave", function () { laser.classList.remove("is-on"); });

    syncSpeaker();
    syncTools();
  }

  function tick() {
    var s = Math.round((Date.now() - spkFrom) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    spk.clock.textContent = (h ? h + ":" : "") + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }

  /* 只改 src：跟当前 URL 只差 fragment 的导航不会重新加载，iframe 里的
     deck 收到 hashchange 就跟过去。 */
  function show(frame, hash) {
    var u = base + "#" + hash;
    if (frame.getAttribute("src") !== u) frame.src = u;
  }

  /* 「下一步」预览给的是观众接下来会看到的东西：还在这一页里（下一帧或元素
     动画的下一步）叫下一步，出了这一页才叫下一页。 */
  function syncSpeaker() {
    if (!spk || speaker.closed) return;
    var g = groups[gOf[cur]], nx = POS[idx(cur) + 1];
    spk.page.textContent = label(cur) + " / " + gn;
    spk.prog.style.width = progress(cur);
    spk.title.textContent = g.title;
    show(spk.now, label(cur));
    spk.next.hidden = !nx;
    spk.nextCap.textContent = !nx ? "最后一页" : gOf[nx.i] === gOf[cur] ? "下一步" : "下一页";
    if (nx) show(spk.next, label(nx.i, nx.at));
    var note = g.el.querySelector(".vt-note");
    spk.note.innerHTML = note ? note.innerHTML : "";
  }

  deck.addEventListener("vt:slide", syncSpeaker);
  /* 主窗口走了就把它收掉，免得留一个不再同步的窗口 */
  window.addEventListener("pagehide", function () { if (speaker && !speaker.closed) speaker.close(); });

  /* ── boot ─────────────────────────────────────────────────────────── */

  deck.setAttribute("data-ready", "");
  root.style.setProperty("--vt-dur", dur(defaultMs));
  var h0 = fromHash();
  stepTo(slides[h0.i], h0.at, true);
  paint(want = h0.i);
  play();
  showBar();

  window.vtslides = {
    go: go, next: next, prev: prev,
    get index() { return cur; },
    get total() { return n; },
    get step() { return at(cur); }, set step(k) { stepTo(slides[cur], k); },
    get steps() { return stepsOf(slides[cur]).n; },
    get speed() { return speed; }, set speed(v) { setSpeed(v); },
    deck: deck
  };
})();
