/* ── waapi · Web Animations, from Typst ─────────────────────────────────
   A binding and nothing else: keyframes and options are what the API takes,
   handed to el.animate() as they are, and what comes back is an Animation —
   the browser's object, with its own play, pause, cancel, reverse,
   currentTime, playbackRate and finished.

   There is no registry here. The platform already keeps one:
   el.getAnimations({ subtree: true }) is every animation under an element, and
   the role each one plays for its host rides on Animation.id, which is a
   string the spec gives us for exactly this. */

window.waapi = window.waapi || (function () {
   "use strict";

   var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

   var api = {
      /* Options as the spec writes them — duration and delay in ms, iterations
         (null: without end), direction, easing as the four numbers of a cubic
         Bézier or a name the browser knows. `role` is stamped on the Animation
         so a host can find its own again. */
      animate: function (el, frames, o, role) {
         var a = el.animate(frames, {
            duration: o.duration, delay: o.delay, direction: o.direction,
            iterations: o.iterations == null ? Infinity : o.iterations,
            easing: Array.isArray(o.easing) ? "cubic-bezier(" + o.easing.join(", ") + ")" : o.easing
         });
         if (role) a.id = role;
         return a;
      },

      /* What is animating under this element, of this role. A paused animation
         is still one of them, which is what makes pause and resume a matter of
         asking the browser rather than keeping a list. */
      of: function (scope, role) {
         return scope.getAnimations({ subtree: true }).filter(function (a) {
            return role == null || a.id === role;
         });
      },

      /* Run an element along an SVG path. `offset-path` takes a path in the
         element's containing block, and an SVG path is in its own user space,
         so it is sampled into a polyline through the screen and back — 240
         points, which is under a tenth of a pixel on a slide-sized curve.
         `origin` is the element whose box the coordinates are relative to, its
         offsetParent unless the host knows better.

         Chrome resolves path() coordinates against the element's own box, the
         spec against the containing block, and offset-position cannot fix it.
         Moving the element to the containing block's origin makes the two
         readings coincide; it starts at 0% anyway, so its rest position is moot.

         Returns the refit: the sampling is in pixels, so whoever owns the
         layout calls it again when the box changes. */
      follow: function (el, path, o, origin) {
         el.style.offsetRotate = o.orient ? "auto" : "0deg";
         el.style.left = el.style.top = "0";
         var fit = function () {
            var m = path.getScreenCTM();
            if (!m) { el.style.offsetPath = "none"; return; }
            var box = (origin || el.offsetParent || document.documentElement).getBoundingClientRect();
            var L = path.getTotalLength(), N = 240, d = [];
            for (var i = 0; i <= N; i++) {
               /* Typst's d starts with "M 0 0 m …": an empty subpath at the origin,
                  where getPointAtLength(0) would land. Start a hair further in. */
               var q = path.getPointAtLength(i ? L * i / N : Math.min(L, 0.01)).matrixTransform(m);
               d.push((i ? "L" : "M") + (q.x - box.left).toFixed(1) + " " + (q.y - box.top).toFixed(1));
            }
            el.style.offsetPath = 'path("' + d.join("") + '")';
         };
         return { anim: api.animate(el, [{ offsetDistance: "0%" }, { offsetDistance: "100%" }], o, o.role), fit: fit };
      },

      /* The browser's own answer to "should anything move at all". */
      reduced: function () { return reduced.matches; },

      /* Whatever the Typst side declared: one element, its keyframes and its
         options, riding on it as data. Applied once per element, so a document
         that grows more of them later only has to say so again. */
      apply: function (root) {
         (root || document).querySelectorAll("[data-waapi]").forEach(function (el) {
            if (el.dataset.waapiOn) return;
            el.dataset.waapiOn = "1";
            var o;
            try { o = JSON.parse(el.dataset.waapi); } catch (e) { return; }
            var a = api.animate(el, o.keyframes, o, o.name ? "waapi:" + o.name : "waapi");
            if (!o.play || reduced.matches) a.pause();
         });
      }
   };

   if (document.readyState === "loading") addEventListener("DOMContentLoaded", function () { api.apply(); });
   else api.apply();
   return api;
})();
