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
#import "@local/tween:0.1.0" as _tween

// The player's own markup — everything the reader sees that is not the deck.
#import "chrome/bar.typ": bar as _bar, reach as _reach
#import "chrome/desk.typ": notes as _notes, pane as _pane, rail as _rail
#import "chrome/help.typ": help as _help
#import "chrome/laser.typ": laser as _laser
#import "chrome/settings.typ": settings as _settings
#import "chrome/speaker.typ": speaker as _speaker


#let transitions = ("fade", "slide", "rise", "zoom", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// ── a transition is a pair of effects ────────────────────────────────
/// Every effect is four rules by role and direction — the enter effect names
/// the new side forward and the old side back, the leave effect the other two —
/// which is a lot of selectors to keep straight by hand and no thought at all.
/// So they are written once, here, beside the list of effect names they are
/// for: `transitions` and this are the same vocabulary, and a name in one and
/// not the other cannot happen.

/// `html` carrying the transition types given, in order.
#let _type(..t) = "html" + t.pos().map(x => ":active-view-transition-type(" + x + ")").join()

/// The same role on a one-sided mark rather than on the page: the mark carries
/// the effect as a class, so the type is only the direction.
#let _enter-mark(x) = (
  _type("fwd") + "::view-transition-new(.enter-" + x + ")",
  _type("back") + "::view-transition-old(.enter-" + x + ")",
)
#let _leave-mark(x) = (
  _type("fwd") + "::view-transition-old(.leave-" + x + ")",
  _type("back") + "::view-transition-new(.leave-" + x + ")",
)

/// The side the pair's enter effect governs: the new side forward, the old side back.
#let _page = ("root", "vit-page")

#let _enter-side(x) = (
  _page.map(p => (
    _type("fwd", "enter-" + x) + "::view-transition-new(" + p + ")",
    _type("back", "enter-" + x) + "::view-transition-old(" + p + ")",
  )).flatten()
    + _enter-mark(x)
)

/// The side the pair's leave effect governs: the old side forward, the new side back.
#let _leave-side(x) = (
  _page.map(p => (
    _type("fwd", "leave-" + x) + "::view-transition-old(" + p + ")",
    _type("back", "leave-" + x) + "::view-transition-new(" + p + ")",
  )).flatten()
    + _leave-mark(x)
)

#let _css(sels, ..decls) = sels.join(",\n") + " {\n" + decls.pos().map(d => "  " + d + ";\n").join() + "}\n"

/// Which way each wipe's front travels, as the clip at the far end: the
/// entering side starts there, the leaving side ends there.
#let _wipes = (
  "wipe-left": ("inset(0 0 0 100%)", "inset(0 100% 0 0)"),
  "wipe-right": ("inset(0 100% 0 0)", "inset(0 0 0 100%)"),
  "wipe-up": ("inset(100% 0 0 0)", "inset(0 0 100% 0)"),
  "wipe-down": ("inset(0 0 100% 0)", "inset(100% 0 0 0)"),
)

