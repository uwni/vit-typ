/// vit — lay out whole pages in Typst, `mark` what should morph, and let
/// the browser do the rest.
///
/// The identity channel is a *label*: the SVG export turns `<lbl>` into a
/// `<g data-typst-label>` wrapping the content, so the subtree is the boundary;
/// on the PDF side a label costs nothing, so nothing is gated by backend.
///
/// Three words. A *transition* is a change of layout state (page to page,
/// frame to frame) and runs on the View Transitions API. An *element animation*
/// is one object varying with a parameter (`mark` with several states, stepped
/// with `→`) and runs on Web Animations. A *continuous animation* is an object
/// moving on its own, without keys. Both of those are `tween`'s and are
/// imported from it; vit's own subject is the first. The test is one sentence:
/// did the layout change, or is one object moving? Design trade-offs and
/// browser pitfalls are in the README.

/// Effect names. One is an effect for both sides of a transition; a pair
/// `(enter:, leave:)` names the two sides separately. `"fade"` cross-fades;
/// `"slide"` pushes horizontally (forward, the new page comes in from the
/// right and the old one leaves to the left); `"rise"` pushes vertically (in
/// from the bottom) — a page is pushed by the width or height of the screen
/// and is gone when it arrives, a mark by its own, so a mark fades as it
/// travels rather than winking out beside where it started; `"zoom"` scales about the centre (the new one shrinks
/// into place from three times its size, fading in, the old one grows away,
/// fading out) with the screen as the focal plane: whichever is larger than
/// life is nearer than the focus, and a lens a quarter of the stage wide
/// spreads each of its points over a circle that grows with the
/// magnification, so a stroke thinner than the circle casts only a diluted
/// shadow — text arrives as a haze and condenses as it lands;
/// `"wipe-left"` / `"wipe-right"` / `"wipe-up"` / `"wipe-down"`
/// reveal, named by the direction the front travels (`wipe-up`
/// sweeps up from the bottom edge: the new page appears, the old one is
/// covered); `"none"` switches at once. Going back always replays in reverse.
///
/// Everywhere a transition is given — `deck`, `slide`, `mark` — the dictionary
/// may also carry settings for that one transition, next to the effects:
///
/// ```typ
/// transition: (effect: "zoom", duration: 400, zoom: 6)
/// transition: (enter: "slide", leave: "fade", duration: 250, push: -100%)
/// transition: (enter: (effect: "slide", duration: 200), leave: (effect: "fade", duration: 900))
/// ```
///
/// `effect` names one effect for both sides, `enter` and `leave` the two sides
/// separately; a side may be a name or `(effect: name, …settings)`. Settings
/// beside the effects belong to the whole transition — both sides and, on a
/// paired mark, the group that carries it across; settings inside a side belong
/// to that side alone and beat the shared ones, because they land on that
/// image. Going back the two sides swap images, so the side that comes in
/// always runs the enter side's settings. `duration` is milliseconds, as in
/// `deck(duration:)`; `easing` is four numbers, as in `deck(easing:)`; the rest
/// are the effects' own knobs — `zoom`, how many times life size the zoom
/// starts at, and `push`, how far slide and rise travel (negative sends them
/// the other way).
///
/// `fit` and `anchor` are for a mark that is a whole assembly. A group
/// interpolates as a box, and each of its two images is drawn into that box,
/// stretched to fill it: right for something that keeps its shape, wrong for
/// something that grows on one side, which smears while the box grows.
/// `fit: "none"` draws both images at their own size instead, and `anchor`
/// (a Typst alignment, or the CSS pair) is the corner they are pinned to — the
/// corner that does not move. That is how a diagram keeps what it already had,
/// where it had it, while the rest arrives around it. A setting is a variable deck.css reads, so the stylesheet is
/// the vocabulary for both halves and a typo is a compile error. The Typst side
/// turns each bundle into one CSS rule and names it after what it holds; the
/// name travels as a view transition type on the page's frames and as a
/// `view-transition-class` on a mark. The presenter's speed keys still divide
/// every duration, whoever wrote it.
/// -> array
// Once tween is published, replace the next line with #import "@preview/tween:0.1.0" as _tween
#import "packages/tween/lib.typ" as _tween

