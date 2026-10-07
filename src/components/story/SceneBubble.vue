<template lang="pug">
  div.scene-say(aria-live="polite")
    div.bubble(
      v-if="sceneUi.key"
      :key="sceneUi.seq"
      :class="[sceneUi.speaker, sceneUi.place]"
    )
      //- His face with his words (#112: Vex spoke with no face on screen).
      img.face(v-if="sceneUi.speaker === 'vex' && vexFace" :src="vexFace" alt="" aria-hidden="true")
      span.who(v-if="sceneUi.speaker !== 'vex'") {{ t(`ending.speaker.${sceneUi.speaker}`) }}
      span.text {{ text }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { sceneUi, setSceneTextLookup } from '@/game/story/vexScene'
import { loadStreetModule } from '@/game/lazy'

/**
 * The voiced story scenes' bubble (`story/vexScene.ts`): Dr. Vex's ornate red
 * transmission (the intro's style), or Atlas's cyan one where Atlas has no
 * bubble of its own (the hub). Placed by the scene: beside the boss's title
 * card, top centre, or centre. Read to screen readers as it changes.
 */
const { t } = useI18n()
const fill = (params: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, t(v)]))
const text = computed(() => (sceneUi.key ? t(sceneUi.key, fill(sceneUi.params)) : ''))

/** Dr. Vex's red skull face, the same picture as his holograms (once). */
const vexFace = ref('')
onMounted(async () => {
  setSceneTextLookup((key, params) => t(key, fill(params)))
  try {
    const { vexFaceTexture } = await loadStreetModule()
    const img = vexFaceTexture().image as HTMLCanvasElement | undefined
    vexFace.value = img?.toDataURL?.('image/png') ?? ''
  } catch { vexFace.value = '' }
})
onUnmounted(() => setSceneTextLookup(null))
</script>

<style scoped lang="sass">
.face
  float: left
  width: clamp(44px, 9vmin, 64px)
  height: auto
  margin: -4px 10px 0 -4px
  border-radius: 10px
  background: #1a0508
  box-shadow: 0 0 10px rgba(255, 45, 63, 0.6)
.scene-say
  position: absolute
  inset: 0
  pointer-events: none
  // Over the hub's scene picture (35) and the ending's sting (20).
  z-index: 40
.bubble
  position: absolute
  left: 50%
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15em
  max-width: min(78vw, 440px)
  padding: 0.55em 1.1em 0.65em
  font-family: var(--font-ui)
  font-size: clamp(13px, 2.9vmin, 22px)
  line-height: 1.2
  text-align: center
  transform: translateX(-50%)
  animation: scene-pop 0.32s cubic-bezier(0.2, 1.5, 0.45, 1) both
  &.top
    top: calc(env(safe-area-inset-top, 0px) + clamp(56px, 11vh, 110px))
  // Under the boss's title card (its name and sector sit at 38–50 %).
  &.title
    top: 62%
  &.center
    top: 40%
  // A cutscene's caption: low, clear of the picture.
  &.low
    top: auto
    bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(64px, 14vh, 120px))
// Dr. Vex: ornate, gilded and red (the intro's bubble).
.vex
  background: radial-gradient(ellipse at 50% 30%, #c4162c, #6a0714 80%)
  color: #fff4d6
  border: 3px solid #ffd35a
  outline: 3px solid #6a0714
  box-shadow: 0 0 0 6px #ffd35a33, 0 6px 0 rgba(20, 0, 6, 0.55), 0 0 26px rgba(255, 45, 63, 0.55)
  border-radius: 1.4em
  letter-spacing: 0.02em
  text-shadow: 0 2px 0 #3a0008
// Atlas: the mission bubble's white and cyan.
.atlas
  background: #ffffff
  color: #141a33
  border: 3px solid #141a33
  border-radius: 1.1em
  box-shadow: 0 0 0 2px #6ff2ff, 0 4px 0 rgba(20, 26, 51, 0.4)
  .who
    color: #20b8d0
// Pip: the lab's small helper, in its warm amber.
.pip
  background: #fffaf0
  color: #141a33
  border: 3px solid #141a33
  border-radius: 1.1em
  box-shadow: 0 0 0 2px #ffc21a, 0 4px 0 rgba(20, 26, 51, 0.4)
  .who
    color: #c98a00
.who
  font-size: 0.62em
  letter-spacing: 0.12em
  text-transform: uppercase
.text
  overflow-wrap: anywhere
@keyframes scene-pop
  0%
    transform: translateX(-50%) scale(0.4)
    opacity: 0
  60%
    transform: translateX(-50%) scale(1.06)
    opacity: 1
  100%
    transform: translateX(-50%) scale(1)
@media (prefers-reduced-motion: reduce)
  .bubble
    animation: none
</style>
