/// The key table, shown on `?`. The README lists the same keys, and
/// `runtime.js` binds them.

#let keys = (
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
  ("?", "This help"),
)

#let help(version: none) = html.div(
  class: "vit-help",
  hidden: true,
  {
    html.table(html.tbody(keys.map(((k, what)) => html.tr({
      html.td(html.kbd(k))
      html.td(what)
    })).join()))
    html.div(class: "vit-about", "vit" + if version != none { " " + str(version) } else { "" })
  },
)