// The player's own markup: a toolbar, the desk, the help, the speaker view.
#import "chrome/bar.typ": bar as _bar
#import "chrome/dots.typ": cap as _cap, dots as _dots
#import "chrome/help.typ": help as _help
#import "chrome/laser.typ": laser as _laser
#import "chrome/pane.typ": pane as _pane
#import "chrome/speaker.typ": speaker as _speaker


#let transitions = ("fade", "slide", "rise", "zoom", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// The package's version, read from the manifest so there is one place to bump
/// it. Not named `version`: that is a Typst built-in, and `import: *` would
/// shadow it.
/// -> str
#let version = version(toml("typst.toml").package.version.split(".").map(int))

/// The document's target, as `deck` sets it. `mark` needs to know which
/// backend it is in, but inside `html.frame` `target()` is always `"paged"`
/// (the frame is laid out as paper), so the value has to come in through
/// this state.
/// -> state
#let _target = state("vit-target", "paged")

/// A transition as the pair it is: how the new side enters, how the old side
/// leaves. A string is the same effect both ways; a dictionary
/// `(enter:, leave:)` names them separately (`in` would be the natural key,
/// but it is a keyword); `none` stays `none` (the caller says what that
/// means). Going back replays the pair in reverse.
/// -> none | dictionary
/// The four numbers of a cubic Bézier, as `deck(easing:)` takes them.
#let _bezier(e) = assert(
  type(e) == array and e.len() == 4 and e.all(v => type(v) in (int, float)),
  message: "easing must be the four numbers of a cubic Bézier, like (0.32, 0.72, 0, 1)",
)

/// What a transition may set, read out of the stylesheet: the knobs are the
/// `--vit-` variables deck.css reads, so the vocabulary is defined once, where
/// the effects are. `duration` and `easing` govern every effect; `zoom` is how
/// many times life size the zoom starts at, `push` how far slide and rise
/// travel (a negative distance sends them the other way).
/// -> dictionary
#let _knobs = {
  let k = (:)
  for m in read("deck.css").matches(regex("var\(\s*--vit-([a-z0-9-]+)")) { k.insert(m.captures.first(), true) }
  k
}

/// A setting as CSS writes it: a number is a number, and for `duration` the
/// milliseconds `deck(duration:)` counts; four numbers are a cubic Bézier, as
/// in `deck(easing:)`; a string is passed through, which is how a value CSS
/// has a syntax for and Typst has not (`-100%`, `120ms`) is written.
/// -> str
#let _css-value(
  /// -> str
  k,
  /// -> int | float | str | array | color | ratio | length | angle
  v,
) = {
  let t = type(v)
  if t == str { v } else if t == alignment {
    // an anchor is a corner, and CSS writes a corner as two percentages
    let pc = (
      left: "0%",
      center: "50%",
      right: "100%",
      top: "0%",
      horizon: "50%",
      bottom: "100%",
    )
    pc.at(repr(v.x), default: "50%") + " " + pc.at(repr(v.y), default: "50%")
  } else if t in (int, float) {
    str(v) + if k == "duration" { "ms" }
  } else if t == array {
    _bezier(v)
    "cubic-bezier(" + v.map(str).join(", ") + ")"
  } else if t == color { v.to-hex() } else if t in (ratio, length, angle) { repr(v) } else {
    panic(
      "a transition setting is a number, a string, a colour or the four numbers of a cubic Bézier; "
        + k
        + " is a "
        + str(t),
    )
  }
}

