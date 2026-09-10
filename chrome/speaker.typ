/// The speaker view's body, as a `<template>` for the runtime to import into
/// the window it opens. The two previews are copies of this very document
/// (`name="vit-mirror"`), so nothing here is a second rendering of anything.
///
/// This screen is the presenter's console, not a monitor of the audience's:
/// all of it runs ahead of them. The counter, the progress bar and both
/// previews are redrawn when the move is announced, which is at its start —
/// so a page change lands in a preview at once rather than being played out,
/// and what the presenter reads is legible from the first frame. Element
/// animations still run: what a step does is exactly what they are here to
/// see coming.

#import "bar.typ": bar

#let speaker(pdf: none) = html.template(class: "vit-speaker-body", {
  html.div(class: "prog", html.i(""))
  html.header({
    html.b("")
    html.span("")
    html.time(title: "Click to reset", "00:00")
  })
  html.main({
    html.iframe(class: "vit-mirror", name: "vit-mirror", "")
    html.div(class: "vit-notes", "")
  })
  html.aside({
    html.small("Next")
    html.iframe(class: "vit-mirror", name: "vit-mirror", "")
  })
  // a remote, not a second set of controls for the audience's screen
  bar(pdf: pdf, modes: false)
})
