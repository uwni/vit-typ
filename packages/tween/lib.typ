/// tween — several states of one drawing, and the browser moves between them.
///
/// The states are the same drawing under different numbers: same structure,
/// only the values differ. The browser is handed two of them and interpolates
/// the SVG nodes — the path's `d`, transform, colours, stroke width, opacity —
/// so nothing here writes interpolation code of its own. What has no
/// in-between cross-fades.
///
/// The stylesheet and the runtime are plain strings, and static: nothing in
/// them depends on the document, so a host is free to inline them, bundle them
/// or serve them with a hash. Everything a single drawing declares about itself
/// rides on its own element, never in generated CSS.
///
/// This file is the front door and holds nothing of its own: a published
/// package's subfiles cannot be imported (`@preview/tween:0.1.0/compat/cetz.typ`
/// is read as a version), so everything a document may want comes through here.
#import "states.typ": *

/// The compatibility layers, one submodule per drawing library, under
/// `compat/`: `compat.cetz.tweened(cetz)` and the next one beside it.
#import "compat.typ"

#let css = read("tween.css")
/// The runtime: the lifecycle (`waapi.js`, Web Animations with a registry of
/// what is running), the path reconciliation, and the engine itself, in the
/// order they have to load. Idempotent, so a page that carries it twice is
/// only a few bytes heavier.
#let js = read("waapi.js") + "\n" + read("paths.js") + "\n" + read("tween.js")
