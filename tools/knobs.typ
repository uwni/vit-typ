// Fixture for the transition settings, compiled and read by tools/ui.mjs.
// Three levels of the same knobs: the deck's default, one page's own, one mark's.
#import "../lib.typ": *

#deck(
  title: "knobs",
  transition: (effect: "fade", duration: 1200),
  {
    slide[first]
    slide(transition: (
      enter: (effect: "slide", duration: 200, push: -100%),
      leave: (effect: "zoom", duration: 900, zoom: 6),
      easing: (0.4, 0, 0.2, 1),
    ))[second]
    slide[#mark("m", transition: (effect: "wipe-up", duration: 900, fit: "none", anchor: right + bottom))[marked] third]
  },
)
