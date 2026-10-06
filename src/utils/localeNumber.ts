/**
 * ─── Numbers a player READS rather than counts ──────────────────────────────
 *
 * `#41032 of 154331` is not two numbers, it is two strings of digits that have
 * to be counted before they mean anything — and a rank you have to count is not
 * a rank. Grouped, `#41,032 of 154,331` states a position at a glance. This is
 * the whole of the leaderboard's readability problem, and it arrives the moment
 * a board passes ten thousand rows.
 *
 * The separator is not the game's to choose. A German player reads `154.331`, a
 * French one `154 331`, an English one `154,331`; picking one house style makes
 * the population look like a decimal in roughly half of any real locale set.
 * `Intl.NumberFormat` already knows every locale a game is likely to ship, so
 * the rule is to ask it rather than to hand-roll a regex with commas.
 *
 * ── Latin digits, on purpose ──
 *
 * `Intl.NumberFormat('ar')` returns `١٥٤٬٣٣١` — correct Arabic, and usually
 * wrong here. In a typical game every other number on screen (coins, score,
 * streak, damage) is painted straight to a canvas as raw Latin digits and goes
 * through no formatter at all, so an Arabic-Indic leaderboard becomes the one
 * panel whose digits do not match the HUD directly above it. Asking for
 * `numberingSystem: 'latn'` keeps the digits and takes only the grouping, which
 * is the half that was wanted. If a game DOES localise its digits everywhere,
 * drop that option here so the board follows the rest rather than fighting it.
 *
 * ── Why the cache ──
 *
 * Constructing an `Intl.NumberFormat` costs far more than formatting with one,
 * and the board modal formats a rank per row for a hundred rows on every open.
 * One instance per locale, kept for the session.
 */

/** One formatter per locale, built on first use. */
const formatters = new Map<string, Intl.NumberFormat>()

const formatterFor = (locale: string): Intl.NumberFormat | null => {
  const hit = formatters.get(locale)
  if (hit) return hit
  try {
    // `latn` is a REQUEST, not a guarantee — a runtime without that numbering
    // system falls back to the locale's own, still better than no grouping.
    const made = new Intl.NumberFormat(locale, { useGrouping: true, numberingSystem: 'latn' })
    formatters.set(locale, made)
    return made
  } catch {
    // A malformed locale tag THROWS rather than falling back, and this runs at
    // a render site on the result screen. Ungrouped digits beat a blank screen,
    // so the caller gets `null` and prints plain ones.
    return null
  }
}

/**
 * A whole number, grouped for `locale` — `154331` → `154,331` / `154.331` /
 * `154 331` / `1,54,331` (Hindi groups in lakhs).
 *
 * Anything not finite returns an empty string rather than `NaN`: this lands in
 * a pill on the result screen, where a blank reads as "not yet" and `NaN` reads
 * as a broken game.
 */
export const formatCount = (value: number, locale: string): string => {
  if (!Number.isFinite(value)) return ''
  const n = Math.trunc(value)
  const fmt = formatterFor(locale)
  return fmt ? fmt.format(n) : String(n)
}

const percents = new Map<string, Intl.NumberFormat>()

/**
 * A share as a percent for `locale`, one decimal at most — `0.028` →
 * `2.8%` / `2,8 %` (fr, de) / `%2,8` (tr). A French playtester read the
 * English "2.8%" as a mistake (2026-10-06). Latin digits, like `formatCount`.
 */
export const formatPercent = (share: number, locale: string): string => {
  if (!Number.isFinite(share)) return ''
  let fmt = percents.get(locale)
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, numberingSystem: 'latn' })
    } catch {
      fmt = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
    }
    percents.set(locale, fmt)
  }
  return fmt.format(Math.round(share * 1000) / 1000)
}

const tenths = new Map<string, Intl.NumberFormat>()

/** A number with one decimal for `locale` — a cooldown's `0.6` / `0,6`. */
export const formatTenths = (value: number, locale: string): string => {
  if (!Number.isFinite(value)) return ''
  let fmt = tenths.get(locale)
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, numberingSystem: 'latn' })
    } catch {
      fmt = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    }
    tenths.set(locale, fmt)
  }
  return fmt.format(value)
}