/// The whole of the effects, as one stylesheet.
#let _effects = (
  /* ── a transition is a pair of effects ────────────────────────────────
  deck/slide/mark(transition: (enter:, leave:)): how the new side comes in,
  how the old side goes out; a string is the same effect both ways. The
  Typst side writes the pair as the transition's types on every frame
  (data-transition=\"enter-slide leave-fade\") and as a one-sided mark's
  view-transition-class (the runtime adds the side the mark has, vit-only-new
  or vit-only-old); the runtime adds fwd or back. Going back replays the pair in reverse: the new side comes in the
  way the old would have gone out, run backwards, and the old side goes out
  the way the new would have come in. So each effect has one rule per role
  — the enter effect's names the new side forward and the old side back,
  the leave effect's the old side forward and the new side back — and the
  value is the same in both directions: where the entering side starts is
  where the leaving side ends.

  Every side runs one animation, vit-enter from where the variables put it
  to rest, vit-leave from rest to where they put it: --vit-opacity,
  --vit-transform, --vit-clip (with --vit-clip-rest, the clip at rest — unset,
  nothing is clipped; a clip at rest would cut the ink overflow the
  snapshots carry, so only the wipes set it), --vit-s-away (the
  magnification away from rest, for the zoom's focus), --vit-timing. A side
  with nothing set holds. A rule that names root sets the variables on
  the root's own image, never on html: the marks' images would inherit
  them. Only an image that exists gets an animation — a one-sided mark's
  new image if it is entering, its old image if it is leaving: WebKit
  styles both images of every named element whether or not they exist, and
  an animation given to one that does not exist is never torn down and
  comes back finished the next time the name is used. */
  ```css
  ::view-transition-new(root),
  ::view-transition-new(vit-page),
  ::view-transition-new(.vit-only-new) {
    animation: vit-enter calc(var(--vit-duration) / var(--vit-speed)) var(--vit-timing, var(--vit-easing)) both;
  }
  ::view-transition-old(root),
  ::view-transition-old(vit-page),
  ::view-transition-old(.vit-only-old) {
    animation: vit-leave calc(var(--vit-duration) / var(--vit-speed)) var(--vit-timing, var(--vit-easing)) both;
  }
  ```.text,

  /* A paired mark morphs: the browser moves its group and cross-fades its two
  images itself — the old fading out under the new fading in, blended with
  plus-lighter, so what stays put never dims (the blending rides on the
  browser's own animation, which an animation of ours would replace). Only
  the pace is ours. */
  ```css
  ::view-transition-old(.vit-mo),
  ::view-transition-new(.vit-mo) {
    animation-timing-function: var(--vit-easing);
  }
  ```.text,

  /* A group interpolates as a box, and each of its two images is drawn into
  that box — stretched to fill it, which is right for a mark that keeps its
  shape and wrong for one that grows on one side: an assembly that gains a
  corner would smear while it grows. fit: "none" draws both images at their
  own size instead, anchored where the transition asks, so what was already
  there stays where it was and only the new part appears. The anchor is the
  corner that does not move. */
  ```css
  ::view-transition-old(.vit-mo),
  ::view-transition-new(.vit-mo),
  ::view-transition-old(.vit-only-old),
  ::view-transition-new(.vit-only-new) {
    object-fit: var(--vit-fit, fill);
    object-position: var(--vit-anchor, 50% 50%);
  }
  ```.text,

  /* opening or closing the overview: the deck fades into the grid while the page zooms */
  ```css
  html:active-view-transition-type(overview)::view-transition-new(root) {
    --vit-opacity: 0;
  }
  ```.text,

  /* fade. For root the old page is held beneath the new one fading in: both
  snapshots are opaque and page-sized, so this is a cross-fade with no dip,
  the same in both directions, and a frame on which both happen to be fully
  visible — the last one, when the animations end a frame before the
  pseudo-elements go — shows the new page, never the old. Paired with
  another entrance the old page fades out for real. */
  _css(_enter-side("fade") + _leave-side("fade"), "--vit-opacity: 0"),
  _css(
    _page.map(p => _type("enter-fade", "leave-fade") + "::view-transition-old(" + p + ")"),
    "--vit-opacity: 1",
  ),

  /* none: at once. The side jumps to its end state on the first frame. */
  _css(_enter-side("none") + _leave-side("none"), "--vit-opacity: 0", "--vit-timing: step-start"),

  /* slide / rise: push, by the width / height of the box. Forward the new one
  comes in from the right / bottom and the old one leaves to the left / top;
  back, the other way round; a transition can set how far with push (a
  negative distance sends them the other way). On a mark they also fade, for
  the reason given where that rule stands. zoom: the new one shrinks into place from
  three times its size, fading in, the old one grows away, fading out, the
  same both ways — and the screen is the focal plane. A side at
  magnification s sits at 1/s of the focal distance, and a lens of aperture
  A images each of its points as a circle of confusion c = A (s − 1) on the
  screen. That is what makes a near thing see-through: a stroke thinner
  than c shades only part of each point's cone of light, so its shadow is
  diluted over the circle, faint in proportion — a speck on the glasses is
  not seen at all. The lens is a quarter of the stage wide, so at three
  times life a point spreads over half the stage and the text is a haze
  that condenses as the side lands; a transition can set zoom to start
  nearer or further. The blur is the Gaussian with the
  disc's RMS radius, σ = c/4, and an image's filter is applied in its own
  pixels, before its transform, hence σ/s. --vit-s is the magnification
  itself, registered so that it interpolates alongside the transform and
  the blur is recomputed from it every frame. */
  _css(_enter-side("slide"), "--vit-transform: translateX(var(--vit-push, 100%))"),
  _css(_leave-side("slide"), "--vit-transform: translateX(calc(-1 * var(--vit-push, 100%)))"),
  _css(_enter-side("rise"), "--vit-transform: translateY(var(--vit-push, 100%))"),
  _css(_leave-side("rise"), "--vit-transform: translateY(calc(-1 * var(--vit-push, 100%)))"),

  /* A page pushed by its own width is off the screen when it gets there, and
  that is the whole of the effect. A mark is pushed by *its* width, so it
  arrives beside where it started, still on the page and still opaque — and
  the image would then simply cease to exist. So on a mark, and only there,
  the push fades. */
  _css(
    ("slide", "rise").map(_enter-mark).flatten() + ("slide", "rise").map(_leave-mark).flatten(),
    "--vit-opacity: 0",
  ),
  _css(
    _enter-side("zoom") + _leave-side("zoom"),
    "--vit-aperture: calc(var(--vit-box, var(--vit-stage)) / 4)",
    "--vit-opacity: 0",
    "--vit-transform: scale(var(--vit-zoom, 3))",
    "--vit-s-away: var(--vit-zoom, 3)",
    "filter: blur(calc(var(--vit-aperture) / 4 * (var(--vit-s) - 1) / var(--vit-s)))",
  ),

  /* wipe-*: reveal, named by the direction the front travels (wipe-up sweeps
  up from the bottom edge): the new one appears from that edge while the old
  one is covered from the same edge, so at every instant the two tile the
  box; back runs the front the other way. */
  _wipes
    .pairs()
    .map(((w, ends)) => (
      _css(_enter-side(w), "--vit-clip: " + ends.first(), "--vit-clip-rest: inset(0)")
        + _css(_leave-side(w), "--vit-clip: " + ends.last(), "--vit-clip-rest: inset(0)")
    ))
    .join(),

  /* Opening/closing the overview is a whole-page zoom: the page interpolates as
  one group, and element-level morphs would tear it apart, so the marks' names
  are overridden first (an author !important beats the inline names hoist.js
  wrote on the elements) and they fold back into root to zoom together. */
  ```css
  html:active-view-transition-type(overview) .vit-mark {
    view-transition-name: none !important;
  }
  @property --vit-s {
    syntax: "<number>";
    inherits: false;
    initial-value: 1;
  }
  @keyframes vit-enter {
    from {
      opacity: var(--vit-opacity, 1);
      transform: var(--vit-transform, none);
      clip-path: var(--vit-clip, none);
      --vit-s: var(--vit-s-away, 1);
    }
    to {
      opacity: 1;
      transform: none;
      clip-path: var(--vit-clip-rest, none);
      --vit-s: 1;
    }
  }
  @keyframes vit-leave {
    from {
      opacity: 1;
      transform: none;
      clip-path: var(--vit-clip-rest, none);
      --vit-s: 1;
    }
    to {
      opacity: var(--vit-opacity, 1);
      transform: var(--vit-transform, none);
      clip-path: var(--vit-clip, none);
      --vit-s: var(--vit-s-away, 1);
    }
  }
  ```.text,
).join()

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
/// `--vit-` variables it reads, so the vocabulary is defined once, where the
/// effects are. `duration` and `easing` govern every effect; `zoom` is how
/// many times life size the zoom starts at, `push` how far slide and rise
/// travel (a negative distance sends them the other way).
/// -> dictionary
#let _knobs = {
  let k = (:)
  for m in (read("deck.css") + _effects).matches(regex("var\(\s*--vit-([a-z0-9-]+)")) {
    k.insert(m.captures.first(), true)
  }
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
    _page.map(p => (
      t("fwd", fwd, ":active-view-transition-type(" + tag + ")") + p + ")",
      t("back", back, ":active-view-transition-type(" + tag + ")") + p + ")",
    )).flatten()
      + (
        t("fwd", fwd, "") + "." + tag + ")",
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

/// The stylesheet as it ships. The prose in these files is for whoever reads
/// them; the browser has no use for it, and every deck would otherwise carry a
/// copy. Comments go on the way out, and the blank lines they leave with them.
/// -> str
#let _strip(
  /// -> str
  css,
) = {
  assert(
    css.matches(regex("\"[^\"\n]*\"")).all(m => not "/*" in m.text),
    message: "a CSS string holds /*, which stripping the comments would cut",
  )
  css.replace(regex("(?s)/\\*.*?\\*/"), "").replace(regex("\n[ \t]*(?:\n[ \t]*)+"), "\n")
}

