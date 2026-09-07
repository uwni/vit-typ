"""Generate the transition block of deck.css from the table of effects below.

   Every effect is four rules by role and direction — the enter effect names the
   new side forward and the old side back, the leave effect the other two — which
   is a lot of selectors to keep straight by hand and no thought at all. Edit the
   table, run `python3 tools/gencss.py`, and the block between the two markers in
   deck.css is rewritten. Nothing else in the stylesheet is touched."""
import os

def T(*types): return "html" + "".join(":active-view-transition-type(" + t + ")" for t in types)
def enter_side(x):   # the side the pair's enter effect governs: the new side forward, the old side back
    return [T("fwd", "enter-" + x) + "::view-transition-new(root)", T("back", "enter-" + x) + "::view-transition-old(root)"] + enter_mark(x)
def leave_side(x):   # the side the pair's leave effect governs: the old side forward, the new side back
    return [T("fwd", "leave-" + x) + "::view-transition-old(root)", T("back", "leave-" + x) + "::view-transition-new(root)"] + leave_mark(x)
def enter_mark(x):   # the same role, on a one-sided mark rather than on the page
    return [T("fwd") + "::view-transition-new(.enter-" + x + ")", T("back") + "::view-transition-old(.enter-" + x + ")"]
def leave_mark(x):
    return [T("fwd") + "::view-transition-old(.leave-" + x + ")", T("back") + "::view-transition-new(.leave-" + x + ")"]
def rule(sels, decls): return ",\n".join(sels) + " {\n" + "".join("  " + d + ";\n" for d in decls) + "}\n"

out = []
out.append("""/* ── a transition is a pair of effects ────────────────────────────────
   deck/slide/mark(transition: (enter:, leave:)): how the new side comes in,
   how the old side goes out; a string is the same effect both ways. The
   Typst side writes the pair as the transition's types on every frame
   (data-transition="enter-slide leave-fade") and as a one-sided mark's
   view-transition-class (the runtime adds the side the mark has, vt-only-new
   or vt-only-old); the runtime adds fwd or back. Going back replays the pair in reverse: the new side comes in the
   way the old would have gone out, run backwards, and the old side goes out
   the way the new would have come in. So each effect has one rule per role
   — the enter effect's names the new side forward and the old side back,
   the leave effect's the old side forward and the new side back — and the
   value is the same in both directions: where the entering side starts is
   where the leaving side ends.

   Every side runs one animation, vt-enter from where the variables put it
   to rest, vt-leave from rest to where they put it: --vt-opacity,
   --vt-transform, --vt-clip (with --vt-clip-rest, the clip at rest — unset,
   nothing is clipped; a clip at rest would cut the ink overflow the
   snapshots carry, so only the wipes set it), --vt-s-away (the
   magnification away from rest, for the zoom's focus), --vt-timing. A side
   with nothing set holds. A rule that names root sets the variables on
   the root's own image, never on html: the marks' images would inherit
   them. Only an image that exists gets an animation — a one-sided mark's
   new image if it is entering, its old image if it is leaving: WebKit
   styles both images of every named element whether or not they exist, and
   an animation given to one that does not exist is never torn down and
   comes back finished the next time the name is used. */
::view-transition-new(root),
::view-transition-new(.vt-only-new) {
  animation: vt-enter calc(var(--vt-duration) / var(--vt-speed)) var(--vt-timing, var(--vt-easing)) both;
}
::view-transition-old(root),
::view-transition-old(.vt-only-old) {
  animation: vt-leave calc(var(--vt-duration) / var(--vt-speed)) var(--vt-timing, var(--vt-easing)) both;
}
/* A paired mark morphs: the browser moves its group and cross-fades its two
   images itself — the old fading out under the new fading in, blended with
   plus-lighter, so what stays put never dims (the blending rides on the
   browser's own animation, which an animation of ours would replace). Only
   the pace is ours. */
::view-transition-old(.vt-mo),
::view-transition-new(.vt-mo) {
  animation-timing-function: var(--vt-easing);
}
/* A group interpolates as a box, and each of its two images is drawn into that
   box — stretched to fill it, which is right for a mark that keeps its shape
   and wrong for one that grows on one side: an assembly that gains a corner
   would smear while it grows. fit: "none" draws both images at their own size
   instead, anchored where the transition asks, so what was already there stays
   where it was and only the new part appears. The anchor is the corner that
   does not move. */
::view-transition-old(.vt-mo),
::view-transition-new(.vt-mo),
::view-transition-old(.vt-only-old),
::view-transition-new(.vt-only-new) {
  object-fit: var(--vt-fit, fill);
  object-position: var(--vt-anchor, 50% 50%);
}
/* opening or closing the overview: the deck fades into the grid while the page zooms */
html:active-view-transition-type(overview)::view-transition-new(root) {
  --vt-opacity: 0;
}
/* fade. For root the old page is held beneath the new one fading in: both
   snapshots are opaque and page-sized, so this is a cross-fade with no dip,
   the same in both directions, and a frame on which both happen to be fully
   visible — the last one, when the animations end a frame before the
   pseudo-elements go — shows the new page, never the old. Paired with
   another entrance the old page fades out for real. */
""")
out.append(rule(enter_side("fade") + leave_side("fade"), ["--vt-opacity: 0"]))
out.append(rule([T("enter-fade", "leave-fade") + "::view-transition-old(root)"], ["--vt-opacity: 1"]))
out.append("/* none: at once. The side jumps to its end state on the first frame. */\n")
out.append(rule(enter_side("none") + leave_side("none"), ["--vt-opacity: 0", "--vt-timing: step-start"]))
out.append("""/* slide / rise: push, by the width / height of the box. Forward the new one
   comes in from the right / bottom and the old one leaves to the left / top;
   back, the other way round; a transition can set how far with push (a
   negative distance sends them the other way). On a mark they also fade, for
   the reason given where that rule stands. zoom: the new one shrinks into place from
   three times its size, fading in, the old one grows away, fading out, the
   same both ways — and the screen is the focal plane. A side at
   magnification s sits at 1/s of the focal distance, and a lens of aperture
   A images each of its points as a circle of confusion c = A (s − 1) on the
   screen. That is what makes a near thing see-through: a stroke thinner
   than c shades only part of each point's cone of light, so its shadow is
   diluted over the circle, faint in proportion — a speck on the glasses is
   not seen at all. The lens is a quarter of the stage wide, so at three
   times life a point spreads over half the stage and the text is a haze
   that condenses as the side lands; a transition can set zoom to start
   nearer or further. The blur is the Gaussian with the
   disc's RMS radius, σ = c/4, and an image's filter is applied in its own
   pixels, before its transform, hence σ/s. --vt-s is the magnification
   itself, registered so that it interpolates alongside the transform and
   the blur is recomputed from it every frame. */
""")
out.append(rule(enter_side("slide"), ["--vt-transform: translateX(var(--vt-push, 100%))"]))
out.append(rule(leave_side("slide"), ["--vt-transform: translateX(calc(-1 * var(--vt-push, 100%)))"]))
out.append(rule(enter_side("rise"), ["--vt-transform: translateY(var(--vt-push, 100%))"]))
out.append(rule(leave_side("rise"), ["--vt-transform: translateY(calc(-1 * var(--vt-push, 100%)))"]))
out.append("""/* A page pushed by its own width is off the screen when it gets there, and
   that is the whole of the effect. A mark is pushed by *its* width, so it
   arrives beside where it started, still on the page and still opaque — and
   the image would then simply cease to exist. So on a mark, and only there,
   the push fades. */
""")
out.append(rule(sum((f(x) for f in (enter_mark, leave_mark) for x in ("slide", "rise")), []), ["--vt-opacity: 0"]))
out.append(rule(enter_side("zoom") + leave_side("zoom"), [
    "--vt-aperture: calc(var(--vt-stage) / 4)", "--vt-opacity: 0",
    "--vt-transform: scale(var(--vt-zoom, 3))", "--vt-s-away: var(--vt-zoom, 3)",
    "filter: blur(calc(var(--vt-aperture) / 4 * (var(--vt-s) - 1) / var(--vt-s)))"]))