#let _pair(
  /// -> none | str | dictionary
  t,
) = {
  let knob(k, v) = {
    assert(
      k in _knobs,
      message: "a transition setting is a variable deck.css reads: "
        + repr(_knobs.keys().sorted())
        + " — not "
        + repr(k),
    )
    _css-value(k, v)
  }
  /// One side: a name, or a name with settings of its own.
  let side(x) = {
    if type(x) == str {
      assert(x in transitions, message: "a transition effect must be one of " + repr(transitions))
      return (effect: x, vars: (:))
    }
    assert(
      type(x) == dictionary and "effect" in x,
      message: "one side of a transition is an effect name, or (effect: name, …settings)",
    )
    assert(x.effect in transitions, message: "a transition effect must be one of " + repr(transitions))
    (
      effect: x.effect,
      vars: (:) + x.pairs().filter(((k, v)) => k != "effect").map(((k, v)) => (k, knob(k, v))).to-dict(),
    )
  }
  if t == none { return none }
  if type(t) == str { return (enter: side(t), leave: side(t), vars: (:)) }
  assert(type(t) == dictionary, message: "a transition is a name, or a dictionary naming its effects and settings")
  let named = t.keys().filter(k => k in ("effect", "enter", "leave")).sorted()
  assert(
    named == ("effect",) or named == ("enter", "leave"),
    message: "a transition names its effects as effect: name (the same both ways) or enter: name, leave: name",
  )
  let p = if named == ("effect",) { (enter: side(t.effect), leave: side(t.effect)) } else {
    (enter: side(t.enter), leave: side(t.leave))
  }
  let vars = (:)
  for (k, v) in t {
    if k in ("effect", "enter", "leave") { continue }
    vars.insert(k, knob(k, v))
  }
  p + (vars: vars)
}

/// The name a bundle of settings goes by: a view transition type on a page's
/// frames, a `view-transition-class` on a mark. It spells the settings out, so
/// the same settings always name the same rule, and names the side it belongs
/// to, because a side's rule is written differently from the whole
/// transition's.
/// -> str
#let _tag(
  /// -> none | str
  role,
  /// -> dictionary
  vars,
) = {
  ("set-" + if role != none { role + "-" } + vars.pairs().map(((k, v)) => k + "-" + v).join("-"))
    .replace(regex("[^A-Za-z0-9-]+"), "-")
    .trim("-", at: end)
}

/// The rule a bundle of settings becomes. Without a role it is the whole
/// transition's: on `html` for the page, where every image of it inherits the
/// values, and on the mark's own images if a mark carries the class. With one
/// it is that side's, and lands where deck.css puts that side's effect — the
/// enter side is the new image forward and the old image back, the leave side
/// the other two — so a side's own settings beat the transition's, being on
/// the image itself. An effect reads its knobs with `var(--vit-knob, default)`,
/// so providing one here is all it takes.
/// -> str
#let _rule(
  /// -> none | str
  role,
  /// -> dictionary
  vars,
) = {
  let tag = _tag(role, vars)
  let sels = if role == none {
    (
      "html:active-view-transition-type(" + tag + ")",
      "::view-transition-group(." + tag + ")",
      "::view-transition-old(." + tag + ")",
      "::view-transition-new(." + tag + ")",
    )
  } else {
    let (fwd, back) = if role == "enter" { ("new", "old") } else { ("old", "new") }
    let t(dir, side, what) = (
      "html:active-view-transition-type(" + dir + ")" + what + "::view-transition-" + side + "("
    )
    (
      t("fwd", fwd, ":active-view-transition-type(" + tag + ")") + "root)",
      t("fwd", fwd, "") + "." + tag + ")",
      t("back", back, ":active-view-transition-type(" + tag + ")") + "root)",
      t("back", back, "") + "." + tag + ")",
    )
  }
  (
    sels.join(",\n") + " {\n" + vars.pairs().map(((k, v)) => "  --vit-" + k + ": " + v + ";\n").join() + "}\n"
  )
}

/// Every bundle a transition carries, as the words that name its rules: the
/// pair's effects, then the settings of the whole and of each side.
/// -> array
#let _bundles(
  /// -> dictionary
  p,
) = (
  (if p.vars.len() > 0 { ((role: none, vars: p.vars),) } else { () })
    + (if p.enter.vars.len() > 0 { ((role: "enter", vars: p.enter.vars),) } else { () })
    + (if p.leave.vars.len() > 0 { ((role: "leave", vars: p.leave.vars),) } else { () })
)

