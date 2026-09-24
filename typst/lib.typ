/// vit: lay out whole pages in Typst, `mark` what should morph, and let the
/// browser do the rest.
///
/// The identity channel is a *name*: the page records what it marked and where
/// the layout put it, and the deck draws each region again in a frame of its
/// own, on an element carrying `data-vit-key`. That element is the boundary,
/// and it is a CSS box, which is what the browser needs to morph it.
///
/// There are three kinds of motion. A *transition* is a change of layout state (page to page,
/// frame to frame) and runs on the View Transitions API. An *element animation*
/// is one object varying with a parameter (`mark` with several states, stepped
/// with `→`) and runs on Web Animations. A *continuous animation* is an object
/// moving on its own, without keys. Both of those are `tween`'s and are
/// imported from it; vit itself handles the first. To tell them apart, ask
/// whether the layout changed or one object is moving. Design trade-offs and
/// browser pitfalls are in the README.

/// Effect names. One is an effect for both sides of a transition; a pair
/// `(enter:, leave:)` names the two sides separately. `"fade"` cross-fades;
/// `"slide"` pushes horizontally (forward, the new page comes in from the
/// right and the old one leaves to the left); `"rise"` pushes vertically (in
/// from the bottom). A page is pushed by the width or height of the screen
/// and is gone when it arrives; a mark is pushed by its own size, so it fades as
/// it travels instead of vanishing beside where it started. `"zoom"` scales
/// about the centre (the new one shrinks
/// into place from three times its size, fading in, the old one grows away,
/// fading out) with the screen as the focal plane: whichever is larger than
/// life is nearer than the focus, and a lens a quarter of the stage wide
/// spreads each of its points over a circle that grows with the
/// magnification, so a stroke thinner than the circle casts only a diluted
/// shadow, and text arrives as a haze that condenses as it lands.
/// `"wipe-left"` / `"wipe-right"` / `"wipe-up"` / `"wipe-down"`
/// reveal, named by the direction the front travels (`wipe-up`
/// sweeps up from the bottom edge: the new page appears, the old one is
/// covered); `"none"` switches at once. Going back always replays in reverse.
///
/// Wherever a transition is given (`deck`, `slide`, `mark`), the dictionary
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
/// beside the effects belong to the whole transition: both sides and, on a
/// paired mark, the group that carries it across. Settings inside a side belong
/// to that side alone and beat the shared ones, because they land on that
/// image. Going back the two sides swap images, so the side that comes in
/// always runs the enter side's settings. `duration` is milliseconds, as in
/// `deck(duration:)`; `easing` is four numbers, as in `deck(easing:)`; the rest
/// are the effects' own knobs: `zoom`, how many times life size the zoom
/// starts at, and `push`, how far slide and rise travel (negative sends them
/// the other way).
///
/// `fit` and `anchor` are for a mark that is a whole assembly. A group
/// interpolates as a box, and each of its two images is drawn into that box,
/// stretched to fill it: right for something that keeps its shape, wrong for
/// something that grows on one side, which smears while the box grows.
/// `fit: "none"` draws both images at their own size instead, and `anchor`
/// (a Typst alignment, or the CSS pair) is the corner they are pinned to, the
/// corner that does not move. That way a diagram keeps what it already had
/// where it had it, while the rest arrives around it.
///
/// A setting is a variable deck.css reads, so the stylesheet defines the names
/// for both halves and a typo is a compile error. The Typst side
/// turns each bundle into one CSS rule and names it after what it holds; the
/// name travels as a view transition type on the page's frames and as a
/// `view-transition-class` on a mark. The presenter's speed keys still divide
/// every duration, whoever wrote it.
/// -> array
// Once tween is published, replace the next line with #import "@preview/tween:0.1.0" as _tween
#import "@local/tween:0.1.0" as _tween

// The player's own markup: everything the reader sees that is not the deck.
#import "chrome/bar.typ": bar as _bar, reach as _reach
#import "chrome/desk.typ": grip as _grip, notes as _notes, pane as _pane, rail as _rail
#import "chrome/help.typ": help as _help
#import "chrome/laser.typ": laser as _laser
#import "chrome/settings.typ": settings as _settings
#import "chrome/speaker.typ": speaker as _speaker


