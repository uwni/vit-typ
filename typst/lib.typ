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
#import "@preview/elembic:1.1.1" as _e
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

/// Between frames of one page the layout stays put and changes incrementally,
/// so the page cross-fades (what is the same stays, what was added fades in),
/// and elements enter and leave by their own `mark(transition:)`.
/// -> dictionary
#let _frame = _pair("fade")

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

/// One frame of a page, as the deck lays it out: one picture. On paper it is a
/// page of its own. In the browser the deck's show rule (`player`) draws it: the
/// `html.frame`, from the deck's own size, and the elements its regions are
/// moved into. The frame's marker goes first either way: a record belongs to
/// the frame whose marker it falls after, and nothing is counted.
#let stage = _e.element.declare(
  "stage",
  prefix: "@preview/vit,v0.1.0",
  doc: "One frame of a page.",
  count: none,
  fields: (
    _e.field("body", content, required: true),
  ),
  display: it => {
    [#metadata(none)<vit-frame>]
    block(width: 100%, height: 100%, it.body)
    pagebreak(weak: true)
  },
)

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
///
/// An element (elembic): the frames are its positional arguments. Fields:
///
/// - `title`: the page's caption, for the rail and the speaker view.
/// - `note`: speaker notes, read by the runtime and never shown in the layout.
/// - `transition`: how this page comes in, a name from `transitions` or
///   `(enter:, leave:)` with settings; `none` takes the run's (`turn`).
/// - `turn`: how the pages of a run turn, for the pages that say nothing of
///   their own: `turning` sets it, `deck`/`player` set it for the whole deck.
/// - `inside`: there is a deck around this page. Only `player` sets it.
///
/// The layout a page is cut to is *not* a field, and nothing reads it back at
/// all: the deck builds every frame itself, from its own arguments (the show
/// rule in `player`). Read back from anywhere, a state or the style chain, it
/// would be the wrong number on the document's first pass, when every answer
/// is empty, and the whole frame with it; one pass more to settle, or none.
/// -> content
#let slide = _e.element.declare(
  "slide",
  prefix: "@preview/vit,v0.1.0",
  doc: "One page of the deck: its frames, its caption and its notes.",
  count: none,
  fields: (
    _e.field("frames", _e.types.array(content), required: true, named: true, doc: "The frames, in order."),
    _e.field("title", _e.types.option(_e.types.union(str, content)), default: none, doc: "The caption."),
    _e.field("note", _e.types.option(content), default: none, doc: "Speaker notes."),
    _e.field("transition", _e.types.option(_e.types.union(str, dictionary)), default: none, doc: "This page's own transition; none takes the run's."),
    _e.field("turn", _e.types.option(_e.types.union(str, dictionary)), default: "fade", doc: "How the pages of this run turn."),
    _e.field("inside", bool, default: false, doc: "There is a deck around this page. Only `player` sets it."),
  ),
  // the frames are the positional arguments, as many as there are; a page
  // with none is one empty frame
  construct: orig => (..args) => {
    assert(
      args.named().keys().all(k => k in ("title", "note", "transition")),
      message: "slide takes title, note and transition; the frames are positional",
    )
    let bodies = args.pos()
    if bodies.len() == 0 { bodies = ([],) }
    let _ = _pair(args.named().at("transition", default: none))
    orig(frames: bodies, ..args.named())
  },
  display: it => context {
    let own = _pair(it.transition)
    let fx = if own == none { _pair(it.turn) } else { own }
    // The layout a frame is cut to is the deck's, and the deck builds the frame
    // itself (the show rule in `player`). All a page needs to know is that
    // there is a deck at all, and that is a field a set rule filled, not an
    // answer.
    assert(
      it.inside or target() != "html",
      message: "a slide belongs to a deck: `deck` or `player` says what layout its frames are cut to",
    )
    if target() == "html" {
      let section = (class: "vit-slide")
      // every frame carries the types of the transition into it: the first
      // frame of the page the page's (none: no transition), the others the
      // frame-to-frame one
      let attrs(i) = (
        if i > 0 { section + ("data-transition": _types(_frame)) } else if fx == none { section } else {
          section + ("data-transition": _types(fx))
        }
      )
      html.elem(
        "div",
        attrs: (class: "vit-group"),
        {
          // the rules this page's own settings need, written where the
          // transition is (see `_sets`); a name alone needs none, and the run's
          // are `turning`'s to write, once
          let css = _sets(own)
          if type(css) == str and css != "" { html.elem("style", css) }
          it.frames.enumerate().map(((i, body)) => html.elem("section", attrs: attrs(i), stage(body))).join()
          // notes are hidden inside the group (CSS display:none); the runtime
          // reads innerHTML
          if it.note != none { html.elem("aside", attrs: (class: "vit-note"), it.note) }
        },
      )
    } else {
      for body in it.frames { stage(body) }
    }
  },
)

