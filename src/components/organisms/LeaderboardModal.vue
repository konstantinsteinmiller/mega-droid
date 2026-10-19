<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// The project's own modal shell — swap this for whatever it already uses. The
// board below is just a grid; it does not care what frames it.
import FModal from '@/components/molecules/FModal.vue'
import { playerDisplayName } from '@/use/usePlayerIdentity'
import {
  ensureBoard, leaderboard, leaderboardFailed,
  leaderboardListEnabled, leaderboardPending, playerTotal, rankFor, rankTotalFor
} from '@/use/useLeaderboard'
import { formatCount } from '@/utils/localeNumber'
import {
  ensurePortalBoard, portalBoardLabel, portalBoardLoaded, portalBoardPending,
  portalBoardVisible, portalEntries
} from '@/use/usePortalLeaderboard'

/**
 * ─── The global board ───────────────────────────────────────────────────────
 *
 * The top 100 by `score`, with `flair` as the second column — two players on
 * the same score are not the same player, and the flair is what they compare.
 *
 * Four states, and three of them are not the happy one: still loading, nothing
 * to show, and the endpoint is unreachable. All three have to say something
 * plain, because a leaderboard that opens onto a blank rectangle reads as a
 * broken game rather than a quiet network.
 *
 * The player is told where they stand even when they are not on the board —
 * that footer is the whole reason a player who is #4 000 opens this screen at
 * all.
 */

const model = defineModel<boolean>({ required: true })

/** The player's LIFETIME BEST, same as `RankBadge` — a prop, so this component
 *  does not need to know where the game keeps it. */
const props = defineProps<{ score: number }>()

const { t, locale } = useI18n()

/**
 * Every number on this board is grouped for the active locale — the ranks down
 * the left, and the population in the footer. A hundred rows of ungrouped
 * six-digit ranks is the exact case grouping exists for. Reading `locale.value`
 * inside a render keeps it reactive across a language change.
 */
const fmt = (n: number): string => formatCount(n, locale.value)

const entries = computed(() => leaderboard.value?.entries ?? [])

/**
 * The name the player's row would carry.
 *
 * Resolved lazily rather than at import time: `resolveIdentity` mints and
 * persists an id on its first call, and doing that before the player has ever
 * opened the board would put an identity in the save of someone who never used
 * the feature.
 */
const ownName = ref('')

/**
 * Highlight the player's own row.
 *
 * A NAME MATCH, not an id match, and it can false-positive: the board endpoint
 * publishes no ids (deliberately — a public id is a public write key), so two
 * players who both called themselves "Ace" both get the highlight. That is the
 * right trade here. The alternative is highlighting nothing, and the row a
 * player came to find is the only row on the screen they care about.
 */
const isYou = (name: string): boolean => ownName.value.length > 0 && name === ownName.value

const onBoard = computed(() => entries.value.some((e) => isYou(e.name)))

/** The player's own rank, for the footer. `0` means "nothing to say yet". */
const ownRank = computed(() => rankFor(props.score))

/** Always a number. Below the published cut `rankFor` ranks against the
 *  histogram, or estimates — it never hands back a "past the last row we can
 *  see" sentinel for this to render, because that is not a placing. */
const ownRankLabel = computed(() => fmt(ownRank.value))

/** The bare placing, for the rare board that produced a rank but no population
 *  — a `/score` reply landing before any `/top` has. Built in `<script>`
 *  because pug reads a leading `#` in a template as an id shorthand. */
const ownRankHash = computed(() => `#${ownRankLabel.value}`)

const showOwnRank = computed(() => !onBoard.value && ownRank.value !== 0)

const showLoading = computed(() => leaderboardPending.value && entries.value.length === 0)
const showFailed = computed(() =>
  !leaderboardPending.value && leaderboardFailed.value && entries.value.length === 0)
const showEmpty = computed(() =>
  !leaderboardPending.value && !leaderboardFailed.value && leaderboard.value !== null
  && entries.value.length === 0)

/**
 * ─── The portal's own board, as a second tab (Phase 8) ─────────────────────
 *
 * On Playgama the portal runs a live leaderboard of its own and draws no UI for
 * it (`in_game`), so it gets a tab here. Only a tab: the badge and this modal's
 * footer stay on OUR board, because two rank sources on one screen that
 * disagree read as a bug.
 *
 * No tabs at all on a build without one — `portalBoardVisible` is false — so
 * the modal keeps its title exactly as before. And no error state for the
 * portal board: a read that fails hides the tab, and a tab that vanishes while
 * selected drops the player back onto ours via `showPortal`.
 *
 * The `tabs` / `activeTab` props are the project's modal shell's (FModal
 * renders them in place of the title ribbon). A shell without tabs needs its
 * own two-button row with `role="tablist"` / `role="tab"` / `aria-selected`.
 */
/**
 * A build whose own list is BAKED (Playgama) opens this modal only for the
 * portal's board (`boardModalEnabled`): one tab, the portal's, and never our
 * modelled rows — they would be invented people. The footer goes with our list.
 */
