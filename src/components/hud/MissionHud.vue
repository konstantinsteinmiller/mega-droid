<template lang="pug">
  ScreenFx
  TrainingFrame
  DamageMarkers
  HudLayout
  FloatingText
  Crosshair
  FluxBubble
  Compass
  ObjectiveLocator
  TargetFrame(v-if="!hud.bossName")
  BossBar
  SkyClock
  TitleCard
  LootCard
  ControlHints
  LessonLayer
  DoorPrompt
  HudBars
  ObjectiveTracker
  LevelUpPop
  TopStatus(@pause="emit('pause')")
  Joystick
  ContextButtons
  ActionButtons
  TutorialChecklist
  LessonPointer
  LessonGlyph
  FreezeSpotlight
  InputCue
</template>

<script setup lang="ts">
import { hud } from '@/game/state/hud'
import ScreenFx from '@/components/hud/ScreenFx.vue'
import TrainingFrame from '@/components/hud/TrainingFrame.vue'
import DamageMarkers from '@/components/hud/DamageMarkers.vue'
import HudLayout from '@/components/hud/HudLayout.vue'
import FloatingText from '@/components/hud/FloatingText.vue'
import Crosshair from '@/components/hud/Crosshair.vue'
import FluxBubble from '@/components/hud/FluxBubble.vue'
import Compass from '@/components/hud/Compass.vue'
import ObjectiveLocator from '@/components/hud/ObjectiveLocator.vue'
import TargetFrame from '@/components/hud/TargetFrame.vue'
import BossBar from '@/components/hud/BossBar.vue'
import SkyClock from '@/components/hud/SkyClock.vue'
import TitleCard from '@/components/hud/TitleCard.vue'
import LootCard from '@/components/hud/LootCard.vue'
import ControlHints from '@/components/hud/ControlHints.vue'
import LessonLayer from '@/components/hud/LessonLayer.vue'
import DoorPrompt from '@/components/hud/DoorPrompt.vue'
import HudBars from '@/components/hud/HudBars.vue'
import ObjectiveTracker from '@/components/hud/ObjectiveTracker.vue'
import LevelUpPop from '@/components/hud/LevelUpPop.vue'
import TopStatus from '@/components/hud/TopStatus.vue'
import Joystick from '@/components/hud/Joystick.vue'
import ContextButtons from '@/components/hud/ContextButtons.vue'
import ActionButtons from '@/components/hud/ActionButtons.vue'
import TutorialChecklist from '@/components/hud/TutorialChecklist.vue'
import LessonPointer from '@/components/hud/LessonPointer.vue'
import LessonGlyph from '@/components/hud/LessonGlyph.vue'
import FreezeSpotlight from '@/components/hud/FreezeSpotlight.vue'
import InputCue from '@/components/hud/InputCue.vue'

const emit = defineEmits<{ pause: [] }>()
</script>