/// How the pages under it turn, for a run of them rather than the whole deck:
/// `#turning("slide")[ …slides… ]`, or `#show: turning("slide")` for the rest
/// of a scope. A page that says `transition:` itself is not affected. It is a
/// set rule on `slide`'s `turn` field (`e.set_(slide, turn: …)`), so it is in
/// scope for its body and gone after it.
///
/// Prefer the scoped form for a run in the middle of a deck. Until Typst has
/// custom elements of its own, an elembic set rule is a show rule, and
/// `#show: turning(…)` written before page after page nests them one inside
/// the next, which Typst stops at a depth of 64 — around twenty of them. The
/// scoped form and `transition:` on a page nest nothing.
/// -> content | function
#let turning(
  /// A name from `transitions`, or a dictionary naming the effects and their
  /// settings, as `slide(transition:)` takes it.
  /// -> none | str | dictionary
  transition,
  /// The run: with it, the pages it applies to; without it, the rule itself,
  /// for `#show:`.
  /// -> content
  ..scope,
) = {
  let p = _pair(transition)
  assert(scope.named().len() == 0 and scope.pos().len() <= 1, message: "turning takes a transition and, optionally, the pages it applies to")
  let rule(doc) = {
    // the rules the run's settings need, once for the run rather than once per
    // page (see `_sets`); a name alone needs none, and paper needs nothing
    let css = _sets(p)
    if type(css) == str and css != "" { context { if target() == "html" { html.elem("style", css) } } }
    _e.set_(slide, turn: transition)(doc)
  }
  if scope.pos().len() == 0 { rule } else { rule(scope.pos().first()) }
}

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
///
/// An element (elembic): `mark(key, body)` constructs it, and what a document
/// wants for a run of marks it sets on the fields, `#show: e.set_(mark,
/// transition: "rise")`, the way `turning` does for pages. Fields:
///
/// - `key`: the name. Same name on two adjacent pages = one pair. Letters,
///   digits, `_` and `-` (it becomes a CSS `view-transition-name`).
/// - `body`: what the object is. Several states of one drawing are `tween`'s,
///   not a mark's: `mark(key, tween(s0, s1, …))`. To hide a mark, `veil` rather
///   than `hide`: the deck gives every marked region an element of its own, and
///   a bare `hide` leaves it giving one to a region the page meant to drop.
/// - `transition`: this object's own enter/leave effect: a name from
///   `transitions`, the same both ways, or `(enter: name, leave: name)`, where
///   `enter` is how it appears and `leave` how it disappears (going back replays
///   either in reverse). It applies only when the mark is one-sided in a
///   transition; a paired mark morphs regardless. `"wipe-up"` reveals from the
///   bottom edge up, `"slide"` pushes in from the right (by its own width,
///   fading as it goes), `"zoom"` shrinks into place, `"none"` appears at once.
///   Unset (`none`) folds the mark into the page: within a page it cross-fades
///   with the layout, between pages it pushes, wipes or fades with the whole
///   page. Definition, theorem and proof each revealed from a different edge is
///   three marks with one value each. One object has one effect: given on any
///   occurrence of the key, it holds for all of them, and two occurrences may
///   not disagree. Marks nest: one around an assembly is a group of its own, and
///   the marks inside it keep their own identity. The group carries what is
///   left once they are lifted out, which is how the first change's result
///   takes part in the next one as a whole (see `fit` and `anchor` in
///   `transitions`). Settings ride along in the same dictionary (`duration`,
///   `easing`, `zoom`, `push`; see `transitions`) and apply to this mark alone,
///   whatever pace the page keeps.
/// - `stack`: which stack of layers this is one of, as `layers` says: `(key,
///   index)`. The deck aligns a stack by the point its layers share, and
///   everything drawn inside a layer moves with it.
/// - `block`: how the identity is held: in a box (the default), or in a block.
///   A box is what lets a mark sit inside a sentence or a formula. But a box is
///   only as tall as the glyphs in it, where a line is as tall as the line. So
///   content that *is* a block in its own right (a title in a header band, a
///   figure, a column) measures differently boxed than it did unmarked, and
///   anything that lays it out by measuring it (fitting it to a width, centring
///   it on the horizon) moves. Marking such content with `block: true` holds
///   the identity in an unbreakable block instead, which measures exactly as
///   the content did, and the layout does not notice the mark at all. It is
///   block-level, so it is wrong inside a sentence, which is why it is not the
///   default.
/// -> content
#let mark = _e.element.declare(
  "mark",
  prefix: "@preview/vit,v0.1.0",
  doc: "One object, named, that the browser pairs across pages.",
  // an element's own counter is an element per instance, and nothing counts marks
  count: none,
  fields: (
    _e.field("key", str, required: true, doc: "The name: letters, digits, _ and -."),
    _e.field("body", content, required: true, doc: "What the object is."),
    _e.field("transition", _e.types.option(_e.types.union(str, dictionary)), default: none, doc: "This object's own enter/leave effect; none folds it into the page."),
    _e.field("stack", _e.types.option(array), default: none, doc: "Which stack of layers this is one of: (key, index)."),
    _e.field("block", bool, default: false, doc: "Hold the identity in an unbreakable block rather than a box."),
    // what the deck says, set for a scope like any field: never an argument
    _e.field("html", bool, default: false, doc: "The document is an HTML one. The deck sets it (`player`)."),
    _e.field("veiled", bool, default: false, doc: "Under a `veil`: keeps its place, shows nothing, gets no element."),
  ),
  // what is wrong is said where it is written, not when the page is laid out
  construct: orig => (..args) => {
    assert("html" not in args.named() and "veiled" not in args.named(), message: "html and veiled are the deck's to set (player, veil), not an argument")
    let key = args.pos().at(0, default: none)
    assert(
      type(key) == str and key.match(regex("^[A-Za-z0-9_-]+$")) != none,
      message: "a mark key is letters, digits, _ and -: " + repr(key),
    )
    let _ = _pair(args.named().at("transition", default: none))
    orig(..args)
  },
  display: it => {
    let key = it.key
    let stack = it.stack
    let body = it.body
    let fx = _pair(it.transition)
    // `block` is the field here, so the element has to be named through `std`
    let hold = if it.block { std.block.with(breakable: false) } else { std.box }
    // whether this is inside a drawing's states is the drawing's own field
    // (`tween`'s `nested`, set by its `inner`), read off the style chain here
    _e.get(g => if g(_tween.tween).nested {
      // inside the states of a drawing: a node of that drawing, which the
      // runtime steps as a whole, and not an object of its own
      hold(body)
    } else if not it.html {
      // On paper the deck places nothing, so a stack is aligned where it is
      // laid out and these say where that is. Neither draws.
      hold({
        place(top + left, [#metadata((key: key, stack: stack))<vit-mark>])
        body
        place(bottom + right, [#metadata(none)<vit-mark-end>])
      })
    } else {
      // The region is laid out once, here, where the page put it. The SVG
      // export writes a group around a labelled box, and the browser lifts that
      // group into an element of its own, which is what a View Transition can
      // name and Web Animations can move (web/hoist.js). Where that element
      // goes is this record, placed in the box's own top left corner: in a
      // paragraph a position is a point on the baseline, and the corner is what
      // a box is placed by. It carries the effect as resolved here, set rule
      // and all, which is why `_marks` reads it rather than the element.
      let record = place(top + left, [#metadata((
        key: key,
        stack: stack,
        transition: if fx == none { none } else { _types(fx) },
        sets: if fx == none { () } else { _bundles(fx) },
        shown: not it.veiled,
      ))<vit-mark>])
      // and the far corner, so the element is as big as the box the page gave
      // the region. It goes after the body, so that what the body records sits
      // between the two and the deck can see what is nested in what.
      let ending = place(bottom + right, [#metadata(none)<vit-mark-end>])
      if it.veiled {
        // under a veil: the region keeps its place and shows nothing, and it is
        // still a named point, so it records itself and gets no element
        hold({ record; body; ending })
      } else {
        [#hold({ record; body; ending })#label("vit:" + key)]
      }
    })
  },
)

/// `hide`, for content with marks in it. Hidden content keeps its place in the
/// layout and leaves no ink, so a mark inside it has a position and nothing to
/// show, and the deck must not give it an element of its own: an empty one
/// would still be named, and still morph. Typst cannot be asked whether
/// something is hidden, so this says so as it hides: a set rule on `mark`'s
/// `veiled` field, in scope for the body and gone after it.
/// -> content
#let veil(
  /// -> content
  body,
) = {
  show: _e.set_(mark, veiled: true)
  hide(body)
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
///
/// An element (elembic): fields `key` (the name; the same name in two layers is
/// the point they share) and `body` (what holds the place: usually the part the
/// later layer redraws).
/// -> content
#let anchor = _e.element.declare(
  "anchor",
  prefix: "@preview/vit,v0.1.0",
  doc: "A named point, for layers to hang a stack on.",
  count: none,
  fields: (
    _e.field("key", str, required: true, doc: "The name."),
    _e.field("body", content, required: true, doc: "What holds the place."),
  ),
  display: it => veil(std.box({
    place(top + left, [#metadata((key: it.key))<vit-anchor>])
    it.body
  })),
)

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
/// frames' own markers, not something it read: a counter is an answer, and on
/// the document's first pass every answer is empty.
/// -> dictionary
#let _offsets() = {
  // The records of the frame this runs in, and which frame that is, is where
  // this sits: the number of frame markers before it. The walk covers that
  // whole segment rather than stopping at `here()`, because on paper a stack
  // asks from inside the frame, before its own layers have been recorded.
  let k = query(selector(<vit-frame>).before(here())).len()
  let seg = 0
  let open = ()
  let corners = ()
  let points = ()
  for m in query(selector.or(<vit-frame>, <vit-mark>, <vit-mark-end>, <vit-anchor>)) {
    if m.label == <vit-frame> {
      seg += 1
      if seg > k { break }
      continue
    }
    if seg != k { continue }
    if m.label == <vit-mark> {
      let v = m.value
      let at = m.location().position()
      let inside = if open.len() > 0 { open.last().layer } else { none }
      let layer = inside
      if v.stack != none {
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
      } else if inside != none {
        points.push((inside.first(), inside.last(), v.key, at))
      }
      open.push((layer: layer))
    } else if m.label == <vit-mark-end> {
      if open.len() > 0 { let _ = open.pop() }
    } else if m.label == <vit-anchor> {
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

/// One element per region of the frame just laid out, empty, placed and sized
/// where the page put the region. View Transitions ignore a
/// `view-transition-name` on an SVG child and Web Animations keyframes are CSS,
/// so a region that has to morph or move has to be a CSS box of its own. The
/// browser moves the group the SVG export wrote for the region into this
/// element (web/hoist.js): the region is laid out once, by the page, and moved,
/// never drawn again. Laid out a second time it would be in the document a
/// second time, stepping every counter in it again and taking the document a
/// pass longer to settle.
///
/// The element is placed and sized in percent of the page, so it follows the
/// stage; the corner and the size in the page's own units ride along for the
/// browser, which puts them on the `viewBox`.
/// -> content
#let _hosts(
  /// -> dictionary
  geo,
) = context {
  let pct(a, b) = str(a / b * 100) + "%"

  /// One walk over what the frames recorded: what is nested in what, and where
  /// every named point landed. A region's corner is where the page put it; a
  /// stack's layers are moved from there onto the point they share.
  ///
  /// Which of these belong to this frame is not a number anyone counted. This
  /// runs right after the frame it places for, so its own records are the ones
  /// after the last frame marker: the walk stops at `here()` and starts over at
  /// every marker, and what is left in hand at the end is this frame's. A
  /// number would have to come from a counter, and a counter is an answer: on
  /// the first pass of the document every answer is empty, so the page would
  /// be built wrong once and the document would take a pass longer to settle.
  let mine = ()
  let open = ()
  for m in query(selector.or(
    <vit-frame>, <vit-mark>, <vit-mark-end>, <vit-anchor>, <waapi-decl>, <waapi-at>, <waapi-end>,
  ).before(here())) {
    if m.label == <vit-frame> {
      mine = ()
      open = ()
    } else if m.label == <vit-mark> {
      let v = m.value
      let at = m.location().position()
      let inside = if open.len() > 0 { open.last().layer } else { none }
      // a layer of a stack carries everything drawn inside it
      let layer = if v.stack != none {
        (v.stack.first(), v.stack.last())
      } else { inside }
      open.push((v: v, at: at, layer: layer))
    } else if m.label == <vit-mark-end> {
      let o = open.pop()
      // a veiled region keeps its place and shows nothing: it is a named point
      // and gets no element
      if o.v.shown {
        let to = m.location().position()
        mine.push((
          kind: "mark",
          v: o.v,
          at: o.at,
          size: (width: to.x - o.at.x, height: to.y - o.at.y),
          layer: o.layer,
        ))
      }
    } else if m.label == <waapi-decl> and m.value.placed {
      mine.push((
        kind: "decl",
        v: m.value,
        at: none,
        size: none,
        layer: if open.len() > 0 { open.last().layer } else { none },
      ))
    } else if m.label == <waapi-at> and mine.len() > 0 {
      // the corner of the declaration just recorded: it comes right after it
      let last = mine.pop()
      last.at = m.location().position()
      mine.push(last)
    } else if m.label == <waapi-end> and mine.len() > 0 {
      // and its far corner, after the body
      let last = mine.pop()
      let to = m.location().position()
      last.size = (width: to.x - last.at.x, height: to.y - last.at.y)
      mine.push(last)
    }
  }

  let shift = _offsets()
  let moved(p, layer) = {
    if layer == none { return p }
    let d = shift.at(layer.first() + "/" + str(layer.last()), default: none)
    if d == none { p } else { (x: p.x + d.x, y: p.y + d.y) }
  }

  for h in mine {
    let v = h.v
    let p = moved(h.at, h.layer)
    let where = (
      "left:" + pct(p.x, geo.width),
      "top:" + pct(p.y, geo.height),
      "width:" + pct(h.size.width, geo.width),
      "height:" + pct(h.size.height, geo.height),
    ).join(";")
    // Two boxes in the page's own units. `data-vit-at` is where the element
    // goes, which for a layer of a stack is not where the page drew it: the
    // rail draws every region into a thumbnail there. `data-vit-box` is where
    // the page drew it, corner and size: the browser writes it on the
    // element's `viewBox`, which is what cuts the region's ink out of the
    // page's coordinates, and the ink is drawn once, where it is.
    let at = (p.x, p.y).map(l => str(l.pt())).join(" ")
    let box = (h.at.x, h.at.y, h.size.width, h.size.height).map(l => str(l.pt())).join(" ")
    if h.kind == "mark" {
      html.elem(
        "div",
        attrs: (class: "vit-mark", "data-vit-key": v.key, "data-vit-at": at, "data-vit-box": box, style: where),
      )
    } else {
      // the declaration's own element: it is the box the keyframes move, and it
      // starts itself once the browser has moved the box into it
      html.elem(
        v.tag,
        attrs: (
          class: "vit-mark",
          "data-spec": json.encode(v.spec, pretty: false),
          "data-vit-at": at,
          "data-vit-box": box,
          style: where,
        ),
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
    // Both at once: how the pages under this deck turn, and the layout they
    // are cut to. An HTML export has no pages (a page set rule there is
    // ignored, and the compiler warns about it), so the layout is not read off
    // `page`; `deck` sets its own page from the same numbers, for the PDF.
    show: turning(transition)
    show: _e.set_(slide, inside: true)
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
      // the marks and the drawings under this deck are in an HTML document, and
      // the deck gives a declaration that needs a CSS box an element of its own:
      // one field each, set here for the whole deck (two rules, consecutive, so
      // elembic makes them one)
      show: _e.set_(mark, html: true)
      show: _tween.hosting(places: true)
      // Every page's own drawing, and the elements its regions are moved into.
      // The deck builds them, not the page: the size of a frame is where every
      // position inside it comes from, and on the document's first pass every
      // answer is empty, so a page that read the size back would be laid out
      // wrong once and the document would need a pass more to settle. Here it
      // is this function's own argument, right from the first pass.
      let geo = (width: width, height: height, margin: margin)
      show: _e.show_(stage, it => {
        let body = _e.fields(it).body
        [#metadata(none)<vit-frame>]
        html.elem("div", attrs: (class: "vit-page"), {
          html.frame(block(width: width, height: height, inset: margin, {
            body
            // The two corners of a box this knows the size of: what says
            // whether the compiler resolves a position inside a frame at all
            // (see the check below). Every frame asks; the check reads the
            // first pair.
            place(top + left, [#metadata(none)<vit-probe>])
            place(bottom + right, [#metadata(none)<vit-probe>])
          }))
          _hosts(geo)
        })
      })
      // How many steps every frame of the document has, in document order. Said
      // once, here, rather than on each frame: a page that stated its own
      // frames' counts would be putting the answer to a query into something
      // the deck's own queries read back, which costs the document a pass.
      // Nothing reads this attribute back.
      let all = _steps()
      _pane(html.elem(
        "div",
        attrs: (
          class: "vit-deck",
          // empty on the first pass, before the query has anything to say
          "data-steps": if all.len() == 0 { "" } else { all.map(str).join(" ") },
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
      // each page's caption, and the step counts of its own frames cut out of
      // the document-wide list by how many frames the page says it has
      {
        let at = 0
        let pages = ()
        for v in _e.query(slide).map(_e.fields) {
          pages.push((title: v.title, steps: all.slice(at, calc.min(at + v.frames.len(), all.len()))))
          at += v.frames.len()
        }
        _rail(pages)
      }
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
      // First, and before the drawings' own elements upgrade: it moves every
      // region into the element placed for it, a move and not a measurement,
      // so it runs while the document is still being parsed and nothing has
      // been painted.
      html.script(read("web/hoist.min.js"))
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
  _e.get(g => context {
    // On the HTML side the deck gives every region an element of its own and
    // places it, so the layers are stacked here and moved there. On paper
    // nothing is placed later, so the offset is applied to the layout itself.
    let off = if g(mark).html { (:) } else { _offsets() }
    box({
      for (i, x) in l.slice(0, -1) {
        let d = off.at(key + "/" + str(i), default: (x: 0pt, y: 0pt))
        place(dx: d.x, dy: d.y, mark(name(i), stack: (key, i), x))
      }
      mark(name(li), stack: (key, li), lx)
    })
  })
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
