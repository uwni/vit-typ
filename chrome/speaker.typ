/// The speaker view's body, as a `<template>` for the runtime to import into
/// the window it opens. Both previews are copies of this very document, so
/// nothing here is a second rendering of anything — but they are not the same
/// kind of thing, and each says which it is in its `name`.
///
/// `main` is a mirror: it plays the page change out, because it is the one
/// place the presenter can see the audience's screen — and being a copy of
/// this document is what keeps its drawings in step with theirs. `aside` runs
/// ahead, with nothing yet to be in step with, so it lands at once and stays
/// readable while it is read. Element animations run either way.

#import "bar.typ": bar

#let speaker(pdf: none) = html.template(class: "vit-speaker-body", {
  html.div(class: "prog", html.i(""))
  html.header({
    html.b("")
    html.span("")
    html.time(title: "Time the talk from now", "00:00")
  })
  html.main({
    html.iframe(class: "vit-mirror", name: "vit-mirror", "")
    html.div(class: "vit-notes", "")
  })
  html.aside({
    html.small("Next")
    html.iframe(class: "vit-mirror", name: "vit-mirror-ahead", "")
  })
  // a remote, not a second set of controls for the audience's screen
  bar(pdf: pdf, modes: false)
})