/// A transition as the words deck.css keys its rules on: `enter-<effect>
/// leave-<effect>`, then the name of each bundle of settings it carries — the
/// types of a page transition, the classes of a one-sided mark. The runtime
/// adds the direction and nothing else.
/// -> str
#let _types(
  /// -> dictionary
  p,
) = (
  "enter-" + p.enter.effect + " leave-" + p.leave.effect + _bundles(p).map(b => " " + _tag(b.role, b.vars)).join()
)

/// The pair `deck(transition:)` set, for the pages that set none of their own;
/// `none` is no transition between pages.
/// -> state
#let _fx = state("vit-fx", _pair("fade"))

/// Between frames of one page the layout stays put and changes incrementally,
/// so the page cross-fades — what is the same stays, what was added fades in —
/// and elements enter and leave by their own `mark(transition:)`.
/// -> dictionary
#let _frame = _pair("fade")

/// Give a piece of content a name: this is one object, and the same `key` on
/// two adjacent pages is the same object, which the browser pairs and
/// interpolates — position, size, colour, rotation. This is a *transition*:
/// the layout changed. That is all a mark is: identity between pages. What
/// moves *inside* it — N states of one drawing, or the drawing playing them
/// over time — is `tween`'s, needs no mark, and is written where the drawing
/// is.
///
/// *In a formula*, hand the term over as an equation —
/// `$ #mark("sq")($x^2$) + #mark("lin")($b x$) = c $` — not as bare math: a
/// mark boxes what it is given, and a box lays its content out as markup,
/// which would set `b x` upright in the body font. An equation inside an
/// equation is transparent, so the term is typeset exactly as it would be
/// unmarked, and the operators around it keep their spacing. What is left
/// unmarked is the page's: `+` and `=` cross-fade with it, which is invisible
/// where they stay put and a double image where they move.
///
/// What has no in-between — text that changes, a path against an arc, states
/// whose element count differs — cross-fades. The PDF has no player and shows
/// the last state (the finished figure, like a handout). In the HTML the other
/// states are stacked on the first state's box (`place`, taking no layout
/// space) and hidden by the runtime as data.
///
/// With `tween(play:)` the same states are played over time instead of
/// stepped; the drawing says so itself and the deck only carries the word.
///
/// The inner `box` is not decoration, and not a preference: a label attaches to
/// the element before it, and of everything that can stand in a paragraph only
/// `box` and `block` carry one into the SVG as a `<g data-typst-label>`. Put the
/// label on a `rect`, a `circle`, a cetz canvas, an equation, `emph` or bare
/// text and the export writes no group at all — the mark would silently not
/// exist. Between the two, `block` is out: it is block-level, and a mark has to
/// work on a word inside a sentence and on a term inside a formula; it is also
/// breakable, and a mark split over two lines has no single box to interpolate.
///
/// A box does wrap its content, like ordinary text. But it is atomic, so one
/// that does not fit the rest of the line moves to a line of its own: marking a
/// word, a title, a term or a figure costs nothing, while marking a whole
/// sentence in the middle of running prose reflows the paragraph around it.
/// -> content
#let mark(
  /// The name. Same name on two adjacent pages = one pair. Letters, digits,
  /// `_` and `-` (it becomes a CSS `view-transition-name`).
  /// -> str
  key,
  /// This object's own enter/leave effect: a name from `transitions`, the same
  /// both ways, or `(enter: name, leave: name)` — `enter` is how it appears,
  /// `leave` how it disappears (going back replays either in reverse). It applies
  /// only when the mark is one-sided in a transition; a paired mark morphs
  /// regardless. `"wipe-up"` reveals from the bottom edge up, `"slide"` pushes
  /// in from the right (by its own width, fading as it goes), `"zoom"` shrinks into place,
  /// `"none"` appears at once. Unset (`none`) folds the mark into the page:
  /// within a page it cross-fades with the layout, between pages it pushes,
  /// wipes or fades with the whole page. Definition, theorem and proof each
  /// revealed from a different edge is three marks with one value each. One
  /// object has one effect: given on any occurrence of the key, it holds for
  /// all of them, and two occurrences may not disagree. Marks nest: one around
  /// an assembly is a group of its own, and the marks inside it keep their own
  /// identity — what the group carries is what is left once they are lifted
  /// out, which is how the first change's result takes part in the next one as
  /// a whole (see `fit` and `anchor` in `transitions`). Settings ride along in
  /// the same dictionary (`duration`, `easing`, `zoom`, `push`; see
  /// `transitions`) and apply to this mark alone, whatever pace the page keeps.
  /// -> none | str | dictionary
  transition: none,
  /// What the object is. Several states of one drawing are `tween`'s, not a
  /// mark's: `mark(key, tween(s0, s1, …))`.
  /// -> content
  body,
) = {
  assert(
    type(key) == str and key.match(regex("^[A-Za-z0-9_-]+$")) != none,
    message: "a mark key is letters, digits, _ and -: " + repr(key),
  )
  let fx = _pair(transition)
  // the label is the identity; the effect goes into the marks table deck()
  // writes (see _marks)
  let lbl = label("vit-" + key)
  let meta = if fx == none { none } else {
    [#metadata((key: key, transition: _types(fx), sets: _bundles(fx)))<vit-mark>]
  }
  [#meta#box(body)#lbl]
}

/// Which page and which frame we are up to. A page needs to find its own
/// frames among the document's, and its own number for the caption.
#let _pages = counter("vit-pages")
#let _frames = counter("vit-frames")

/// How many steps every frame of the document has, in document order. A step
/// is one press: the drawings on a frame step together, so the frame's count
/// is the longest of them; a drawing that plays itself is not stepped, and one
/// inside another's states is a node, not a drawing. Said out here because a
/// frame's insides are an `html.frame`, which nothing but a label leaves.
#let _steps() = {
  let out = ()
  for m in query(selector.or(<vit-frame>, <tween-steps>)) {
    if str(m.label) == "vit-frame" {
      out.push(0)
    } else if out.len() > 0 and not m.value.plays and not m.value.nested {
      out.at(out.len() - 1) = calc.max(out.at(out.len() - 1), m.value.states - 1)
    }
  }
  out
}

/// What the marks declared about themselves, by key: `(transition:)` for
/// now. Written into the HTML as a table for the runtime, which looks up and
/// never decides. Every occurrence of a key must say the same.
/// -> dictionary
/// The rules a transition's settings need, written where the transition is:
/// the deck's default with the stylesheet, a page's own in its own `<style>`,
/// a mark's with the marks. All of them land after deck.css, so they are what
/// the effects read. (A query for them all would not settle: what the pages
/// emit depends on the deck's default, which is what this is part of.)
/// -> str
#let _sets(
  /// -> none | dictionary
  fx,
) = if fx == none { "" } else { _bundles(fx).map(b => _rule(b.role, b.vars)).join("") }

