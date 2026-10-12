<template lang="pug">
  //- The charged shot as the game draws it in flight: a white-hot cyan plasma
  //- ball in its halo, speed streaks behind it, sparks crackling off it.
  //- Drawn on the fire knob (playtest 2026-10-08: the old capsule glyph read
  //- as anything but "shoot, hold to charge").
  svg.fire-glyph-svg(viewBox="0 0 100 100" aria-hidden="true" focusable="false")
    defs
      radialGradient#fg-core(cx="0.42" cy="0.38" r="0.62")
        stop(offset="0" stop-color="#ffffff")
        stop(offset="0.38" stop-color="#d9fdff")
        stop(offset="0.7" stop-color="#5fe3ff")
        stop(offset="1" stop-color="#1f8fe0")
      radialGradient#fg-halo(cx="0.5" cy="0.5" r="0.5")
        stop(offset="0.55" stop-color="#7ff4ff" stop-opacity="0.85")
        stop(offset="1" stop-color="#7ff4ff" stop-opacity="0")
    //- Speed streaks: an outline under, the glow on top.
    g.streaks(stroke-linecap="round")
      path(d="M10 37 H40 M4 50 H36 M10 63 H40" stroke="#141a33" stroke-width="9")
      path(d="M10 37 H40 M4 50 H36 M10 63 H40" stroke="#bff8ff" stroke-width="4.5")
    circle(cx="60" cy="50" r="34" fill="url(#fg-halo)")
    circle(cx="60" cy="50" r="27" fill="none" stroke="#141a33" stroke-width="3" opacity="0.55")
    circle(cx="60" cy="50" r="21" fill="url(#fg-core)" stroke="#141a33" stroke-width="3.5")
    ellipse(cx="53" cy="42" rx="6.5" ry="4.5" fill="#ffffff" opacity="0.9")
    //- Sparks: four-point stars off the ball's front.
    g(fill="#ffffff" stroke="#141a33" stroke-width="2" stroke-linejoin="round")
      path(d="M86 22 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5z")
      path(d="M89 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z")
      path(d="M64 8 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z")
</template>

<style scoped lang="sass">
.fire-glyph-svg
  display: block
  overflow: visible
  filter: drop-shadow(0 2px 0 rgba(20, 26, 51, 0.55))
</style>