const portalOnly = !leaderboardListEnabled

const activeTab = ref<'global' | 'portal'>(portalOnly ? 'portal' : 'global')

const tabs = computed(() => portalBoardVisible.value && portalBoardLabel.value
  ? portalOnly
    // A brand name, deliberately untranslated.
    ? [{ label: portalBoardLabel.value, value: 'portal' }]
    : [
    { label: t('leaderboard.tabGlobal'), value: 'global' },
    // A brand name, deliberately untranslated.
    { label: portalBoardLabel.value, value: 'portal' }
  ]
  : [])

const showPortal = computed(() => portalOnly || (portalBoardVisible.value && activeTab.value === 'portal'))
const showPortalLoading = computed(() => portalBoardPending.value && portalEntries.value.length === 0)
const showPortalEmpty = computed(() =>
  !portalBoardPending.value && portalBoardLoaded.value && portalEntries.value.length === 0)
/** Portal-only, and its read failed: the plain "couldn't reach" line, never our list. */
const showPortalFailed = computed(() => portalOnly && !portalBoardPending.value && !portalBoardVisible.value)

// Fetched on OPEN, not on mount: the modal is mounted for the whole session and
// most sessions never open it. `ensureBoard` is idempotent and cached, so a
// player who opens the board six times still costs one request — and a previous
// failure is retried, which makes reopening the screen the retry button.
watch(model, (open) => {
  if (!open) return
  void ensureBoard()
  // Same rules for the portal's board; a no-op on every build without one.
  void ensurePortalBoard()
  void playerDisplayName().then((name) => { ownName.value = name })
}, { immediate: true })
</script>

<template lang="pug">
  FModal(
    v-model="model"
    v-model:activeTab="activeTab"
    :title="t('leaderboard.title')"
    :tabs="tabs"
  )
    //- The portal's board: rank, name, score — it has no flair column. Its own
    //- row is matched by the PORTAL's player id, not by name.
    div.board(v-if="showPortal")
      div.board__head.is-portal
        span.board__col.is-rank {{ t('leaderboard.rank') }}
        span.board__col.is-name {{ t('leaderboard.player') }}
        span.board__col.is-score {{ t('leaderboard.score') }}

      div.board__state(v-if="showPortalLoading") {{ t('leaderboard.loading') }}
      div.board__state.is-failed(v-else-if="showPortalFailed") {{ t('leaderboard.failed') }}
      div.board__state(v-else-if="showPortalEmpty") {{ t('leaderboard.empty') }}

      div.board__list(v-else)
        div.board-row.is-portal(
          v-for="(entry, i) in portalEntries"
          :key="`portal-${entry.rank}-${i}`"
          :class="{ 'is-you': entry.isYou }"
        )
          span.board-row__rank {{ fmt(entry.rank) }}
          span.board-row__name
            //- A guest may have no name on the portal's board.
            span.board-row__name-text {{ entry.name || t('leaderboard.player') }}
            span.board-row__you(v-if="entry.isYou") {{ t('leaderboard.you') }}
          span.board-row__score {{ entry.score }}

    div.board(v-else)
      div.board__head
        span.board__col.is-rank {{ t('leaderboard.rank') }}
        span.board__col.is-name {{ t('leaderboard.player') }}
        span.board__col.is-score {{ t('leaderboard.score') }}
        span.board__col.is-flair {{ t('leaderboard.flair') }}

      div.board__state(v-if="showLoading") {{ t('leaderboard.loading') }}
      div.board__state.is-failed(v-else-if="showFailed") {{ t('leaderboard.failed') }}
      div.board__state(v-else-if="showEmpty") {{ t('leaderboard.empty') }}

      div.board__list(v-else)
        div.board-row(
          v-for="(entry, i) in entries"
          :key="`${entry.rank}-${entry.name}-${i}`"
          :class="{ 'is-you': isYou(entry.name) }"
        )
          span.board-row__rank {{ fmt(entry.rank) }}
          span.board-row__name
            span.board-row__name-text {{ entry.name }}
            span.board-row__you(v-if="isYou(entry.name)") {{ t('leaderboard.you') }}
          //- Lifetime XP runs to six figures: grouped like every other number
          //- here, or the column is strings of digits to count.
          span.board-row__score {{ fmt(entry.score) }}
          span.board-row__flair {{ entry.flair }}

      //- Where the player stands when they are not up there. The reason a
      //- player outside the top 100 opens this screen at all.
      //-
      //- ONE message, not a rank span plus an "of N" span, and it is worth
      //- resisting the urge to split it for styling. Two reasons:
      //-
      //-   • WORD ORDER. Japanese is "{total} 人中 #{n} 位"; Korean, Turkish and
      //-     Kazakh also lead with the population. A split renders every one of
      //-     them backwards, and a locale-parity test cannot see it, because
      //-     both halves are present and correctly translated.
      //-   • The two conventions for `yourRank` — "You are #{n}" and
      //-     "You are #{n} of {total}" — both exist in the wild, and a project
      //-     that inherits its locale files from another game usually has the
      //-     second. Combined with a separate "of N" span and a call site that
      //-     passes only `{ n }`, vue-i18n drops the missing parameter and the
      //-     footer reads "You are #1,130 of  of 2,531". Passing both into one
      //-     message makes that impossible rather than merely unlikely.
      //-
      //- `of` still exists — it belongs to the compact RankBadge, where a chip
      //- has no room for a sentence.
      div.board__footer(v-if="showOwnRank")
        span.board__footer-rank(v-if="playerTotal > 0") {{ t('leaderboard.yourRank', { n: ownRankLabel, total: fmt(rankTotalFor(props.score)) }) }}
        span.board__footer-rank(v-else) {{ ownRankHash }}
