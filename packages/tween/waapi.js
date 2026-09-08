/* ── waapi · Web Animations, from Typst ─────────────────────────────────
   A binding: keyframes and options are the API's own, and what comes back is
   the browser's Animation. There is no registry — getAnimations({subtree})
   is one already, and the role an animation plays for its host rides on
   Animation.id. */

window.waapi ??= (() => {
   "use strict";

   const reduced = matchMedia("(prefers-reduced-motion: reduce)");

   /* Followed paths are sampled in pixels, so they are measured again whenever
      the layout can have moved. Measurements, not animations. */
   const fits = [];
   addEventListener("resize", () => fits.forEach(f => f()));

   const api = {
      /* Options as the spec writes them; `iterations: null` is without end, and
         `easing` may be the four numbers of a cubic Bézier. `role` is stamped
         on the Animation so a host can find its own again. */
      animate(el, frames, o, role) {
         const a = el.animate(frames, {
            duration: o.duration,
            delay: o.delay,
            direction: o.direction,
            iterations: o.iterations ?? Infinity,
            easing: Array.isArray(o.easing) ? `cubic-bezier(${o.easing.join(", ")})` : o.easing,
         });
         if (role) a.id = role;
         return a;
      },

      /* What is animating under this element, of this role — paused ones
         included, which is what makes pause and resume a question, not a list. */
      of: (scope, role) =>
         scope.getAnimations({ subtree: true }).filter(a => role == null || a.id === role),

      /* Run an element along an SVG path. `offset-path` wants the path in the
         element's containing block and an SVG path is in its own user space, so
         it is sampled into a polyline through the screen and back.

         Chrome resolves those coordinates against the element's own box and the
         spec against the containing block, and offset-position cannot fix it;
         moving the element to the origin makes the two readings coincide, and
         it starts at 0% anyway. Returns the refit for whoever owns the layout. */
      follow(el, path, o, origin) {
         el.style.offsetRotate = o.orient ? "auto" : "0deg";
         el.style.left = el.style.top = "0";
         const fit = () => {
            const m = path.getScreenCTM();
            if (!m) { el.style.offsetPath = "none"; return; }
            const box = (origin ?? el.offsetParent ?? document.documentElement).getBoundingClientRect();
            const L = path.getTotalLength(), N = 240;
            const d = Array.from({ length: N + 1 }, (_, i) => {
               /* Typst's d opens with an empty subpath at the origin, where
                  getPointAtLength(0) lands. Start a hair further in. */
               const q = path.getPointAtLength(i ? (L * i) / N : Math.min(L, 0.01)).matrixTransform(m);
               return `${i ? "L" : "M"}${(q.x - box.left).toFixed(1)} ${(q.y - box.top).toFixed(1)}`;
            });
            el.style.offsetPath = `path("${d.join("")}")`;
         };
         return { anim: api.animate(el, [{ offsetDistance: "0%" }, { offsetDistance: "100%" }], o, o.role), fit };
      },

      /* The browser's own answer to "should anything move at all". */
      reduced: () => reduced.matches,

      /* Whatever the Typst side declared for one element: its keyframes and its
         options, or a path to run along. */
      start(el, o) {
         if (el.dataset.waapiOn) return null;
         el.dataset.waapiOn = "1";
         const role = o.name ? `waapi:${o.name}` : "waapi";
         let a;
         if (o.follow) {
            const track = document.querySelector(`[data-typst-label="waapi-track:${o.follow}"] path`);
            if (!track) {
               console.info(`[waapi] no track named ${o.follow} on this page, or it has no path`);
               return null;
            }
            const run = api.follow(el, track, { ...o, role }, null);
            fits.push(run.fit);
            run.fit();
            a = run.anim;
         } else a = api.animate(el, o.keyframes, o, role);
         if (!o.play || reduced.matches) a.pause();
         return a;
      },
   };

   /* Around the thing it moves where an element could be written; outside the
      frames, pointing at the ordinal in a label, where none could. */
   customElements.define("waapi-anim", class extends HTMLElement {
      connectedCallback() {
         /* Upgraded mid-parse, its children are not there yet and neither is
            what it points at. */
         if (document.readyState === "loading") {
            addEventListener("DOMContentLoaded", () => this.run(), { once: true });
            return;
         }
         this.run();
      }
      run() {
         let o;
         try { o = JSON.parse(this.dataset.spec); } catch { return; }
         const { at } = this.dataset;
         const el = at == null ? this : document.querySelector(`[data-typst-label="waapi-anim@${at}"]`);
         if (el) api.start(el, o);
      }
   });

   return api;
})();
