/// What the presenter, not the document, decides: how fast the deck moves and
/// what the laser looks like. Every control names what it sets in `data-set`,
/// and the runtime keys on that alone — a new dial is a row here and an entry
/// there. The values live in the browser, so a deck handed to someone else
/// carries none of them.

#let _row(name, body) = html.elem("label", attrs: (class: "vit-row"), {
  html.span(name)
  body
})

#let _range(what, min, max, step) = html.elem(
  "input",
  attrs: (
    type: "range",
    min: str(min),
    max: str(max),
    step: str(step),
    "data-set": what,
  ),
)

#let _out(what) = html.elem("output", attrs: ("data-out": what))

/// A `<dialog>`, opened with showModal: the deck behind it goes inert, so a
/// click meant for a slider cannot also turn the page, and Escape closes it
/// without anyone binding a key.
#let settings() = html.dialog(
  class: "vit-settings",
  html.elem("form", attrs: (method: "dialog"), {
    html.elem("h2", "Settings")

    _row("Speed", { _range("speed", 0.25, 4, 0.05); _out("speed") })
    _row("Tracer", { _range("trail", 0, 1000, 50); _out("trail") })

    _row("Laser", {
      html.elem("input", attrs: (type: "color", "data-set": "ink"))
      _out("ink")
    })
    _row("Laser size", { _range("size", 16, 64, 2); _out("size") })

    html.elem("div", attrs: (class: "vit-row"), {
      html.span("Theme")
      html.elem(
        "div",
        attrs: (class: "vit-seg", "data-set": "theme"),
        ("auto", "light", "dark")
          .map(v => html.elem(
            "button",
            attrs: (type: "button", "data-value": v),
            ("auto": "System", "light": "Light", "dark": "Dark").at(v),
          ))
          .join(),
      )
    })

    html.elem("button", attrs: (type: "button", class: "vit-reset", "data-act": "reset"), "Reset")
  }),
)
