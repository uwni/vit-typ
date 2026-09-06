// Fixture for the transition settings, compiled and read by tools/ui.mjs.
// Three levels of the same knobs: the deck's default, one page's own, one mark's.
#import "../lib.typ": *

#deck(
  title: "knobs",
  transition: (effect: "fade", duration: 1200),
  {
    slide[first]
    slide(transition: (enter: "slide", leave: "zoom", duration: 300, zoom: 6, push: -100%))[second]
    slide[#mark("m", transition: (effect: "wipe-up", duration: 900))[marked] third]
  },
)
