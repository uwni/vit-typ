/// The toolbar. Each button names what it does in `data-act`; the runtime
/// binds them and keeps their state. There is one per window: the main one and
/// the speaker view's.

#import "icons.typ": icon, icons

// `aria-label` and `data-act` are not Typst identifiers, so the elements that
// carry them are written with `html.elem` rather than the typed functions.

#let _button(title, act, body) = html.elem(
  "button",
  attrs: (type: "button", title: title, "aria-label": title, "data-act": act),
  body,
)

/// `pdf`: the handout's href, `none` for no download button, or `auto` to let
/// the runtime work it out from this page's address — the only thing here it
/// knows that the document does not. `shown` opens the toolbar already out:
/// the speaker view's does not auto-hide.
#let bar(pdf: none, shown: false) = html.elem(
  "div",
  attrs: (class: "vit-bar" + if shown { " is-shown" }),
  {
    html.div(class: "vit-count", "")
    _button("Desk (Esc)", "desk", icons("desk", "play"))
    _button("Overview (o)", "overview", icon("grid"))
    _button("Laser pointer (l)", "laser", icon("laser"))
    _button("Speaker view (s)", "speaker", icon("notes"))
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
    _button("Full screen (f)", "full", icons("full", "unfull"))
  },
)