#let _marks() = {
  let t = (:)
  let sets = ()
  for m in query(<vit-mark>) {
    let v = m.value
    assert(
      v.key not in t or t.at(v.key).transition == v.transition,
      message: "mark \"" + v.key + "\" is given two different transitions; one object has one",
    )
    t.insert(v.key, (transition: v.transition))
    for b in v.sets { if b not in sets { sets.push(b) } }
  }
  (table: t, css: sets.map(b => _rule(b.role, b.vars)).join(""))
}

/// The deck: page size, fonts, and on the HTML side the stylesheet and the
/// runtime.
///
/// `#show: deck.with(title: "…")`. One compile gives the PDF, one with
/// `--features html` the HTML; side by side under one name, the toolbar's
/// download link finds the PDF.
/// -> content
#let deck(
  /// Document title.
  /// -> str
  title: "vit",
  /// Layout width. The PDF page size; in the HTML every frame's `html.frame` is
  /// the same size — `slide` reads `page.width` / `page.height`, nothing is
  /// hard-coded.
  /// -> length
  width: 1280pt,
  /// Layout height.
  /// -> length
  height: 720pt,
  /// Target of the toolbar's PDF download link. `auto` = the `.pdf` with the
  /// HTML's name, `none` = no button, a string is used as is.
  /// -> auto | none | str
  pdf: auto,
  /// Transition duration in milliseconds. Adjustable live with `-` / `=` / `0`.
  /// -> int
  duration: 700,
  /// Transition easing: the two control points of a cubic Bézier, as in CSS
  /// `cubic-bezier(x1, y1, x2, y2)`. `(0, 0, 1, 1)` is linear. Used for page
  /// transitions and element-animation steps alike.
  /// -> array
  easing: (0.32, 0.72, 0, 1),
  /// The default *page-to-page* transition — how unmarked content enters and
  /// leaves when turning to another page: a name from `transitions`, the same
  /// both ways, or `(enter: name, leave: name)` — `enter` for the page being
  /// entered, `leave` for the page being left. Paired marks morph regardless;
  /// one-sided marks without an effect of their own fold into the page. The
  /// effect `"none"` switches that side at once while the transition runs (so
  /// marks still morph); `none` runs no transition between pages at all. Not
  /// used between frames of one page: there the layout stays put and only
  /// changes incrementally, so root cross-fades and elements enter and leave
  /// by `mark(transition:)`. A single page can override it with
  /// `slide(transition:)`. The dictionary may carry settings for this
  /// transition as well — `duration`, `easing`, `zoom`, `push`; see
  /// `transitions`.
  /// -> none | str | dictionary
  transition: "fade",
  /// Light/dark theme of the player chrome (toolbar, overview, speaker view).
  /// `auto` follows the system, `"dark"` / `"light"` fix it. Chrome only; the
  /// layout's colours are Typst's.
  /// -> auto | str
  theme: auto,
  /// Layout background. The PDF uses `page(fill:)`; `html.frame` carries no
  /// page background, so the same value opens the stylesheet as `--vit-page`
  /// and is painted under the slides and thumbnails — identical on both
  /// sides, and independent of the chrome theme.
  /// -> color
  fill: rgb("#111318"),
  /// Font stack, glyph-by-glyph fallback in order. The default carries a CJK
  /// family for a reason: with a Latin family alone, CJK text falls back glyph
  /// by glyph to whatever system family has the glyph, and weights differ
  /// within one line.
  /// -> array
  font: ("DejaVu Sans", "Noto Sans CJK SC"),
  /// The pages.
  /// -> content
  body,
) = {
  let fx = _pair(transition)
  _bezier(easing)
  assert(theme in (auto, "dark", "light"), message: "theme must be auto, \"dark\" or \"light\"")
  set document(title: title)
  set page(width: width, height: height, margin: 0pt, fill: fill)
  set text(size: 26pt, fill: rgb("#d5d9e2"), font: font)
  context {
    _fx.update(fx)
    _target.update(target())
    if target() == "html" {
      let marks = _marks()
      html.elem(
        "style",
        attrs: (id: "vit-style"),
        ":root{--vit-page:"
          + fill.to-hex()
          + ";--vit-w:"
          + str(width.pt())
          + ";--vit-h:"
          + str(height.pt())
          + ";--vit-duration:"
          + str(duration)
          + "ms"
          + ";--vit-easing:cubic-bezier("
          + easing.map(str).join(", ")
          + ")}\n"
          + _tween.css
          + read("deck.css")
          + _sets(fx)
          + marks.css,
      )
      _tween.html-target.update(true)
      html.elem(
        "div",
        attrs: (
          class: "vit-deck",
          "data-duration": str(duration),
          "data-easing": easing.map(str).join(" "),
          "data-theme": if theme == auto { "auto" } else { theme },
          "data-version": str(version),
        ),
        body,
      )
      // The player, outside .vit-deck so that a page transition never drags
      // it along. A preview (an iframe named vit-mirror) throws it away.
      let href = if pdf == none { none } else if pdf == auto { auto } else { pdf }
      _bar(pdf: href)
      _pane()
      _laser()
      _help(version: version)
      _speaker(pdf: href)
      html.elem("script", "const vitMarks = " + json.encode(marks.table) + ";")
      // what the drawings declared about themselves, carried back out of the
      // frames they were written in: the deck emits them, and never reads them
      _tween.declarations()
      html.script(read("hoist.js"))
      html.script(_tween.js)
      html.script(read("runtime.js"))
    } else { body }
  }
}

