/// The thumbnail's caption and its position dots. A position is a frame at one
/// of its steps: to the audience both are "one more press", so both are one
/// dot. The dots are read by position, in order, and carry no indices.

/// `no` is the page number, `title` its caption. The browser flattens the
/// title to text, and the runtime reads it back as the page's.
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
