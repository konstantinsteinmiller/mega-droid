<template lang="pug">
  FModal.cheat-modal(:model-value="true" :title="t('cheat.title')" @update:model-value="(v) => !v && close()")
    div.cheat
      p.note {{ t('cheat.note') }}
      div.grants
        FButton(size="sm" type="primary" :label="t('cheat.unlockAll')" @click="run(unlockAllStory)")
        FButton(size="sm" type="secondary" :label="t('cheat.bolts', { n: boltsText })" @click="run(grantBolts)")
        FButton(size="sm" type="secondary" :label="t('cheat.chips', { n: CHEAT_CHIPS })" @click="run(grantChips)")
        FButton(size="sm" type="secondary" :label="t('cheat.gear')" @click="run(grantEpicBlaster)")
        FButton(size="sm" type="secondary" :label="t('cheat.gels')" @click="run(fillGels)")
      div.grants(v-if="inMission")
        FButton(size="sm" type="success" :label="t('cheat.actLevelUp')" @click="act('levelUp')")
        FButton(size="sm" type="success" :label="t('cheat.actObjective')" @click="act('objective')")
      p.done(v-if="done" role="status") {{ t('cheat.done') }}
      div.d-title {{ t('cheat.doors') }}
      div.rows
        div.row(v-for="r in rows" :key="r.id")
          span.name {{ t(`sector.${r.id}`) }}
          div.btns
            FButton(v-if="r.boss" size="sm" type="danger" :label="t('cheat.boss')" @click="jump(r.id, 'boss', 0)")
            FButton(
              v-for="k in r.challenge"
              :key="k"
              size="sm"
              type="warning"
              :label="r.challenge > 1 ? t('cheat.challengeN', { n: k }) : t('cheat.challenge')"
              @click="jump(r.id, 'challenge', k - 1)"
            )
      div.d-title {{ t('cheat.climbs') }}
      div.rows
        div.row(v-for="r in climbRows" :key="r.id")
          span.name {{ t(`sector.${r.id}`) }}
          div.btns
            FButton(
              v-for="(c, k) in r.climbs"
              :key="k"
              size="sm"
              :type="c.kind === 'battle' ? 'danger' : c.kind === 'shortcut' ? 'warning' : 'secondary'"
              :label="climbLabel(c)"
              @click="climb(r.id, k)"
            )
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import { cheatUi } from '@/use/useCheats'
import { formatCount, formatTenths } from '@/utils/localeNumber'
import { SECTORS } from '@/game/data/regions'
import {
  CHEAT_BOLTS, CHEAT_CHIPS, unlockAllStory, grantBolts, grantChips, grantEpicBlaster, fillGels,
  storyDoors, jumpToDoor, playCelebration, storyClimbs, jumpToClimb, type DoorKind, type ClimbWarp
} from '@/game/cheatPanel'
import type { CelebrationKind } from '@/game/state/celebrate'
import { flow } from '@/game/flow'
import type { SectorId } from '@/game/world/themes'

/**
 * The cheat panel (#Cheat1, ctrl+shift+alt+F1 with cheats on): grants, every
 * story mission unlocked, and a jump to the front of each story map's boss
 * and challenge doors and of each wall climb. The game is paused under it like under any modal;
 * Esc, the X or the backdrop close it.
 */
const { t, locale } = useI18n()
const boltsText = computed(() => formatCount(CHEAT_BOLTS, locale.value))
const done = ref(false)

/** Each sector's story map, counted once per opening. */
const rows = SECTORS.map(s => ({ id: s.id, ...storyDoors(s.id) }))

/** Each story map's climbs (#Climb1); the tutorial has none. Flux is
 *  deployed first unless he is already in that mission. */
const climbRows = SECTORS.map(s => ({ id: s.id, climbs: storyClimbs(s.id) })).filter(r => r.climbs.length)

const climbLabel = (c: Omit<ClimbWarp, 'spot'>): string =>
  c.kind === 'practice' ? t('cheat.practice')
    : c.kind === 'shortcut' ? t('cheat.shortcutStart')
      : c.kind === 'battle' ? t('cheat.battleRoom')
        : t('cheat.climbN', { n: c.n, h: formatTenths(c.h, locale.value) })

const climb = (sector: SectorId, index: number) => {
  close()
  void jumpToClimb(sector, index)
}

const close = () => { cheatUi.open = false }

const run = (fn: () => void) => {
  fn()
  done.value = true
}

const jump = (sector: SectorId, kind: DoorKind, index: number) => {
  close()
  void jumpToDoor(sector, kind, index)
}

/** The acts are drawn by the mission HUD only. */
const inMission = computed(() => flow.screen === 'mission')

/** Close first, so the act plays over the running game, not under the panel. */
const act = (kind: CelebrationKind) => {
  close()
  playCelebration(kind)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  close()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<style scoped lang="sass">
.cheat
  color: #fff
  font-family: var(--font-ui)
  display: flex
  flex-direction: column
  gap: 0.6rem
  max-width: 40em
.note
  margin: 0
  opacity: 0.75
  font-size: 0.85rem
.grants
  display: flex
  flex-wrap: wrap
  gap: 0.5rem
.done
  margin: 0
  color: #7dff9a
  font-size: 0.85rem
.d-title
  font-weight: 700
  margin-top: 0.25rem
.rows
  display: flex
  flex-direction: column
  gap: 0.35rem
.row
  display: flex
  align-items: center
  justify-content: space-between
  gap: 0.5rem
  flex-wrap: wrap
.name
  min-width: 9em
.btns
  display: flex
  flex-wrap: wrap
  gap: 0.4rem
</style>