#let transitions = ("fade", "slide", "rise", "zoom", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// ── a transition is a pair of effects ────────────────────────────────
/// Every effect is four rules by role and direction: the enter effect names
/// the new side forward and the old side back, the leave effect the other two.
/// That is a lot of selectors to keep straight by hand, so they are generated
/// here, next to the list of effect names, and a name cannot be in one and
/// missing from the other.

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
  (the enter effect's names the new side forward and the old side back,
  the leave effect's the old side forward and the new side back), and the
  value is the same in both directions: where the entering side starts is
  where the leaving side ends.

  Every side runs one animation, vit-enter from where the variables put it
  to rest, vit-leave from rest to where they put it: --vit-opacity,
  --vit-transform, --vit-clip (with --vit-clip-rest, the clip at rest; when
  unset, nothing is clipped; a clip at rest would cut the ink overflow the
  snapshots carry, so only the wipes set it), --vit-s-away (the
  magnification away from rest, for the zoom's focus), --vit-timing. A side
  with nothing set holds. A rule that names root sets the variables on
  the root's own image, never on html: the marks' images would inherit
  them. Only an image that exists gets an animation: a one-sided mark's
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
  images itself (the old fading out under the new fading in), blended with
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
  that box, stretched to fill it. That is right for a mark that keeps its
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
  visible (the last one, when the animations end a frame before the
  pseudo-elements go) shows the new page, never the old. Paired with
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
  same both ways, with the screen as the focal plane. A side at
  magnification s sits at 1/s of the focal distance, and a lens of aperture
  A images each of its points as a circle of confusion c = A (s − 1) on the
  screen. That is what makes a near thing see-through: a stroke thinner
  than c shades only part of each point's cone of light, so its shadow is
  diluted over the circle, faint in proportion, the way a speck on your
  glasses is not seen at all. The lens is a quarter of the stage wide, so at three
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
  that completes the effect. A mark is pushed by *its* width, so it
  arrives beside where it started, still on the page and still opaque, and
  then the image would suddenly disappear. So on a mark, and only there,
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
  are overridden first (an author !important beats the inline names the runtime
  wrote on the regions) and they fold back into root to zoom together. */
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

/// Which frame is being laid out, counted as the document goes. A mark records
/// it so the frame that follows knows which marks are its own.
/// -> counter
#let _frames = counter("vit-frames")

/// How deep inside content that has not arrived yet this is. `reveal` hides
/// what is still to come, and hidden content keeps its place in the layout but
/// leaves no ink, so a mark in it has a position and nothing to draw. It says
/// so here, because Typst cannot be asked whether something is hidden.
/// -> state
#let _hidden = state("vit-hidden", 0)

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
  for m in (read("web/deck.css") + _effects).matches(regex("var\(\s*--vit-([a-z0-9-]+)")) {
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
      message: "unknown transition setting "
        + repr(k)
        + "; the settings are the variables deck.css reads: "
        + repr(_knobs.keys().sorted()),
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
/// it is that side's, and lands where deck.css puts that side's effect (the
/// enter side is the new image forward and the old image back, the leave side
/// the other two), so a side's own settings beat the transition's, being on
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
/// leave-<effect>`, then the name of each bundle of settings it carries. These
/// are the types of a page transition, or the classes of a one-sided mark. The runtime
/// adds the direction and nothing else.
/// -> str
#let _types(
  /// -> dictionary
  p,
) = (
  "enter-" + p.enter.effect + " leave-" + p.leave.effect + _bundles(p).map(b => " " + _tag(b.role, b.vars)).join()
)

/// The layout a deck is cut to: the size of a page and the margin its contents
/// are held off the edge by. An HTML export has no pages (a page set rule there
/// is ignored, and the compiler warns about it), so this is not read off `page`: the
/// document tells `player` what its layout is, and `slide` reads it back here.
/// `deck` sets its own page from the same numbers, for the PDF.
/// -> state
#let _layout = state("vit-layout", none)

/// The pair `deck(transition:)` set, for the pages that set none of their own;
/// `none` is no transition between pages.
/// -> state
#let _fx = state("vit-fx", _pair("fade"))

/// Between frames of one page the layout stays put and changes incrementally,
/// so the page cross-fades (what is the same stays, what was added fades in),
/// and elements enter and leave by their own `mark(transition:)`.
/// -> dictionary
#let _frame = _pair("fade")

/// Give a piece of content a name: this is one object, and the same `key` on
/// two adjacent pages is the same object, which the browser pairs and
/// interpolates: position, size, colour, rotation. This is a *transition*:
/// the layout changed. A mark only gives identity between pages. Motion
/// *inside* it (N states of one drawing, or the drawing playing them over time)
/// belongs to `tween`, needs no mark, and is written where the drawing is.
///
/// *In a formula*, pass the term as an equation,
/// `$ #mark("sq")($x^2$) + #mark("lin")($b x$) = c $`, not as bare math: a
/// mark boxes what it is given, and a box lays its content out as markup,
/// which would set `b x` upright in the body font. An equation inside an
/// equation is transparent, so the term is typeset exactly as it would be
/// unmarked, and the operators around it keep their spacing. What is left
/// unmarked is the page's: `+` and `=` cross-fade with it, which is invisible
/// where they stay put and a double image where they move.
///
/// What has no in-between (text that changes, a path against an arc, states
/// whose element count differs) cross-fades. The PDF has no player and shows
/// the last state (the finished figure, like a handout). In the HTML the other
/// states are stacked on the first state's box (`place`, taking no layout
/// space) and hidden by the runtime as data.
///
/// With `tween(play:)` the same states are played over time instead of
/// stepped; the drawing says so itself and the deck only carries the word.
///
/// The inner `box` is required: what says where the region is and how big it is
/// is a pair of points placed in its two corners, and only something with
/// corners can hold them. Of everything that can stand in a paragraph that is
/// `box` and `block`; which of the two is `block:` below. Between them, `block`
/// is out as the default: it is block-level, and a mark has to work on a word
/// inside a sentence and on a term inside a formula; it is also breakable, and
/// a mark split over two lines has no single box to interpolate.
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
  /// both ways, or `(enter: name, leave: name)`, where `enter` is how it appears
  /// and `leave` how it disappears (going back replays either in reverse). It applies
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
  /// identity. The group carries what is left once they are lifted out, which
  /// is how the first change's result takes part in the next one as
  /// a whole (see `fit` and `anchor` in `transitions`). Settings ride along in
  /// the same dictionary (`duration`, `easing`, `zoom`, `push`; see
  /// `transitions`) and apply to this mark alone, whatever pace the page keeps.
  /// -> none | str | dictionary
  transition: none,
  /// Which stack of layers this is one of, as `layers` says: `(key, index)`.
  /// The deck aligns a stack by the point its layers share, and everything
  /// drawn inside a layer moves with it.
  /// -> none | array
  stack: none,
  /// How the identity is held: in a box, or in a block.
  ///
  /// A box by default, and that is what lets a mark sit inside a sentence or a
  /// formula. But a box is only as tall as the glyphs in it, where a line is as
  /// tall as the line. So content that *is* a block in its own right (a title
  /// in a header band, a figure, a column) measures differently boxed than it
  /// did unmarked, and anything that lays it out by measuring it (fitting it to
  /// a width, centring it on the horizon) moves. Marking such content with
  /// `block: true` holds the identity in an unbreakable block instead, which
  /// measures exactly as the content did, and the layout does not notice the
  /// mark at all. It is block-level, so it is wrong inside a sentence, which is
  /// why it is not the default.
  /// -> bool
  block: false,
  /// What the object is. Several states of one drawing are `tween`'s, not a
  /// mark's: `mark(key, tween(s0, s1, …))`. To hide a mark, `veil` rather than
  /// `hide`: the deck draws every region itself, and a bare `hide` leaves it
  /// drawing one the page meant to drop.
  /// -> content
  body,
) = {
  assert(
    type(key) == str and key.match(regex("^[A-Za-z0-9_-]+$")) != none,
    message: "a mark key is letters, digits, _ and -: " + repr(key),
  )
  let fx = _pair(transition)
  // `block` is the argument here, so the element has to be named through `std`
  let hold = if block { std.block.with(breakable: false) } else { std.box }
  context {
    if _target.get() != "html" {
      // On paper the deck places nothing, so a stack is aligned where it is
      // laid out and these say where that is. Neither draws.
      hold({
        place(top + left, [#metadata((key: key, stack: stack))<vit-mark>])
        body
        place(bottom + right, [#metadata(none)<vit-mark-end>])
      })
    } else {
      // The page keeps the space and loses the ink: hidden content is laid out
      // and exported empty, so the region is drawn once, in the frame the deck
      // places for it. What says where that frame goes is this record, placed
      // in the holder's own top left corner: in a paragraph a position is a
      // point on the baseline, and the corner is what a box is placed by.
      let record = place(top + left, [#metadata((
        key: key,
        stack: stack,
        shown: _hidden.get() == 0,
        transition: if fx == none { none } else { _types(fx) },
        sets: if fx == none { () } else { _bundles(fx) },
        // Five text fields, put back around the body when it is laid out again
        // on its own, where nothing the page set is in scope. Only these five:
        // Typst cannot be asked for a show rule or a `set par`, so anything
        // else the region needs has to be written inside it.
        style: (size: text.size, fill: text.fill, font: text.font, weight: text.weight, style: text.style),
        body: body,
      ))<vit-mark>])
      // and the far corner, so the frame is laid out in the box the page gave
      // it: content written to fill its container (`width: 100%`) has nothing
      // to fill when it is drawn on its own
      let ending = place(bottom + right, [#metadata(none)<vit-mark-end>])
      _tween.quiet.update(true)
      // the far corner goes after the body, so that what the body records sits
      // between the two and the deck can see what is nested in what
      hide(hold({ record; body; ending }))
      _tween.quiet.update(false)
    }
  }
}

/// `hide`, for content with marks in it. Hidden content keeps its place in the
/// layout and leaves no ink, so a mark inside it has a position and nothing to
/// draw, and the deck must not give it a frame of its own. Typst cannot be
/// asked whether something is hidden, so this says so as it hides. A bare
/// `hide` around a mark leaves the page empty and the deck drawing the region
/// anyway, which is the one way the HTML and the PDF can disagree.
/// -> content
#let veil(
  /// -> content
  body,
) = {
  _hidden.update(h => h + 1)
  hide(body)
  _hidden.update(h => h - 1)
}

/// A named point, for `layers` to align a stack by. The body keeps its place in
/// the layout and leaves no ink, and the corner it starts at is what the name
/// stands for, so the point may be anywhere in the picture rather than at a
/// corner of it or in the middle.
///
/// A stack of layers is one drawing at several stages, and the later stage is
/// usually drawn with the earlier one's parts still in it, hidden, so that both
/// are laid out alike. Naming one of those parts in both layers is what lets
/// the deck put them together: the layers meet at that point, and everything
/// else follows from the layout.
///
/// ```typ
/// layers("pb", diagram-a, anchor-in-b-drawn-hidden)
/// ```
///
/// A `mark` is a named point too, at the corner its box starts at, so two
/// layers that already share a marked object need nothing else.
/// -> content
#let anchor(
  /// The name. The same name in two layers is the point they share.
  /// -> str
  key,
  /// What holds the place: usually the part the later layer redraws.
  /// -> content
  body,
) = veil(std.box({
  place(top + left, [#metadata((key: key))<vit-anchor>])
  body
}))

/// A stylesheet that arrives as it was written, with its prose in it: the
/// browser has no use for that, and every deck would otherwise carry a copy.
/// Comments go on the way out, and the blank lines they leave with them.
///
/// vit's own stylesheet does not come through here: the build minifies it, and
/// stripping what esbuild already stripped is work for nobody. This is for CSS
/// that comes from a package rather than from the build, which is `tween`'s.
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
/// and the height alone. The ink is written once for the same reason: it
/// recolours by substituting that one value, and a second colour in the
/// gradient would be left behind.
#let _laser-url(ink, size) = {
  // Written whole, then the two things that vary are put in, exactly as the
  // runtime does to this same string when the presenter picks others.
  let svg = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='SIZE' height='SIZE'%3E%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='16%25' stop-color='%23ffffff'/%3E%3Cstop offset='34%25' stop-color='INK'/%3E%3Cstop offset='56%25' stop-color='INK' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='INK' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='16' fill='url(%23g)'/%3E%3C/svg%3E"
  let filled = svg.replace("SIZE", str(calc.round(size.pt()))).replace("INK", "%23" + ink.to-hex().slice(1, 7))
  "url(\"data:image/svg+xml," + filled + "\")"
}

/// How many steps every frame of the document has, in document order. A step
/// is one press: the drawings on a frame step together, so the frame's count
/// is the longest of them; a drawing that plays itself is not stepped, and one
/// inside another's states is a node, not a drawing. Said out here because a
/// frame's insides are an `html.frame`, which nothing but a label leaves.
#let _steps() = {
  let out = ()
  for m in query(selector.or(<vit-frame>, <tween-steps>)) {
    if m.label == <vit-frame> {
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
    // a mark that declared no transition says nothing about the key: it is the
    // occurrences that did which have to agree
    if v.transition == none { continue }
    assert(
      v.key not in t or t.at(v.key).transition == v.transition,
      message: "mark \"" + v.key + "\" is given two different transitions; one object has one",
    )
    t.insert(v.key, (transition: v.transition))
    for b in v.sets { if b not in sets { sets.push(b) } }
  }
  (table: t, css: sets.map(b => _rule(b.role, b.vars)).join(""))
}

/// How far each layer of each stack on this frame has to move so that the point
/// it shares with the last layer lands in the same place.
///
/// What this works from is a point's offset *within* its layer, which does not
/// change when the layer is placed somewhere else, so it settles rather than
/// chasing itself. A point is a `mark` or an `anchor`, so it may be anywhere in
/// the picture. Which frame a record belongs to is where it falls between the
/// frames' own markers, not something it read: a marked region is laid out a
/// second time when it is drawn, and a counter read in there answers with what
/// the previous pass knew, so the document would never settle. Regions being
/// drawn again say so with `vit-drawn`, and what they record is skipped: it is
/// the page's layout that is being read.
/// -> dictionary
#let _offsets(
  /// -> int
  me,
) = {
  let open = ()
  let corners = ()
  let points = ()
  let f = 0
  let redrawn = 0
  for m in query(selector.or(<vit-frame>, <vit-mark>, <vit-mark-end>, <vit-anchor>, <vit-drawn>, <vit-drawn-end>)) {
    if m.label == <vit-drawn> {
      redrawn += 1
    } else if m.label == <vit-drawn-end> {
      redrawn -= 1
    } else if redrawn > 0 {
      // a region drawn again in a frame of its own: the page said this already
    } else if m.label == <vit-frame> {
      f += 1
    } else if m.label == <vit-mark> {
      let v = m.value
      let at = m.location().position()
      let inside = if open.len() > 0 { open.last().layer } else { none }
      let layer = inside
      if f == me and v.stack != none {
        // A layer is moved by one offset, the innermost one it is in, so a
        // stack inside a layer would keep the outer stack's shift and lose the
        // inner one. On paper each layer is placed relative to the last, which
        // nests by itself, so the two backends would quietly disagree.
        // an assert's message is worked out whether or not it fires
        let outer = if inside == none { "" } else { inside.first() }
        assert(
          inside == none,
          message: "layers(\"" + v.stack.first() + "\") is drawn inside a layer of layers(\""
            + outer + "\"): stacks do not nest. Draw the picture flat.",
        )
        corners.push((v.stack.first(), v.stack.last(), at))
        layer = (v.stack.first(), v.stack.last())
      } else if f == me and inside != none {
        points.push((inside.first(), inside.last(), v.key, at))
      }
      open.push((layer: layer))
    } else if m.label == <vit-mark-end> {
      if open.len() > 0 { let _ = open.pop() }
    } else if m.label == <vit-anchor> and f == me {
      let inside = if open.len() > 0 { open.last().layer } else { none }
      // Outside a layer a name stands for nothing, and saying so here is what
      // stops the failure surfacing later as `layers` reporting that its layers
      // share no point.
      assert(
        inside != none,
        message: "anchor(\"" + m.value.key
          + "\") is not inside a layer: a named point is what layers(…) hangs its layers from, so it means something only when it is drawn in one.",
      )
      points.push((inside.first(), inside.last(), m.value.key, m.location().position()))
    }
  }
  let out = (:)
  for (sk, i, at) in corners {
    let last = corners.filter(((s, _, _)) => s == sk).map(((_, j, _)) => j).sorted().last()
    if i == last { continue }
    let here = points.filter(((s, j, _, _)) => s == sk and j == i)
    let there = points.filter(((s, j, _, _)) => s == sk and j == last)
    let last-at = corners.filter(((s, j, _)) => s == sk and j == last).first().last()
    let shared = here.filter(((_, _, n, _)) => there.any(((_, _, o, _)) => o == n))
    assert(
      shared.len() > 0,
      message: "layers(\""
        + sk
        + "\"): layer "
        + str(i + 1)
        + " and the last layer share no named point, so where they meet cannot be worked out. Name a part that is in both with anchor(\"…\"), or mark the same object in both. The point may be anywhere in the picture.",
    )
    let n = shared.first().at(2)
    let a = there.filter(((_, _, o, _)) => o == n).first().last()
    let b = shared.first().last()
    out.insert(sk + "/" + str(i), (x: (a.x - last-at.x) - (b.x - at.x), y: (a.y - last-at.y) - (b.y - at.y)))
  }
  out
}

/// The marks of the frame just laid out, each drawn again in a frame of its own
/// and placed where the page put it. View Transitions ignore a
/// `view-transition-name` on an SVG child and Web Animations keyframes are CSS,
/// so a region that has to morph has to be a CSS box; a frame of its own is one.
/// The page kept the space and lost the ink, so nothing is drawn twice.
///
/// The frame carries its own size in `em`, and the deck sets one font size on
/// the host, so the drawing scales with the stage and its proportions are the
/// frame's own rather than a box this has to get right.
/// -> content
#let _hosts(
  /// -> dictionary
  geo,
) = context {
  let me = _frames.get().first()
  let pct(a, b) = str(a / b * 100) + "%"

  /// One walk over what the frames recorded: which region belongs to which
  /// frame, what is nested in what, and where every named point landed. A
  /// region's corner is where the page put it; a stack's layers are moved from
  /// there onto the point they share.
  let mine = ()
  let open = ()
  let f = 0
  let redrawn = 0
  for m in query(selector.or(<vit-frame>, <vit-mark>, <vit-mark-end>, <vit-anchor>, <waapi-decl>, <vit-drawn>, <vit-drawn-end>)) {
    if m.label == <vit-drawn> {
      redrawn += 1
      continue
    } else if m.label == <vit-drawn-end> {
      redrawn -= 1
      continue
    } else if redrawn > 0 {
      // a region being drawn in its own frame: it has already said everything
      continue
    }
    if m.label == <vit-frame> {
      f += 1
    } else if m.label == <vit-mark> {
      let v = m.value
      let at = m.location().position()
      let inside = if open.len() > 0 { open.last().layer } else { none }
      // a layer of a stack carries everything drawn inside it
      let layer = if f == me and v.stack != none {
        (v.stack.first(), v.stack.last())
      } else { inside }
      open.push((v: v, at: at, layer: layer, f: f))
    } else if m.label == <vit-mark-end> {
      let o = open.pop()
      if o.f == me and o.v.shown {
        let to = m.location().position()
        mine.push((
          kind: "mark",
          v: o.v,
          at: o.at,
          size: (width: to.x - o.at.x, height: to.y - o.at.y),
          layer: o.layer,
        ))
      }
    } else if m.label == <waapi-decl> and f == me and m.value.placed {
      mine.push((
        kind: "decl",
        v: m.value,
        at: none,
        size: none,
        layer: if open.len() > 0 { open.last().layer } else { none },
      ))
    }
  }

  let shift = _offsets(me)
  let moved(p, layer) = {
    if layer == none { return p }
    let d = shift.at(layer.first() + "/" + str(layer.last()), default: none)
    if d == none { p } else { (x: p.x + d.x, y: p.y + d.y) }
  }

  /// The drawing again, on its own, at the size the frame says: 1pt of text is
  /// 1em, so the frame states the page's own units and the stylesheet's one
  /// font size is the whole of the scaling.
  let drawn(body, style, size) = {
    // What a region records, it recorded when the page was laid out. Drawing it
    // again says it all a second time, and a state cannot stop that: a state
    // read inside this frame answers with what the *previous* pass knew, so it
    // would lag by one and never settle. These two say where the second telling
    // begins and ends, and the walk above skips what lies between them.
    [#metadata(none)<vit-drawn>]
    set text(size: 1pt)
    html.frame({
      // the styles the region was written under, put back around it: a set rule
      // reaches the rest of its own block, so this one has to stand beside the
      // body rather than inside an if of its own
      set text(..(if style == none { (:) } else { style }))
      if size == none { std.box(body) } else { std.block(width: size.width, height: size.height, body) }
    })
    [#metadata(none)<vit-drawn-end>]
  }
  for h in mine {
    let v = h.v
    let p = if h.kind == "mark" { moved(h.at, h.layer) } else {
      moved(query(label(v.tag + "@" + str(v.k))).first().location().position(), h.layer)
    }
    let where = "left:" + pct(p.x, geo.width) + ";top:" + pct(p.y, geo.height)
    // where the region sits on the page, for the rail: a thumbnail draws the
    // page and everything placed over it into one picture, and how big each is
    // the frame inside says in its own attributes
    let at = (p.x, p.y).map(l => str(l.pt())).join(" ")
    if h.kind == "mark" {
      html.elem(
        "div",
        attrs: (class: "vit-mark", "data-vit-key": v.key, "data-vit-at": at, style: where),
        drawn(v.body, v.style, h.size),
      )
    } else {
      // the declaration's own element, around the frame placed for it: it is
      // the box the keyframes move, and it starts itself
      html.elem(
        v.tag,
        attrs: (
          class: "vit-mark",
          "data-spec": json.encode(v.spec, pretty: false),
          "data-vit-at": at,
          style: where,
        ),
        drawn(v.body, v.style, none),
      )
    }
  }
}

/// The player: the stylesheet, the runtime and the chrome (the toolbar, the
/// overview, the speaker view, the laser) around pages that are already laid
/// out. This is all of vit's side of a deck. What a page is made of,
/// how big it is and what colour it sits on are the document's, and the player
/// reads them off the page it is on rather than being told twice.
///
/// `deck` is a document that is nothing but a vit deck: it sets the page, the
/// text and the title, and then calls this. A package that already is the
/// document (one that lays out its own pages, with its own margins, header and
/// footer) sets its page as it always did and calls this directly. Either way
/// there is one page, set once, and `slide` cuts its frames to it.
/// -> content
#let player(
  /// Layout width, the size of a page. The PDF's page is this wide and so is
  /// every frame's `html.frame`, and the player's aspect ratio follows.
  /// -> length
  width: 1280pt,
  /// Layout height.
  /// -> length
  height: 720pt,
  /// How far the layout is held off the edge of a page. `slide` reads it back as
  /// the inset of every frame, so a document that composes its own margins
  /// inside the pages it hands over sets `0pt` here and is framed exactly.
  /// -> length | dictionary
  margin: 60pt,
  /// Layout background. `html.frame` carries no page background, so this opens
  /// the stylesheet as `--vit-page` and is painted under the slides and the
  /// thumbnails; on the PDF side `deck` gives the same value to `page(fill:)`,
  /// so the two sides match.
  /// -> color
  fill: rgb("#111318"),
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
  /// The default *page-to-page* transition: how unmarked content enters and
  /// leaves when turning to another page: a name from `transitions`, the same
  /// both ways, or `(enter: name, leave: name)`, with `enter` for the page being
  /// entered `leave` for the page being left. Paired marks morph regardless;
  /// one-sided marks without an effect of their own fold into the page. The
  /// effect `"none"` switches that side at once while the transition runs (so
  /// marks still morph); `none` runs no transition between pages at all. Not
  /// used between frames of one page: there the layout stays put and only
  /// changes incrementally, so root cross-fades and elements enter and leave
  /// by `mark(transition:)`. A single page can override it with
  /// `slide(transition:)`. The dictionary may carry settings for this
  /// transition as well (`duration`, `easing`, `zoom`, `push`); see
  /// `transitions`.
  /// -> none | str | dictionary
  transition: "fade",
  /// Light/dark theme of the player chrome (toolbar, overview, speaker view).
  /// `auto` follows the system, `"dark"` / `"light"` fix it. Chrome only; the
  /// layout's colours are Typst's.
  /// -> auto | str
  theme: auto,
  /// What the laser pointer is when a deck is opened: `ink`, the colour of the
  /// dot and of the tracer behind it, `size`, how wide the dot is, and `trail`,
  /// how long the tracer lasts, in milliseconds (`0` for none). The presenter can change all
  /// three from the settings panel (`,`) and their browser remembers what they
  /// chose. This only sets where a deck starts.
  /// -> dictionary
  laser: (ink: rgb("#ff3c3c"), size: 32pt, trail: 400),
  /// The pages.
  /// -> content
  body,
) = {
  let fx = _pair(transition)
  _bezier(easing)
  assert(theme in (auto, "dark", "light"), message: "theme must be auto, \"dark\" or \"light\"")
  context {
    _fx.update(fx)
    _target.update(target())
    _layout.update((width: width, height: height, margin: margin))
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
          + read("web/deck.css")
          + _effects
          + _sets(fx)
          + marks.css,
      )
      _tween.html-target.update(true)
      _tween.placing.update(true)
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
          // Every region is placed by where the layout put it, which is a
          // position read inside an `html.frame`. A compiler without typst#8832
          // answers zero to all of them and says nothing, and the deck comes out
          // stacked in the corner. The page's own two corners are a distance
          // this knows is not zero, so ask them once.
          context {
            let p = query(<vit-probe>)
            assert(
              p.len() < 2 or p.at(1).location().position().x > p.at(0).location().position().x,
              message: "this typst does not resolve a position inside html.frame (typst#8832), so every marked region would be placed in the top left corner. Build typst from main, or use the first release that carries the fix.",
            )
          }
          // last, so it is over the pages; a child of the deck, so a press on it
          // is a press on the page
          _reach()
        },
      ))
      // The rail beside the deck, and the notes under it. Both are the deck's
      // to emit: a thumbnail is one page's caption and dots, and only here is
      // every page's known at once.
      _rail(query(<vit-page>).map(m => m.value))
      _grip("rail")
      _grip("notes")
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
      // the paths are the package's: build.mjs (`npm run build`) puts web/
      // minified beside this file in dist/<version>/, and this file compiles
      // only from there
      html.script(_tween.js)
      html.script(read("web/runtime.min.js"))
      // the player's own chrome, written against the deck's surface alone
      html.script(id: "vit-chrome", read("web/chrome.min.js"))
    } else { body }
  }
}