/// The layout's constants, handed to deck.css as custom properties: it reads
/// them and never guesses at a size or a colour the document chose. One entry
/// here is one `--vit-` property there.
#let _tokens(t) = ":root{" + t.pairs().map(((k, v)) => "--vit-" + k + ":" + v + ";").join() + "}\n"

/// The pointer's own drawing, as a data URL. The viewBox stays 32 units
/// whatever the size, so the runtime can resize the dot by rewriting the width
/// and the height alone; the ink is written once for the same reason — it
/// recolours by substituting that one value, and a second colour in the
/// gradient would be left behind.
#let _laser-url(ink, size) = {
  // Written whole, then the two things that vary are put in — which is exactly
  // what the runtime does to this same string when the presenter picks others.
  let svg = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='SIZE' height='SIZE'%3E%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='16%25' stop-color='%23ffffff'/%3E%3Cstop offset='34%25' stop-color='INK'/%3E%3Cstop offset='56%25' stop-color='INK' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='INK' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='16' fill='url(%23g)'/%3E%3C/svg%3E"
  let filled = svg.replace("SIZE", str(calc.round(size.pt()))).replace("INK", "%23" + ink.to-hex().slice(1, 7))
  "url(\"data:image/svg+xml," + filled + "\")"
}

/// Which frame we are up to: a page needs to find its own frames among the
/// document's.
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
  /// What the laser pointer is when a deck is opened: `ink`, the colour of the
  /// dot and of the tracer behind it, `size`, how wide the dot is, and `trail`,
  /// how long the tracer lasts, in milliseconds (`0` for none). The presenter can change all
  /// three from the settings panel (`,`) and their browser remembers what they
  /// chose — this is only where a deck starts.
  /// -> dictionary
  laser: (ink: rgb("#ff3c3c"), size: 32pt, trail: 400),
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
        _tokens((
          "page": fill.to-hex(),
          "w": str(width.pt()),
          "h": str(height.pt()),
          "duration": str(duration) + "ms",
          "easing": "cubic-bezier(" + easing.map(str).join(", ") + ")",
          "laser-ink": laser.ink.to-hex().slice(0, 7),
          "laser-size": str(calc.round(laser.size.pt())) + "px",
          "laser-hot": str(calc.round(laser.size.pt() / 2)),
          "laser": _laser-url(laser.ink, laser.size),
          "laser-trail": str(laser.trail) + "ms",
        ))
          + _strip(_tween.css)
          + _strip(read("deck.css"))
          + _effects
          + _sets(fx)
          + marks.css,
      )
      _tween.html-target.update(true)
      _pane(html.elem(
        "div",
        attrs: (
          class: "vit-deck",
          "data-duration": str(duration),
          "data-easing": easing.map(str).join(" "),
          "data-theme": if theme == auto { "auto" } else { theme },
          "data-version": str(version),
        ),
        {
          body
          // last, so it is over the pages; a child of the deck, so a press on it
          // is a press on the page
          _reach()
        },
      ))
      // The rail beside the deck, and the notes under it. Both are the deck's
      // to emit: a thumbnail is one page's caption and dots, and only here is
      // every page's known at once.
      _rail(query(<vit-page>).map(m => m.value))
      _notes()
      let href = if pdf == none { none } else if pdf == auto { auto } else { pdf }
      _bar(pdf: href)
      _laser(trail: laser.trail)
      _help(version: version, build: datetime.today().display())
      _settings()
      _speaker(pdf: href)
      html.elem("script", "const vitMarks = " + json.encode(marks.table) + ";")
      // what the drawings declared about themselves, carried back out of the
      // frames they were written in: the deck emits them, and never reads them
      _tween.declarations()
      html.script(read("hoist.js"))
      html.script(_tween.js)
      html.script(read("runtime.js"))
      // the player's own chrome, written against the deck's surface alone
      html.script(read("chrome.js"))
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
  context {
    let fx = if own == none { _fx.get() } else { own }
    // this page's frames among the document's, and how many steps each has
    let base = _frames.get().first()
    let all = _steps()
    let steps = range(bodies.len()).map(i => all.at(base + i, default: 0))
    // every frame carries the types of the transition into it: the first frame of the
    // page the page's (none: no transition), the others the frame-to-frame one
    let attrs(i) = (
      (
        if i > 0 { section + ("data-transition": _types(_frame)) } else if fx == none { section } else {
          section + ("data-transition": _types(fx))
        }
      )
        + ("data-steps": str(steps.at(i)))
    )
    if target() == "html" {
      // the rail is built once, by the deck, out of these: a thumbnail needs
      // the page's caption and how many positions it has, and both are known
      // here and nowhere else
      [#metadata((title: title, steps: steps))<vit-page>]
      html.elem(
        "div",
        attrs: (class: "vit-group"),
        {
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
