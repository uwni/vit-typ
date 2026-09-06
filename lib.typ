/// vtslides — lay out whole pages in Typst, `mark` what should morph, and let
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
/// moving on its own, without keys (`slide(anim:)`). The test is one sentence:
/// did the layout change, or is one object moving? Design trade-offs and
/// browser pitfalls are in the README.

/// Effect names. One is an effect for both sides of a transition; a pair
/// `(enter:, leave:)` names the two sides separately. `"fade"` cross-fades;
/// `"slide"` pushes horizontally (forward, the new page comes in from the
/// right and the old one leaves to the left); `"rise"` pushes vertically (in
/// from the bottom); `"zoom"` scales about the centre (the new one shrinks
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
/// ```
///
/// `effect` names one effect for both sides, `enter` and `leave` the two sides
/// separately; every other key is a setting. `duration` is milliseconds, as in
/// `deck(duration:)`; `easing` is four numbers, as in `deck(easing:)`; the rest
/// are the effects' own knobs — `zoom`, how many times life size the zoom
/// starts at, and `push`, how far slide and rise travel (negative sends them
/// the other way). A setting is a variable deck.css reads, so the stylesheet is
/// the vocabulary for both halves and a typo is a compile error. The Typst side
/// turns each bundle into one CSS rule and names it after what it holds; the
/// name travels as a view transition type on the page's frames and as a
/// `view-transition-class` on a mark. The presenter's speed keys still divide
/// every duration, whoever wrote it.
/// -> array
#let transitions = ("fade", "slide", "rise", "zoom", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// The document's target, as `deck` sets it. `mark` needs to know which
/// backend it is in, but inside `html.frame` `target()` is always `"paged"`
/// (the frame is laid out as paper), so the value has to come in through
/// this state.
/// -> state
#let _target = state("vt-target", "paged")

/// The keys named by this page's `slide(anim:)`. A multi-state `mark` that is
/// played continuously shows its first state in the PDF (the page at rest);
/// one that is not shows its last (the finished figure).
/// -> state
#let _anim = state("vt-anim", ())

/// A transition as the pair it is: how the new side enters, how the old side
/// leaves. A string is the same effect both ways; a dictionary
/// `(enter:, leave:)` names them separately (`in` would be the natural key,
/// but it is a keyword); `none` stays `none` (the caller says what that
/// means). Going back replays the pair in reverse.
/// -> none | dictionary
/// What a transition may set, read out of the stylesheet: the knobs are the
/// `--vt-` variables deck.css reads, so the vocabulary is defined once, where
/// the effects are. `duration` and `easing` govern every effect; `zoom` is how
/// many times life size the zoom starts at, `push` how far slide and rise
/// travel (a negative distance sends them the other way).
/// -> dictionary
#let _knobs = {
  let k = (:)
  for m in read("deck.css").matches(regex("var\(\s*--vt-([a-z-]+)")) { k.insert(m.captures.first(), true) }
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
  if t == str { v } else if t in (int, float) {
    str(v) + if k == "duration" { "ms" }
  } else if t == array {
    _bezier(v)
    "cubic-bezier(" + v.map(str).join(", ") + ")"
  } else if t == color { v.to-hex() } else if t in (ratio, length, angle) { repr(v) } else {
    panic("a transition setting is a number, a string, a colour or the four numbers of a cubic Bézier; " + k + " is a " + str(t))
  }
}