/// A document that is a deck: the page it is laid out on, the text it is set
/// in, the title it goes by, and then the player around it. One compile gives
/// the PDF, one with `--features html` the HTML; side by side under one name,
/// the toolbar's download link finds the PDF.
///
/// `#show: deck.with(title: "…")`. Everything the player takes may be named
/// here too and is passed straight on. The arguments only `deck` takes are the
/// ones that make it a document rather than a player.
/// -> content
#let deck(
  /// Document title.
  /// -> str
  title: "vit",
  /// Layout width. The page's size on the PDF side, and the player's layout on
  /// the HTML side: one figure, given once, and both sides take it from here.
  /// -> length
  width: 1280pt,
  /// Layout height.
  /// -> length
  height: 720pt,
  /// How far the layout is held off the edge of the page: the PDF's page margin
  /// and every frame's inset alike, from this one figure.
  /// -> length | dictionary
  margin: 60pt,
  /// Layout background: `page(fill:)` on the PDF side, and the ground the
  /// stylesheet paints under the slides and thumbnails on the HTML side:
  /// identical on both, and independent of the chrome theme.
  /// -> color
  fill: rgb("#111318"),
  /// Font stack, glyph-by-glyph fallback in order. The default carries a CJK
  /// family for a reason: with a Latin family alone, CJK text falls back glyph
  /// by glyph to whatever system family has the glyph, and weights differ
  /// within one line.
  /// -> array
  font: ("DejaVu Sans", "Noto Sans CJK SC"),
  /// The player's settings, handed on untouched.
  /// -> arguments
  ..rest,
  /// The pages.
  /// -> content
  body,
) = {
  assert(rest.pos().len() == 0, message: "deck takes the pages as its body, not as positional arguments")
  set document(title: title)
  set text(size: 26pt, fill: rgb("#d5d9e2"), font: font)
  context {
    // The page is the paged target's alone: an HTML export has none, ignores the
    // rule and says so, and the player is told the same numbers either way.
    set page(width: width, height: height, margin: margin, fill: fill) if target() != "html"
    player(width: width, height: height, margin: margin, fill: fill, ..rest.named(), body)
  }
}

