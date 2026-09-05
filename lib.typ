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

/// Transition names. Each one is a pair of motions between two frames — the
/// way the next frame enters is the way the previous frame leaves:
/// `"fade"` cross-fades; `"slide"` pushes horizontally (forward, the new page
/// comes in from the right and the old one leaves to the left); `"rise"`
/// pushes vertically (in from the bottom); `"wipe-left"` / `"wipe-right"` /
/// `"wipe-up"` / `"wipe-down"` reveal, named by the direction the front travels
/// (`wipe-up` sweeps up from the bottom edge: the new page appears, the old one
/// is covered); `"none"` cuts. Going back always replays in reverse.
/// -> array
#let transitions = ("fade", "slide", "rise", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "none")

/// `deck` switches this to `"html"` in the HTML document. `mark` needs to know
/// which backend it is in, but inside `html.frame` `target()` is always
/// `"paged"` (the frame is laid out as paper), so the value has to come in
/// through this state.
/// -> state
#let _target = state("vt-target", "paged")

/// The keys named by this page's `slide(anim:)`. A multi-state `mark` that is
/// played continuously shows its first state in the PDF (the page at rest);
/// one that is not shows its last (the finished figure).
/// -> state
#let _anim = state("vt-anim", ())

/// Assert that a transition name is valid.
/// -> none
#let _check(
  /// A transition name, or `none`.
  /// -> str | none
  t,
) = assert(t == none or t in transitions, message: "transition must be one of " + repr(transitions))

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
/// States whose structure differs (element count changed) fall back to a plain
/// switch, with a console warning. The PDF has no player and shows the last
/// state (the finished figure, like a handout). In the HTML the other states
/// are stacked on the first state's box (`place`, taking no layout space) and
/// hidden by the runtime as data.
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
  /// The name. Same name on two adjacent pages = one pair.
  /// -> str
  key,
  /// This mark's own enter/leave effect, one of `transitions`. It applies only
  /// when the mark is one-sided in a transition (it appears, or disappears);
  /// a paired mark morphs regardless, and leaving replays entering in reverse.
  /// `"wipe-up"` reveals from the bottom edge up, `"slide"` pushes in from the
  /// right (by its own width), `"none"` appears at once. Unset (`none`) folds
  /// the mark into the page: within a page it cross-fades with the layout,
  /// between pages it pushes, wipes or fades with the whole page. Definition,
  /// theorem and proof each revealed from a different edge is three marks with
  /// one value each.
  /// -> none | str
  transition: none,
  /// One body is a plain mark; several bodies are the states of the object.
  /// -> content
  ..states,
) = {
  let s = states.pos()
  assert(s.len() > 0, message: "mark needs at least one body")
  assert(states.named().len() == 0, message: "mark takes no named argument other than transition")
  _check(transition)
  // the effect rides along in the label after the key (vt-thm|wipe-up); hoist.js splits it off onto the host
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

/// The deck: page size, fonts, and on the HTML side the stylesheet and the
/// runtime.
///
/// For a single format use `#show: deck.with(title: "…")`; for both, `bundle`.
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
  /// The default *page-to-page* transition — how unmarked content enters and
  /// leaves when turning to another page, one of `transitions`. Paired marks
  /// morph regardless; one-sided marks without an effect of their own fold
  /// into the page. It is not used between frames of one page: there the
  /// layout stays put and only changes incrementally, so root cross-fades and
  /// elements enter and leave by `mark(transition:)`. A single page can
  /// override it with `slide(transition:)`.
  /// -> str
  transition: "fade",
  /// Light/dark theme of the player chrome (toolbar, overview, speaker view).
  /// `auto` follows the system, `"dark"` / `"light"` fix it. Chrome only; the
  /// layout's colours are Typst's.
  /// -> auto | str
  theme: auto,
  /// Layout background. The PDF uses `page(fill:)`; `html.frame` carries no
  /// page background, so the same value is passed to the CSS as `--vt-page`
  /// and painted under the slides and thumbnails — identical on both sides,
  /// and independent of the chrome theme.
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
  _check(transition)
  assert(theme in (auto, "dark", "light"), message: "theme must be auto, \"dark\" or \"light\"")
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
  /// (not in the layout, not in the PDF) and read by the speaker view opened
  /// with `s`. May be content: paragraphs, lists, emphasis all render.
  /// -> content | str | none
  note: none,
  /// Overrides `deck(transition:)`: how the whole page comes in when turning
  /// to it from another page (page-to-page). Not used between frames of this
  /// page; individual elements enter and leave by `mark(transition:)`. Going
  /// back, the page being left decides, so a transition always replays in
  /// reverse.
  /// -> none | str
  transition: none,
  /// Continuous animation, running while the page rests on this frame.
  /// `key → spec`, where the spec is Web Animations keyframes + options
  /// (`duration` in ms, `easing`, `direction`, `iterations`; infinite and
  /// linear by default), handed to `el.animate()` as is:
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
          // title and notes are hidden inside the group (CSS display:none); the runtime reads
          // textContent / innerHTML, letting the browser flatten content to text
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

/// PDF and HTML from one compile:
///
/// ```sh
/// typst compile --features html,bundle --format bundle demo.typ out/
/// ```
///
/// Produces `out/<name>.pdf` and `out/<name>.html`; the toolbar's download
/// link points at the former. The top level of `--format bundle` cannot hold
/// content directly, so `let` the content first and pass it in.
/// -> content
#let bundle(
  /// Base name of the outputs.
  /// -> str
  name: "slides",
  /// Every other named argument is passed on to `deck`.
  /// -> arguments
  ..args,
  /// The pages.
  /// -> content
  body,
) = {
  let opts = args.named()
  if "pdf" not in opts { opts.insert("pdf", name + ".pdf") }
  document(name + ".pdf", deck(..opts, body))
  document(name + ".html", deck(..opts, body))
}
