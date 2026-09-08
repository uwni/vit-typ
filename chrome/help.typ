/// The key table, shown on `?`. The README lists the same keys, and
/// `runtime.js` binds them. A `<dialog>`, opened with showModal, so the deck
/// behind it goes inert and Escape closes it on its own.

#let _keys = (
  ("→ ↓ PageDown Space Enter n j", "Next: step, frame or page"),
  ("← ↑ PageUp Backspace p k", "Previous"),
  ("Home / End", "First / last page"),
  ("1 – 9", "Page"),
  ("o / a", "Overview (Esc closes it)"),
  ("Esc / Enter", "Desk ⇄ presenting"),
  ("f", "Full screen"),
  ("l", "Laser pointer"),
  ("s", "Speaker view"),
  ("b / .", "Black screen"),
  ("- / = / 0", "Slower / faster / normal speed"),
  (",", "Settings"),
  ("?", "This help"),
)

#let help(version: none) = html.dialog(
  class: "vit-help",
  {
    html.table(html.tbody(_keys.map(((k, what)) => html.tr({
      html.td(html.kbd(k))
      html.td(what)
    })).join()))
    html.div(class: "vit-about", "vit" + if version != none { " " + str(version) } else { "" })
  },
)