/// Frames from one description, written once. `reveal(3, (step, at) => …)`
/// renders the body once per frame (`step` is which frame it is, 1 to n), and
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
/// identically. That is what lets the marks morph instead of the page
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
  if i >= k { x } else if type(x) == content { veil(x) } else { none }
}))

/// Layers of one picture, hung from a point they share. Each layer is a mark of
/// its own (`key-1`, `key-2`, …), so a layer that is on two frames keeps its
/// identity: if a later layer makes the picture bigger, the earlier one glides
/// to where it now sits instead of being redrawn. The last layer sizes the
/// stack and the ones before it move onto the shared point; a `none` layer is
/// left out, which is how one arrives:
///
/// ```typ
/// layers("pb", the-square, if step >= 3 { the-cone })
/// ```
///
/// What holds the layers together is a point named in both: `anchor("…")`
/// around a part that both draw, or the same `mark` in both. The point may be
/// anywhere in the picture rather than at a corner of it or in the middle,
/// because what this works from is the point's offset *inside* its own layer,
/// which the layout knows wherever it sits. A layer that shares no point with
/// the last one says so at compile time, and names what to do about it.
///
/// A layer that is a drawing keeps its own picture only if the package lays it
/// out the same way each time, so a later layer that must reach into an earlier
/// one draws that one's anchors hidden.
/// -> content
#let layers(
  /// Names the stack; each layer's mark key is this and its place in it.
  /// -> str
  key,
  /// The layers, back to front.
  /// -> content | none
  ..parts,
) = {
  let l = parts.pos().enumerate().filter(((i, x)) => x != none)
  if l.len() == 0 { return }
  let name(i) = key + "-" + str(i + 1)
  let (li, lx) = l.last()
  // The last layer sizes the stack and the ones before it hang from the point
  // they share with it. Where that is, is a matter of where the layout put
  // things, which is the deck's to work out once everything is laid out: here
  // they are simply stacked, and the deck moves each one by the offset the
  // shared point asks for.
  context {
    // On the HTML side the deck draws every region in a frame of its own and
    // places it, so the layers are stacked here and moved there. On paper
    // nothing is placed later, so the offset is applied to the layout itself.
    let off = if _target.get() == "html" { (:) } else { _offsets(_frames.get().first()) }
    box({
      for (i, x) in l.slice(0, -1) {
        let d = off.at(key + "/" + str(i), default: (x: 0pt, y: 0pt))
        place(dx: d.x, dy: d.y, mark(name(i), stack: (key, i), x))
      }
      mark(name(li), stack: (key, li), lx)
    })
  }
}

