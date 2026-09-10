/// The furniture the deck sits in: the rail of thumbnails, and the notes.
///
/// A thumbnail is not a copy of the page — the pages never leave the deck. It
/// is a caption, an `<svg>` the runtime points at whichever frame the page is
/// showing, and the position dots. A position is a frame at one of its steps:
/// to the audience both are "one more press", so both are one dot. The dots are
/// read by position, in order, and carry no indices.

/// `no` is the page number, `title` its caption. The browser flattens the title
/// to text, and the runtime reads it back as the page's.
#let cap(no, title) = html.div(class: "vit-cap", {
  html.b(str(no))
  html.span(if title == none { "" } else { title })
})

/// `steps` is one step count per frame of the page; the dots are its positions
/// flattened, a frame's own steps included. A page with a single position has
/// nothing to indicate.
#let dots(steps) = {
  let n = steps.map(s => s + 1).sum(default: 0)
  if n < 2 { return }
  html.div(class: "vit-dots", range(n).map(d => html.i(title: "Step " + str(d + 1), "")).join())
}

/// One thumbnail per page, in order: `pages` is `(title:, steps:)` each, as the
/// deck collected them from the document. The `<svg>` is left empty — the
/// runtime fills it with a `<use>` of the page's own drawing, so the picture is
/// the page itself and there is no second rendering of anything.
#let rail(pages) = html.div(
  class: "vit-rail",
  pages
    .enumerate()
    .map(((i, p)) => html.div(class: "vit-thumb", {
      cap(i + 1, p.title)
      html.elem("svg", attrs: (class: "vit-stand", "aria-hidden": "true"), "")
      dots(p.steps)
    }))
    .join(),
)

/// The cell the deck sits in at the desk. The deck's size has to answer to the
/// cell's, and a cell is a box only if something is one — so this is that box.
/// Everywhere else it is `display: contents` and might as well not be there.
///
/// The `<svg>` under the deck is the page's ground: the same `<use>` a
/// thumbnail is, at the deck's own size, aimed by the runtime at whatever the
/// deck is showing. For a frame at the start of every transition the deck is
/// captured — out of the live rendering, its snapshot not yet up — and this is
/// what is left to paint in its place. Left empty; the runtime fills it.
#let pane(body) = html.div(class: "vit-pane", {
  html.elem("svg", attrs: (class: "vit-plate", "aria-hidden": "true"), "")
  body
})

/// The current page's speaker notes, under the deck at the desk. Left empty —
/// the runtime writes into it, from the page the deck is on.
#let notes() = html.div(class: "vit-notes", "")

/// The boundary between two parts of the desk, and the handle for moving it.
/// `kind` says what moves: `"rail"` the width of the pages down the left,
/// `"notes"` the height the deck leaves the notes underneath it.
///
/// It is the gap: the desk's grid gives it a track of its own where it used to
/// leave empty space, so the boundary is an element the pointer can arrive on
/// rather than a place between two. Empty — the three dots are the stylesheet's.
#let grip(kind) = html.elem(
  "div",
  attrs: (
    class: "vit-grip",
    "data-grip": kind,
    role: "separator",
    "aria-orientation": if kind == "rail" { "vertical" } else { "horizontal" },
  ),
  "",
)
