/// The toolbar. Each button names what it does in `data-act`; the runtime
/// binds them and keeps their state. There is one per window: the main one and
/// the speaker view's.

#import "icons.typ": icon

// `aria-label` and `data-act` are not Typst identifiers, so the elements that
// carry them are written with `html.elem` rather than the typed functions.

#let _button(title, act, body) = html.elem(
  "button",
  attrs: (type: "button", title: title, "aria-label": title, "data-act": act),
  body,
)

/// A button with two faces — desk ⇄ present, full ⇄ exit. Each is
/// `(icon, title)` and carries its own words, so the runtime shows one face
/// and takes its title with it; `at-rest` is the face a fresh page shows.
#let _swap(act, at-rest, other) = _button(
  at-rest.at(1),
  act,
  {
    let face(f, ..rest) = html.elem(
      "span",
      attrs: ("data-icon": f.at(0), "data-title": f.at(1), ..rest.named()),
      icon(f.at(0)),
    )
    face(at-rest)
    face(other, hidden: "hidden")
  },
)

/// `pdf`: the handout's href, `none` for no download button, or `auto` to let
/// the runtime work it out from this page's address — the only thing here it
/// knows that the document does not.
///
/// `modes` carries the two buttons that decide what is on the screen — the desk
/// and the overview — and the one that opens the speaker view. A speaker view's
/// own toolbar has none of them: it is a remote, and what the audience is shown
/// is decided on the screen the audience is looking at. The runtime binds and
/// refreshes whichever buttons it finds, so a toolbar is what it carries.
#let bar(pdf: none, modes: true) = html.elem(
  "div",
  attrs: (class: "vit-bar"),
  {
    html.div(class: "vit-count", "")
    if modes {
      _swap("desk", ("desk", "Desk (Esc)"), ("play", "Present (Enter)"))
      _button("Overview (o)", "overview", icon("grid"))
    }
    _button("Laser pointer (l)", "laser", icon("laser"))
    if modes { _button("Speaker view (s)", "speaker", icon("notes")) }
    _button("Settings (,)", "settings", icon("tune"))
    if pdf != none {
      html.elem(
        "a",
        attrs: (
          class: "vit-dl", download: "", target: "_blank", rel: "noopener",
          title: "Download PDF", "aria-label": "Download PDF",
        )
          + (if pdf != auto { (href: pdf) } else { (:) }),
        icon("down"),
      )
    }
    _swap("full", ("full", "Full screen (f)"), ("unfull", "Exit full screen (f)"))
  },
)

/// The patch of page you reach the toolbar through. While a page is being shown
/// the toolbar is not there to be pointed at — a hidden toolbar that could be
/// pointed at could also be pressed, and it sits over a corner of the page,
/// where a press turns the page. So this sits under it instead: it is *part of
/// the deck*, so a press on it is a press on the page and turns it like any
/// other, and the pointer arriving on it is what brings the toolbar out.
#let reach() = html.div(class: "vit-reach", "")