/// Frames that accumulate. `build(a, b, c)` is three frames (`a`, then `a`
/// and `b`, then all three), so what stays on the page is written once and the
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
  /// the same both ways, or `(enter: name, leave: name)`, where `enter` is how
  /// this page comes in when turning to it and `leave` how the page before it
  /// goes out, with settings of its own if it wants them (`duration`, `easing`,
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
    // The layout this deck is cut to, as the player was told it. A frame has no
    // page of its own, so the margin becomes its inset; on the PDF side the page
    // has already applied it and the block fills what is left.
    let geo = _layout.get()
    assert(
      geo != none or target() != "html",
      message: "a slide belongs to a deck: `deck` or `player` says what layout its frames are cut to",
    )
    // this page's frames among the document's
    let base = _frames.get().first()
    if target() == "html" {
      // how many steps each of this page's frames has. Asked here rather than
      // above the branch: it walks the whole document, and only this side reads
      // the answer.
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
                  {
                    html.frame(block(width: geo.width, height: geo.height, inset: geo.margin, {
                      body
                      // The two corners of a box this knows the size of: what
                      // says whether the compiler resolves a position inside a
                      // frame at all (see the check in `player`). One frame
                      // answers it for the document, so only the first asks.
                      if base + i == 0 {
                        place(top + left, [#metadata(none)<vit-probe>])
                        place(bottom + right, [#metadata(none)<vit-probe>])
                      }
                    }))
                    _hosts(geo)
                  },
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
        // the same count as the HTML side keeps, and the same marker: a record
        // belongs to the frame it falls after, on paper as in the browser
        _frames.step()
        [#metadata(none)<vit-frame>]
        block(width: 100%, height: 100%, body)
        pagebreak(weak: true)
      }
    }
  }
}