out.append("""/* wipe-*: reveal, named by the direction the front travels (wipe-up sweeps
   up from the bottom edge): the new one appears from that edge while the old
   one is covered from the same edge, so at every instant the two tile the
   box; back runs the front the other way. */
""")
wipes = {"wipe-left": ("inset(0 0 0 100%)", "inset(0 100% 0 0)"), "wipe-right": ("inset(0 100% 0 0)", "inset(0 0 0 100%)"),
         "wipe-up": ("inset(100% 0 0 0)", "inset(0 0 100% 0)"), "wipe-down": ("inset(0 0 100% 0)", "inset(100% 0 0 0)")}
for w, (e, l) in wipes.items():
    out.append(rule(enter_side(w), ["--vt-clip: " + e, "--vt-clip-rest: inset(0)"]))
    out.append(rule(leave_side(w), ["--vt-clip: " + l, "--vt-clip-rest: inset(0)"]))
out.append("""/* Opening/closing the overview is a whole-page zoom: the page interpolates as
   one group, and element-level morphs would tear it apart, so the marks' names
   are overridden first (an author !important beats the inline names hoist.js
   wrote on the elements) and they fold back into root to zoom together. */
html:active-view-transition-type(overview) .vt-mark {
  view-transition-name: none !important;
}
@property --vt-s {
  syntax: "<number>";
  inherits: false;
  initial-value: 1;
}
@keyframes vt-enter {
  from {
    opacity: var(--vt-opacity, 1);
    transform: var(--vt-transform, none);
    clip-path: var(--vt-clip, none);
    --vt-s: var(--vt-s-away, 1);
  }
  to {
    opacity: 1;
    transform: none;
    clip-path: var(--vt-clip-rest, none);
    --vt-s: 1;
  }
}
@keyframes vt-leave {
  from {
    opacity: 1;
    transform: none;
    clip-path: var(--vt-clip-rest, none);
    --vt-s: 1;
  }
  to {
    opacity: var(--vt-opacity, 1);
    transform: var(--vt-transform, none);
    clip-path: var(--vt-clip, none);
    --vt-s: var(--vt-s-away, 1);
  }
}
""")
block = "".join(out)

p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deck.css"); s = open(p).read()
a = s.index("/* ── a transition is a pair")
b = s.index("/* ── toolbar / laser pointer")
s = s[:a] + block + "\n" + s[b:]
open(p, "w").write(s)
print("written", len(block.splitlines()), "lines")
