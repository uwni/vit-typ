/// The laser dot, for pointers that have no cursor to restyle (touch, pen, and
/// the speaker view's preview). The mouse gets a CSS cursor instead.
#let laser() = html.div(class: "vit-laser", "")