/// Frames from one description, written once. `reveal(3, (step, at) => …)`
/// renders the body once per frame — `step` is which frame it is, 1 to n — and
/// `at(k, x)` is `x` from frame k on. Before then it holds `x`'s space if `x` is
/// content, so the layout never moves and nothing jumps, and is `none`
/// otherwise, which is how a stroke or a fill is switched off:
///
/// ```typ
/// slide(..reveal(2, (step, at) => diagram({
///   node((0, 0), $A$)
///   node((1, 0), at(2, mark("b", transition: "zoom")[$B$]))
///   edge((0, 0), (1, 0), at(2, $f$), "->", stroke: at(2, 1pt))
/// })))
/// ```
///
/// Everything is written where it belongs, each part says when it arrives, and
/// because what has not arrived still takes its space, every frame is laid out
/// identically — which is what lets the marks morph instead of the page
/// re-flowing under them.
/// -> array
#let reveal(
  /// How many frames.
  /// -> int
  n,
  /// Called once per frame with the frame's number and `at`.
  /// -> function
  body,
) = range(1, n + 1).map(i => body(i, (k, x) => {
  if i >= k { x } else if type(x) == content { hide(x) } else { none }
}))

/// Layers of one picture, hung from the corner they share. Each layer is a mark
/// of its own — `key-1`, `key-2`, … — so a layer that is on two frames keeps its
/// identity: if a later layer makes the picture bigger, the earlier one glides
/// to where it now sits instead of being redrawn. The last layer sizes the
/// stack and the ones before it hang from `align`; a `none` layer is left out,
/// which is how one arrives:
///
/// ```typ
/// layers("pb", meet: bottom + right, the-square, if step >= 3 { the-cone })
/// ```
///
/// `meet` is where the layers meet: the corner the arriving layer does not
/// push — `bottom + right` for a picture that grows up and to the left,
/// `top + left` for one that grows down and to the right, and for growth on two
/// sides at once the corner opposite both. It has to be said, because lining the
/// layers up by the point they share needs that point's *position* in each, and
/// inside an `html.frame` every position reads as zero, alike for two elements
/// 60pt apart (sizes are there: `measure` answers). TEMPORARY (typst#8832,
/// against typst#8828): when that lands the corner can be derived and `meet`
/// becomes optional. Until then, if no corner holds — growth on opposite sides,
/// by different amounts — nothing can hold the layers together: keep the layout
/// still with `reveal` instead.
///
/// A layer that is a drawing keeps its own picture only if the package lays it
/// out the same way each time, so a later layer that must reach into an earlier
/// one draws that one's anchors hidden.
/// -> content
#let layers(
  /// Names the stack; each layer's mark key is this and its place in it.
  /// -> str
  key,
  /// Where the layers meet — the corner the arriving layer does not push.
  /// -> alignment
  meet: none,
  /// The layers, back to front.
  /// -> content | none
  ..parts,
) = {
  let l = parts.pos().enumerate().filter(((i, x)) => x != none)
  if l.len() == 0 { return }
  assert(
    l.len() == 1 or type(meet) == alignment,
    message: "layers(meet:) is where the layers meet — the corner the arriving layer does not push, like bottom + right for a picture that grows up and to the left. It cannot be worked out from the layers themselves. If the picture grows on more than one side there is no such corner: keep the layout still with reveal instead.",
  )
  box({
    for (i, x) in l.slice(0, -1) { place(meet, mark(key + "-" + str(i + 1), x)) }
    let (i, x) = l.last()
    mark(key + "-" + str(i + 1), x)
  })
}

