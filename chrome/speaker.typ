/// The speaker view's body, as a `<template>` for the runtime to import into
/// the window it opens. Both previews are copies of this very document
/// (`vit-mirror`), so nothing here is a second rendering of anything — but
/// they are not the same kind of thing, and each says which it is in its
/// `name`.
///
/// The one in `main` is a mirror: it shows what the audience is looking at,
/// the page change played out and all, because it is the one place the
/// presenter can see their screen. Being a copy of this document rather than
/// a second renderer is also what keeps it in step — the same gate holds a
/// page's own drawings until the same transition ends, in both windows at
/// once.
///
/// The one in `aside` runs ahead: what it shows has not happened yet, so
/// there is nothing for it to be in step with, and playing the change out
/// would only make it unreadable exactly when it is being read. It lands at
/// once. Element animations run either way: what a step does is what the
/// presenter is here to see coming.

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
