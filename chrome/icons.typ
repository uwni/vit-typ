/// The toolbar's icons. `svg`, `path` and `circle` have no typed function, so
/// they are written with `html.elem`, as are the attributes whose names are not
/// Typst identifiers.

#let _svg(d, extra: none) = html.elem(
  "svg",
  attrs: (viewBox: "0 0 24 24", "aria-hidden": "true"),
  {
    html.elem("path", attrs: (d: d))
    if extra != none { extra }
  },
)

#let path = (
  desk: "M4 5h16v14H4zM10 5v14",
  play: "M8 5l11 7-11 7z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  laser: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
  down: "M12 4v10M8 12l4 4 4-4M5 20h14",
  notes: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
  full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  unfull: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5",
)

/// One icon by name; `laser` carries its dot.
#let icon(name) = _svg(
  path.at(name),
  extra: if name == "laser" {
    html.elem("circle", attrs: (cx: "12", cy: "12", r: "2.6", fill: "currentColor", stroke: "none"))
  },
)

/// Two icons in one button, the second hidden: a button that swaps icon
/// (desk ⇄ present, full ⇄ exit) carries both, and the runtime shows one.
#let icons(a, b) = {
  html.elem("span", attrs: ("data-icon": a), icon(a))
  html.elem("span", attrs: ("data-icon": b, hidden: "hidden"), icon(b))
}