#let _pair(
  /// -> none | str | dictionary
  t,
) = {
  let name(x) = assert(type(x) == str and x in transitions, message: "a transition must be one of " + repr(transitions))
  if t == none { return none }
  if type(t) == str { name(t); return (enter: t, leave: t, vars: (:)) }
  assert(type(t) == dictionary, message: "a transition is a name, or a dictionary naming its effects and settings")
  let named = t.keys().filter(k => k in ("effect", "enter", "leave")).sorted()
  assert(
    named == ("effect",) or named == ("enter", "leave"),
    message: "a transition names its effects as effect: name (the same both ways) or enter: name, leave: name",
  )
  let p = if named == ("effect",) { (enter: t.effect, leave: t.effect) } else { (enter: t.enter, leave: t.leave) }
  name(p.enter)
  name(p.leave)
  let vars = (:)
  for (k, v) in t {
    if k in ("effect", "enter", "leave") { continue }
    assert(
      k in _knobs,
      message: "a transition setting is a variable deck.css reads: " + repr(_knobs.keys().sorted()) + " — not " + repr(k),
    )
    vars.insert(k, _css-value(k, v))
  }
  p + (vars: vars)
}

/// The name a bundle of settings goes by: a view transition type on a page's
/// frames, a `view-transition-class` on a mark. It spells the settings out, so
/// the same settings always name the same rule and the rule can be read in the
/// HTML.
/// -> str
#let _tag(
  /// -> dictionary
  vars,
) = "set-" + vars.pairs().map(((k, v)) => k + "-" + v).join("-").replace(regex("[^A-Za-z0-9-]+"), "-").trim("-", at: end)

/// The rule a bundle of settings becomes: the variables, given once to the
/// whole transition (the type on `html`, inherited by every image of it) and
/// once to a mark that carries the class (its own images, whatever the page
/// does). An effect reads its knobs with `var(--vt-knob, default)`, so
/// providing one here is all it takes.
/// -> str
#let _rule(
  /// -> dictionary
  vars,
) = {
  let tag = _tag(vars)
  (
    "html:active-view-transition-type(" + tag + "),\n"
      + ("::view-transition-group", "::view-transition-old", "::view-transition-new")
        .map(ps => ps + "(." + tag + ")")
        .join(",\n")
      + " {\n"
      + vars.pairs().map(((k, v)) => "  --vt-" + k + ": " + v + ";\n").join()
      + "}\n"
  )
}

/// A pair as the words deck.css keys its rules on: `enter-<effect>
/// leave-<effect>` — the types of a page transition, the classes of a
/// one-sided mark. The runtime adds the direction and nothing else.
/// -> str
#let _types(
  /// -> dictionary
  p,
) = "enter-" + p.enter + " leave-" + p.leave + if p.vars.len() > 0 { " " + _tag(p.vars) }

/// The pair `deck(transition:)` set, for the pages that set none of their own;
/// `none` is no transition between pages.
/// -> state
#let _fx = state("vt-fx", _pair("fade"))

/// Between frames of one page the layout stays put and changes incrementally,
/// so the page cross-fades — what is the same stays, what was added fades in —
/// and elements enter and leave by their own `mark(transition:)`.
/// -> dictionary
#let _frame = _pair("fade")
#let _bezier(e) = assert(
  type(e) == array and e.len() == 4 and e.all(v => type(v) in (int, float)),
  message: "easing must be the four numbers of a cubic Bézier, like (0.32, 0.72, 0, 1)",
)

/// What a continuous animation runs with unless its spec says otherwise:
/// `iterations: none` is without end.
#let anim-defaults = (duration: 1000, delay: 0, iterations: none, direction: "normal", easing: (0, 0, 1, 1))