</template>

<style scoped lang="sass">
// One grid template, shared by the header and every row, so the columns line up
// without a table and without a fixed width anywhere. The name column is the
// only flexible one — the three numbers are as wide as their content and no
// wider, which is what keeps four columns on a 320 px screen.
$cols: clamp(1.6rem, 8vw, 2.4rem) minmax(0, 1fr) clamp(2rem, 9vw, 3rem) clamp(2.2rem, 10vw, 3.4rem)
// The portal's board has no flair column, so the name takes that width.
$cols-portal: clamp(1.6rem, 8vw, 2.4rem) minmax(0, 1fr) clamp(2rem, 9vw, 3rem)

.board
  display: flex
  flex-direction: column
  gap: clamp(0.15rem, 0.8vw, 0.3rem)
  width: 100%

.board__head
  display: grid
  grid-template-columns: $cols
  gap: clamp(0.3rem, 2vw, 0.6rem)
  padding: 0 clamp(0.3rem, 1.6vw, 0.6rem) clamp(0.15rem, 0.8vw, 0.3rem)
  border-bottom: 2px solid rgba(255, 255, 255, 0.12)

  &.is-portal
    grid-template-columns: $cols-portal

.board__col
  color: #9fb2d0
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.02em
  font-size: clamp(0.5rem, 2.2vw, 0.65rem)
  text-align: right

  &.is-rank, &.is-name
    text-align: left

.board__list
  display: flex
  flex-direction: column
  gap: clamp(0.15rem, 0.8vw, 0.3rem)

.board-row
  display: grid
  grid-template-columns: $cols

  &.is-portal
    grid-template-columns: $cols-portal
  align-items: center
  gap: clamp(0.3rem, 2vw, 0.6rem)
  padding: clamp(0.22rem, 1.2vw, 0.42rem) clamp(0.3rem, 1.6vw, 0.6rem)
  border: 2px solid transparent
  border-radius: clamp(0.35rem, 1.8vw, 0.6rem)
  background-color: rgba(0, 0, 0, 0.22)

  // Zebra striping rather than a border per row: 100 rows of border is a wall.
  &:nth-child(even)
    background-color: rgba(0, 0, 0, 0.08)

  // The row the player came here to find.
  &.is-you
    border-color: #ffcd00
    background-image: linear-gradient(to bottom, #3a4a24, #2a3a18)
    background-color: transparent

.board-row__rank
  color: #ffd93c
  font-weight: 900
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: left
  text-shadow: 1px 1px 0 #000

.board-row__name
  display: flex
  align-items: baseline
  gap: 0.35em
  min-width: 0

.board-row__name-text
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  color: #fff
  font-weight: 700
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: left

.board-row__you
  flex: 0 0 auto
  color: #ffcd00
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.03em
  font-size: clamp(0.45rem, 2vw, 0.6rem)

.board-row__score
  color: #8fd6ff
  font-weight: 900
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: right
  text-shadow: 1px 1px 0 #000

.board-row__flair
  color: #b9cbe8
  font-weight: 700
  font-size: clamp(0.6rem, 2.6vw, 0.8rem)
  text-align: right

.board__state
  padding: clamp(1rem, 8vw, 2.5rem) clamp(0.5rem, 3vw, 1rem)
  color: #b9cbe8
  font-weight: 700
  text-align: center
  font-size: clamp(0.65rem, 3vw, 0.9rem)
  line-height: 1.35

  &.is-failed
    color: #ffa6a6

.board__footer
  display: flex
  flex-wrap: wrap
  align-items: baseline
  justify-content: center
  gap: 0.15rem 0.4rem
  margin-top: clamp(0.2rem, 1.2vw, 0.45rem)
  padding: clamp(0.3rem, 1.6vw, 0.55rem) clamp(0.4rem, 2vw, 0.8rem)
  border: 2px solid #ffcd00
  border-radius: clamp(0.35rem, 1.8vw, 0.6rem)
  background-color: rgba(0, 0, 0, 0.3)

.board__footer-rank
  color: #ffd93c
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.68rem, 3.2vw, 0.95rem)
  text-shadow: 2px 2px 0 #000
  // No second, dimmer rule for the population. Styling the two numbers apart is
  // what motivates splitting the sentence, and the sentence must not be split —
  // see the template. If the footer needs the population to recede, do it with
  // the whole line's weight, not by cutting the message in half.
</style>
