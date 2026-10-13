// Which P4D game a run is allowed to touch.
//
// This repo was forked from another game, and its config still pointed at that
// game's P4D id for a while. Everything the pipeline does in P4D — reading the
// Versions list, uploading, ticking the Inspector checklist — is addressed by
// `gameId` alone, so a stale id does not fail: it uploads THIS build into THAT
// game, under a version name nobody there recognises. Nothing on the P4D side
// stops it.
//
// So the id is never guessed and never defaulted. A run that will reach P4D
// needs an explicit, well-formed id that is not one of the known foreign ones,
// and `deploy.mjs` checks that BEFORE it bumps the version, builds, or starts a
// browser. `--gates-only` never touches P4D and needs no id at all.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * P4D game ids that belong to OTHER games of the same team. A config that
 * carries one of these was copied from that game's repo, and uploading with it
 * would put this build into that game's Versions list.
 */
export const FOREIGN_GAME_IDS = Object.freeze({
  // The predecessor this repo was forked from (its tools/poki-deploy came along).
  '1d51788e-5771-4d70-8290-59366fb9773f': 'Survivalist',
  '9b504ac8-a798-4111-b0e5-a7c569fcec46': 'Mega Droid',
})

/**
 * Validate the id a P4D-bound run would use.
 *
 * @param {unknown} gameId  from `--game-id`, else `poki.config.mjs`
 * @returns {{ ok: true, gameId: string } | { ok: false, why: string, next: string }}
 */
export const checkGameId = (gameId) => {
  const where = 'set `gameId` in tools/poki-deploy/poki.config.mjs, or pass `--game-id <uuid>` for one run. '
    + 'It is the <uuid> in https://app.poki.dev/<team>/games/<uuid>/versions'
  if (gameId === null || gameId === undefined || (typeof gameId === 'string' && gameId.trim() === '')) {
    return { ok: false, why: 'no P4D gameId is configured — refusing to talk to P4D (nothing was uploaded)', next: where }
  }
  if (typeof gameId !== 'string' || !UUID.test(gameId.trim())) {
    return { ok: false, why: `gameId "${String(gameId)}" is not a P4D game uuid — refusing to talk to P4D`, next: where }
  }
  const id = gameId.trim().toLowerCase()
  const owner = FOREIGN_GAME_IDS[id]
  if (owner) {
    return {
      ok: false,
      why: `gameId ${id} is ${owner}'s P4D game, not this one — refusing to upload into another game`,
      next: where,
    }
  }
  return { ok: true, gameId: id }
}