/// Frames that accumulate. `build(a, b, c)` is three frames — `a`, then `a`
/// and `b`, then all three — so what stays on the page is written once and the
/// source reads as what each step adds:
///
/// ```typ
/// slide(title: "Cauchy sequences", ..build(
///   definition,
///   [#v(14pt) #theorem],
///   [#v(14pt) #proof],
/// ))
/// ```
///
/// Content in, content out, so it builds the body of a drawing just as well:
/// `..build(cospan, square, cone).map(diagram)`.
/// -> array
#let build(
  /// The parts, in the order they appear.
  /// -> content
  ..parts,
) = {
  let acc = []
  let out = ()
  for p in parts.pos() {
    acc += p
    out.push(acc)
  }
  out
}

/// One page. On the HTML side a whole-page `html.frame` (hence pixel-identical
/// to the PDF); on the PDF side a page.
///
/// Several bodies are *frames of the same page*: navigation walks them one by
/// one, the overview merges them into one thumbnail with dots for the
/// positions. Frames still transition with View Transitions, so "the second
/// frame has one more line" is an element-level interpolation, not a page
/// jump.
///
/// ```typ
/// #slide(title: "Two frames")[first][first + something added]
/// ```
/// -> content
#let slide(
  /// Shown only in the thumbnail caption, never in the layout. May be content.
  /// -> content | str | none
  title: none,
  /// Speaker notes. HTML only, placed in the page's `<aside class="vit-note">`
  /// (not in the layout, not in the PDF) and read by the desk the deck opens
  /// on and by the speaker view (`s`). May be content: paragraphs, lists,
  /// emphasis all render.
  /// -> content | str | none
  note: none,
  /// Overrides `deck(transition:)` for this page: a name from `transitions`,
  /// the same both ways, or `(enter: name, leave: name)` — `enter` is how this
  /// page comes in when turning to it, `leave` how the page before it goes
  /// out — with settings of its own if it wants them (`duration`, `easing`,
  /// `zoom`, `push`; see `transitions`). Not used between frames of this page; individual elements enter and
  /// leave by `mark(transition:)`. Going back, the page being left decides, so
  /// a transition always replays in reverse. `none` takes the deck's.
  /// -> none | str | dictionary
  transition: none,
  /// The frames of this page. None at all is one blank page.
  /// -> content
  ..frames,
) = {
  let bodies = frames.pos()
  if bodies.len() == 0 { bodies = ([],) }
  let own = _pair(transition)
  let section = (class: "vit-slide")
  _pages.step()
  context {
    let fx = if own == none { _fx.get() } else { own }
    // this page's frames among the document's, and how many steps each has
    let base = _frames.get().first()
    let all = _steps()
    let steps = range(bodies.len()).map(i => all.at(base + i, default: 0))
    // every frame carries the types of the transition into it: the first frame of the
    // page the page's (none: no transition), the others the frame-to-frame one
    let attrs(i) = (
      if i > 0 { section + ("data-transition": _types(_frame)) } else if fx == none { section } else {
        section + ("data-transition": _types(fx))
      }
    ) + ("data-steps": str(steps.at(i)))
    if target() == "html" {
      html.elem(
        "div",
        attrs: (class: "vit-group"),
        {
          // the caption is in the group's flow, above the thumbnail, and is
          // also where the runtime reads the page's title from: the browser
          // flattens whatever content it was given to text
          _cap(_pages.get().first(), title)
          // a transition this page set itself brings the rules its settings need
          if own != none and _sets(own) != "" { html.elem("style", _sets(own)) }
          bodies
            .enumerate()
            .map(((i, body)) => html.elem(
              "section",
              attrs: attrs(i),
              {
                // where this frame begins, for the query above; invisible
                _frames.step()
                [#metadata(none)<vit-frame>]
                html.elem(
                  "div",
                  attrs: (class: "vit-page"),
                  html.frame(block(width: page.width, height: page.height, inset: 60pt, body)),
                )
              },
            ))
            .join()
          // notes are hidden inside the group (CSS display:none); the runtime
          // reads innerHTML
          if note != none { html.elem("aside", attrs: (class: "vit-note"), note) }
          _dots(steps)
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
