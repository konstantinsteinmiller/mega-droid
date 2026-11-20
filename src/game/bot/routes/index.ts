import type { Ctx, Task } from '../ctx'
import type { BotMission } from '../view'
import { tutorialRoute } from './tutorial'
import { blazeRoute } from './blaze'
import { cryoRoute } from './cryo'

export type Route = (c: Ctx) => Task

/** The routes by sector (each is a story stage ending in its Core Master). */
const STAGES: Partial<Record<string, Route>> = {
  blaze: blazeRoute,
  cryo: cryoRoute
}

/** The route for a mission: its level's own, or a plain wait (no route yet). */
export const routeFor = (m: BotMission): Route => {
  if (m.setup.tutorial) return tutorialRoute
  const r = STAGES[m.setup.sector]
  if (r) return r
  return function* (c) { c.log(`no route for ${m.setup.sector}`); yield* c.wait(1) }
}
