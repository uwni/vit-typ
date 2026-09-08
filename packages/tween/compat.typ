/// The compatibility layers, one submodule per drawing library: what it takes
/// to make that library's own output N states of one drawing. `compat.cetz`,
/// and the next one beside it — the directory is the namespace, so two layers
/// can both call their entry point `tweened` without meeting.
///
/// ```typ
/// #import "@preview/tween:0.1.0": compat
/// #let cz = compat.cetz.tweened(cetz)
/// ```
///
/// A layer imports no version of anything: you hand it the module your document
/// draws with, so it follows that library's releases and not tween's. It builds
/// on `states.typ` rather than on `lib.typ`, because `lib.typ` imports this file
/// to hand the layers out and Typst rejects a cyclic import — and it is handed
/// out from there because a published package's subfiles cannot be imported.
#import "compat/cetz.typ"
