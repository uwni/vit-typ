/// The desk: the page the thumbnails point at, beside them, with its notes
/// under it. The preview is a copy of this very document positioned by #hash —
/// the same mirror the speaker view uses, so there is one renderer.
#let pane() = html.div(
  class: "vit-pane",
  {
    html.div(class: "vit-view", html.iframe(class: "vit-mirror", name: "vit-mirror", title: "Preview", ""))
    html.div(class: "vit-notes", "")
  },
)