/// Give a piece of content a name. The same `key` on two adjacent pages makes
/// the browser pair them and interpolate — position, size, colour, rotation.
/// This is a *transition*: the layout changed.
///
/// Several bodies make an *element animation*: N states of the same object.
/// While presenting, `→` moves from one state to the next and `←` back along
/// the same path; the page turns only once the states are exhausted. Between
/// states nothing cross-fades — the object's own geometry moves: the browser
/// (Web Animations) interpolates between the corresponding SVG nodes of two
/// states, the path's `d`, transform, colours, stroke width, opacity. So the
/// states must be *the same drawing under different parameters* — same
/// structure, same number of elements, only the numbers differ; write a
/// function `f(t)` and feed it a few values of t:
///
/// ```typ
/// #mark("wave", ..range(0, 6).map(t => wave(t)))
/// ```
///
/// What has no in-between — text that changes, a path against an arc, states
/// whose element count differs — cross-fades. The PDF has no player and shows
/// the last state (the finished figure, like a handout). In the HTML the other
/// states are stacked on the first state's box (`place`, taking no layout
/// space) and hidden by the runtime as data.
///
/// If the page's `slide(anim:)` names the same `key`, the states become the
/// keyframes of a continuous animation, played over time instead of stepped;
/// the PDF then shows the first state (the page at rest).
///
/// The inner `box` is not decoration: a label attaches to the preceding
/// element, and without the box the thing it would attach to produces no SVG
/// node at all. The layout cost is zero and long text still wraps (measured in
/// the README).
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
  /// in from the right (by its own width), `"zoom"` shrinks into place,
  /// `"none"` appears at once. Unset (`none`) folds the mark into the page:
  /// within a page it cross-fades with the layout, between pages it pushes,
  /// wipes or fades with the whole page. Definition, theorem and proof each
  /// revealed from a different edge is three marks with one value each. One
  /// object has one effect: given on any occurrence of the key, it holds for
  /// all of them, and two occurrences may not disagree. Settings ride along in
  /// the same dictionary (`duration`, `easing`, `zoom`, `push`; see
  /// `transitions`) and apply to this mark alone, whatever pace the page keeps.
  /// -> none | str | dictionary
  transition: none,
  /// One body is a plain mark; several bodies are the states of the object.
  /// -> content
  ..states,
) = {
  let s = states.pos()
  assert(s.len() > 0, message: "mark needs at least one body")
  assert(states.named().len() == 0, message: "mark takes no named argument other than transition")
  assert(type(key) == str and key.match(regex("^[A-Za-z0-9_-]+$")) != none, message: "a mark key is letters, digits, _ and -: " + repr(key))
  let fx = _pair(transition)
  // the label is the identity; the effect goes into the marks table deck() writes (see _marks)
  let lbl = label("vt-" + key)
  let meta = if fx == none { none } else {
    let m = [#metadata((key: key, transition: _types(fx)))<vt-mark>]
    if fx.vars.len() > 0 { m + [#metadata(fx.vars)<vt-set>] } else { m }
  }
  if s.len() == 1 { [#meta#box(s.first())#lbl] } else {
    context if _target.get() == "html" {
      [#meta#box({
        [#box(s.first())#label("vt-" + key + "@0")]
        for (i, x) in s.enumerate().slice(1) {
          place(top + left, [#box(x)#label("vt-" + key + "@" + str(i))])
        }
      })#lbl]
    } else { [#meta#box(if key in _anim.get() { s.first() } else { s.last() })#lbl] }
  }
}

/// What the marks declared about themselves, by key: `(transition:)` for
/// now. Written into the HTML as a table for the runtime, which looks up and
/// never decides. Every occurrence of a key must say the same.
/// -> dictionary
/// Every bundle of settings used in the document, each as one rule: the ones
/// pages and marks left behind as `<vt-set>`, and the deck's own. Written after
/// deck.css, so they are what the effects read.
/// -> str
#let _sets(
  /// -> none | dictionary
  fx,
) = {
  let seen = ()
  for m in (query(<vt-set>).map(m => m.value) + if fx != none { (fx.vars,) } else { () }) {
    if m.len() > 0 and m not in seen { seen.push(m) }
  }
  seen.map(_rule).join()
}

#let _marks() = {
  let t = (:)
  for m in query(<vt-mark>) {
    let v = m.value
    assert(v.key not in t or t.at(v.key).transition == v.transition, message: "mark \"" + v.key + "\" is given two different transitions; one object has one")
    t.insert(v.key, (transition: v.transition))
  }
  t
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
  title: "vtslides",
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
  /// page background, so the same value opens the stylesheet as `--vt-page`
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
      html.elem(
        "style",
        attrs: (id: "vt-style"),
        ":root{--vt-page:" + fill.to-hex() + ";--vt-w:" + str(width.pt()) + ";--vt-h:" + str(height.pt())
          + ";--vt-duration:" + str(duration) + "ms"
          + ";--vt-easing:cubic-bezier(" + easing.map(str).join(", ") + ")}\n"
          + read("deck.css")
          + _sets(fx),
      )
      html.elem(
        "div",
        attrs: (
          class: "vt-deck",
          "data-duration": str(duration),
          "data-easing": easing.map(str).join(" "),
          "data-theme": if theme == auto { "auto" } else { theme },
          "data-pdf": if pdf == auto { "auto" } else if pdf == none { "none" } else { pdf },
        ),
        body,
      )
      html.elem("script", "const vtMarks = " + json.encode(_marks()) + ";")
      html.script(read("hoist.js"))
      html.script(read("paths.js"))
      html.script(read("runtime.js"))
    } else { body }
  }
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
  /// Speaker notes. HTML only, placed in the page's `<aside class="vt-note">`
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
  /// Continuous animation, running while the page rests on this frame.
  /// `key → spec`. The options are `duration` (ms), `delay` (ms),
  /// `iterations` (`none` = without end), `direction` (`"normal"`,
  /// `"reverse"`, `"alternate"`, `"alternate-reverse"`) and `easing` (a cubic
  /// Bézier as in `deck(easing:)`, over each iteration); `anim-defaults`
  /// fills in the rest:
  ///
  /// ```typ
  /// anim: (spin: (keyframes: ((transform: "rotate(0)"), (transform: "rotate(1turn)")), duration: 4000))
  /// ```
  ///
  /// Three sources of keyframes: `keyframes` animates the mark itself
  /// (transform, opacity, …); `(follow: "track", duration: 3000)` runs the
  /// mark's centre along the first path of `mark("track")` on the same frame
  /// (a ball on a track), `orient: true` turns it with the tangent; with
  /// neither, and the `mark` of that `key` carrying several states, those
  /// states are the keyframes — the N poses one piece of code computed, played
  /// continuously (double pendulum, waves). Starts after the page transition,
  /// pauses when the frame is left.
  /// -> dictionary
  anim: (:),
  /// The frames of this page. None at all is one blank page.
  /// -> content
  ..frames,
) = {
  let bodies = frames.pos()
  if bodies.len() == 0 { bodies = ([],) }
  let own = _pair(transition)
  let section = (class: "vt-slide")
  let anim = anim.pairs().map(((k, v)) => (k, anim-defaults + v)).to-dict()
  for (k, v) in anim { _bezier(v.easing) }
  if anim.len() > 0 { section.insert("data-anim", json.encode(anim)) }
  context {
    _anim.update(anim.keys())
    let fx = if own == none { _fx.get() } else { own }
    // every frame carries the types of the transition into it: the first frame of the
    // page the page's (none: no transition), the others the frame-to-frame one
    let attrs(i) = if i > 0 { section + ("data-transition": _types(_frame)) } else if fx == none { section } else { section + ("data-transition": _types(fx)) }
    if target() == "html" {
      html.elem(
        "div",
        attrs: (class: "vt-group"),
        {
          // title and notes are hidden inside the group (CSS display:none); the runtime reads
          // textContent / innerHTML, letting the browser flatten content to text
          if title != none { html.elem("div", attrs: (class: "vt-title"), title) }
          // the settings of a transition this page sets itself: deck() turns every
          // bundle in the document into one rule, named after what it holds
          if fx != none and fx.vars.len() > 0 { [#metadata(fx.vars)<vt-set>] }
          bodies
            .enumerate()
            .map(((i, body)) => html.elem(
              "section",
              attrs: attrs(i),
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
