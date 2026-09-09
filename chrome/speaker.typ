/// The speaker view's body, as a `<template>` for the runtime to import into
/// the window it opens. The two previews are copies of this very document
/// (`name="vit-mirror"`), so they play the real transitions.

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
