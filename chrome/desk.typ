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
#let pane(body) = html.div(class: "vit-pane", body)

/// The current page's speaker notes, under the deck at the desk. Left empty —
/// the runtime writes into it, from the page the deck is on.
#let notes() = html.div(class: "vit-notes", "")
