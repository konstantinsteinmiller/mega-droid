<template lang="pug">
  //- "Press it once": a yellow arrow driving down onto a bar, over and over —
  //- one press, not a hold (playtest 2026-10-07: under the bouncing arrows
  //- players tapped the shield once and wondered why it only flickered).
  svg.press-cue(viewBox="0 0 40 52" aria-hidden="true")
    g.arrow
      path(d="M14 2 H26 V18 H36 L20 34 L4 18 H14 Z")
    rect.bar(x="4" y="42" width="32" height="7" rx="3.5")
</template>

<style scoped lang="sass">
.press-cue
  display: block
  overflow: visible
  filter: drop-shadow(0 0 6px rgba(255, 216, 74, 0.95)) drop-shadow(0 2px 0 rgba(20, 26, 51, 0.7))
.arrow, .bar
  fill: #ffd84a
  stroke: #141a33
  stroke-width: 2.5
  stroke-linejoin: round
  paint-order: stroke
// The arrow comes down onto the bar and the bar gives under it: a press.
.arrow
  animation: press-arrow 0.7s cubic-bezier(0.5, 0, 0.75, 0) infinite
.bar
  transform-origin: 20px 49px
  animation: press-bar 0.7s ease-out infinite
@keyframes press-arrow
  0%
    transform: translateY(-6px)
  55%
    transform: translateY(6px)
  70%
    transform: translateY(6px)
  100%
    transform: translateY(-6px)
@keyframes press-bar
  0%, 50%
    transform: scaleY(1)
  60%
    transform: scaleY(0.55)
  80%, 100%
    transform: scaleY(1)
@media (prefers-reduced-motion: reduce)
  .arrow, .bar
    animation: none
</style>
