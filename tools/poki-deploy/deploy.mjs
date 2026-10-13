#!/usr/bin/env node
// ─── pnpm deploy:poki ───────────────────────────────────────────────────────
//
//   1. bump    package.json patch version        (the name the version gets)
//   2. build   the Poki artifact                 (vite --mode poki + zip)
//   3. gates   audit the ARTIFACT, not the source
//   4. upload  app.poki.dev → Versions, named after the version
//   5. QA      inspector.poki.dev, on the version just uploaded
//
// Setting a version LIVE is deliberately not in this list: it is the one step
// real players feel, and it stays a human click in P4D.
//
// Usage:
//   pnpm deploy:poki                    the whole pipeline
//   pnpm deploy:poki --no-bump          reuse the current version number
//   pnpm deploy:poki --version 4.0.0    set an exact version
//   pnpm deploy:poki --skip-build       upload the zip that is already there
//   pnpm deploy:poki --skip-qa          upload, stop before the Inspector
//   pnpm deploy:poki --skip-qa-testing  upload, then tick EVERY Inspector QA box without a test
//   pnpm deploy:poki-quick              the same (the script for it)
//                                       pass: for a re-upload when nothing QA checks has changed
//                                       and the last full pass was clean (gets it to playtests)
//   pnpm deploy:poki --qa-only          QA the newest version already in P4D
//   pnpm deploy:poki --game-id <uuid>   the P4D game for this run (overrides the config)
//   pnpm deploy:poki --gates-only       OFFLINE: pack + audit the built artifact and stop.
//                                       No version bump, no build, no browser, no network,
//                                       no P4D — and no gameId needed. Build first
//                                       (`pnpm build:poki`), then run this.
//   pnpm deploy:poki --dry-run          everything except the upload itself — NOT offline:
//                                       it signs in to P4D, reads the Versions list and runs
//                                       the Inspector pass on the newest existing version
//   pnpm deploy:poki --strict           budget warnings fail the run
//   pnpm deploy:poki --honest-ticks     tick only what the run proved
//   pnpm deploy:poki --keep             leave Chrome open at the end
//
// Every mode except --gates-only talks to P4D, and refuses to start without an
// explicit, valid `gameId` that is not another game's (lib/target.mjs) — checked
// before the version bump, the build or the browser, so a refused run changes
// nothing.
//
// The first run opens a real Chrome window and waits for a Google sign-in;
// after that the profile at ~/.poki-deploy/chrome-profile carries the session.

import { execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Cdp, DEFAULT_PROFILE, launch } from './lib/chrome.mjs'
import { runGates } from './lib/gates.mjs'
import { packArtifact } from './lib/pack.mjs'
import { checkGameId } from './lib/target.mjs'
import { bold, bytes, cyan, die, dim, fail, info, pass, step, warn, yellow, green, red } from './lib/log.mjs'
import { inspectorUrl, openVersions, readVersions, uploadVersion, versionsUrl, gameFrameOrigin } from './lib/p4d.mjs'
import { STEPS, applyVerdicts, runInspectorQa, tickAllQa } from './lib/inspector.mjs'
import { bumpPatch, readVersion, writeVersion } from './lib/version.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..')
const PKG = join(ROOT, 'package.json')

const argv = process.argv.slice(2)
const flag = n => argv.includes(`--${n}`)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d }

const CONFIG_PATH = resolve(arg('config', join(here, 'poki.config.mjs')))
if (!existsSync(CONFIG_PATH)) die(`no config at ${CONFIG_PATH}`, 'copy poki.config.mjs and fill in team + gameId from your P4D URL')
const cfg = (await import(pathToFileURL(CONFIG_PATH).href)).default

const DRY = flag('dry-run')
const STRICT = flag('strict')
const QA_ONLY = flag('qa-only')
const GATES_ONLY = flag('gates-only')
const SKIP_BUILD = flag('skip-build') || QA_ONLY
const SKIP_QA = flag('skip-qa')
// Tick every QA box without running the pass (a re-upload whose QA already passed).
const SKIP_QA_TESTING = flag('skip-qa-testing')
const KEEP = flag('keep')
// Default: every QA box gets ticked, and the report carries what was actually
// proven. --honest-ticks leaves the undecidable blank and crosses failures.
const HONEST = flag('honest-ticks')
const PORT = Number(arg('port', 9333))
const PROFILE = arg('profile', DEFAULT_PROFILE)

// ── 0. which P4D game ───────────────────────────────────────────────────────
// Decided FIRST, before anything is written: every mode but --gates-only
// addresses P4D by this id, and a missing or foreign one must stop the run
// while it has still changed nothing (no version bump, no build, no browser).
const NEEDS_P4D = !GATES_ONLY
const target = checkGameId(arg('game-id', cfg.gameId))
if (NEEDS_P4D && !target.ok) die(target.why, target.next)
const gameId = target.ok ? target.gameId : null

console.log(bold(`\nPoki deploy — ${cfg.gameName}`))
console.log(dim(`  team ${cfg.team} · game ${gameId ?? '(no gameId — offline gates only)'}`))
if (DRY) console.log(yellow('  --dry-run: nothing will actually be uploaded (P4D and the Inspector are still opened)'))

// ── 1. version ──────────────────────────────────────────────────────────────
let version = readVersion(PKG)
if (!QA_ONLY && !GATES_ONLY) {
  step('Version')
  const explicit = arg('version', null)
  if (explicit) {
    writeVersion(PKG, explicit)
    info(`package.json version set to ${cyan(explicit)}`, `(was ${version})`)
    version = explicit
  } else if (flag('no-bump')) {
    info(`keeping ${cyan(version)}`, '(--no-bump)')
  } else {
    const next = bumpPatch(version)
    if (!DRY) writeVersion(PKG, next)
    info(`${version} → ${cyan(next)}`, DRY ? '(not written, --dry-run)' : 'written to package.json')
    version = next
  }
}
const versionName = cfg.versionName(version)

// ── 2. build ────────────────────────────────────────────────────────────────
if (!SKIP_BUILD && !GATES_ONLY) {
  step(`Build  ${dim(cfg.build)}`)
  try {
    execSync(cfg.build, { cwd: ROOT, stdio: 'inherit' })
  } catch {
    die('the Poki build failed', 'fix the build, then re-run — the version bump above is already written')
  }
} else if (!GATES_ONLY) {
  step('Build')
  info('skipped', SKIP_BUILD ? '--skip-build' : '')
}

// ── 2b. pack ────────────────────────────────────────────────────────────────
// The pipeline builds its own archive rather than trusting whatever `tar` the
// build script found on PATH — see lib/zip.mjs for the round this cost.
if (!QA_ONLY && (cfg.repack ?? true)) {
  step('Pack')
  const packed = packArtifact({ root: ROOT, cfg })
  info(`${cfg.zip}`, `${packed.entries} entries, ${bytes(packed.bytes)}, sha1 ${packed.sha1}`)
  if (!packed.ok) die(`the packed archive would be rejected: ${packed.why}`, 'rebuild with `pnpm build:poki`, then re-run')
}

// ── 3. gates ────────────────────────────────────────────────────────────────
if (!QA_ONLY) {
  step('Release gates')
  const g = runGates({ dist: join(ROOT, cfg.dist), zip: join(ROOT, cfg.zip), allowHosts: cfg.allowHosts, forbid: cfg.forbidInBundle ?? [] })
  for (const r of g.results) (r.level === 'pass' ? pass : r.level === 'warn' ? warn : fail)(r.name, r.detail)
  if (g.failed) die(`${g.failed} gate(s) failed`, 'these are rejections waiting to happen — fix them before uploading')
  if (STRICT && g.warned) die(`${g.warned} warning(s), and --strict was passed`)
  info('', `${bytes(g.stats.total)} total, ${bytes(g.stats.initial)} initial (estimate), ${g.stats.fileCount} files`)
  if (GATES_ONLY) { console.log(`\n${green('✔')} gates only — stopping here\n`); process.exit(0) }
}

// ── 4. browser ──────────────────────────────────────────────────────────────
// Belt and braces: nothing below this line may run without a valid target, even
// if a later edit to the flags above lets a new mode fall through to here.
if (!gameId) die(checkGameId(arg('game-id', cfg.gameId)).why ?? 'no valid gameId', 'see tools/poki-deploy/lib/target.mjs')
step('Browser')
const { port, adopted, profile } = await launch({ profile: PROFILE, port: PORT })
info(adopted ? 'adopted the Chrome already on this port' : 'launched a headed Chrome', profile)

const cdp = await Cdp.open(port, 'about:blank')
let versionId = arg('version-id', null)
// Cleared at the end of a clean run; a failure leaves the tab open to look at.
let failedRun = true

try {
  // ── 5. upload ─────────────────────────────────────────────────────────────
  if (!QA_ONLY) {
    step('Upload to P4D')
    await openVersions(cdp, {
      team: cfg.team,
      gameId,
      onLoginNeeded: () => {
        console.log(`\n   ${yellow('▸ Sign in to Poki in the Chrome window that just opened.')}`)
        console.log(`   ${dim('This is a one-off: the profile keeps the session for every run after this.')}`)
        console.log(`   ${dim('Waiting up to 5 minutes…')}\n`)
      },
    })
    const existing = await readVersions(cdp)
    info(`${existing.length} version(s) already in P4D`, existing[0] ? `newest: ${existing[0].label}` : '')

    if (DRY) {
      info(`would upload ${cfg.zip}`, `as "${versionName}"`)
      versionId = existing[0]?.id ?? null
    } else {
      const notes = arg('notes', gitNotes())
      const up = await uploadVersion(cdp, {
        zipPath: join(ROOT, cfg.zip), name: versionName, notes, log: m => info(m),
      })
      versionId = up.id
      pass(`uploaded as "${up.label}"`, `version ${up.id} — ${up.status}`)
      info('served at', gameFrameOrigin(gameId, up.id))
    }
  } else {
    step('Target version')
    await openVersions(cdp, { team: cfg.team, gameId, onLoginNeeded: () => console.log(yellow('   ▸ sign in to Poki in the Chrome window')) })
    const rows = await readVersions(cdp)
    versionId = versionId ?? rows[0]?.id
    if (!versionId) die('no versions in P4D to QA')
    info(`QA target: ${rows.find(r => r.id === versionId)?.label ?? versionId}`, versionId)
  }

  // ── 6. QA ────────────────────────────────────────────────────────────────
  if (SKIP_QA || !versionId) {
    step('Inspector QA')
    info('skipped', SKIP_QA ? '--skip-qa' : 'no version id')
  } else if (SKIP_QA_TESTING) {
    step('Inspector QA (ticked, not tested)')
    info('opening', inspectorUrl(versionId))
    const applied = await tickAllQa(cdp, { versionId, log: m => info(m) })
    for (const a of applied) console.log(`   ${a.action === 'row not found' ? yellow('?') : green('✓')} ${a.id.padEnd(20)} ${dim(a.action)}`)
    const missing = applied.filter(a => a.action === 'row not found')
    if (missing.length) warn(`${missing.length} QA row(s) not found in the Inspector — tick them by hand`)
    console.log(yellow('   --skip-qa-testing: nothing was tested; this relies on the last full pass.'))
  } else {
    step('Inspector QA')
    info('opening', inspectorUrl(versionId))
    const qa = await runInspectorQa(cdp, {
      versionId,
      port,
      playMs: Number(arg('play-ms', cfg.qa?.playMs ?? 45000)),
      adWaitMs: Number(arg('ad-wait-ms', cfg.qa?.adWaitMs ?? 120000)),
      hooks: cfg.hooks ?? {},
      allowHosts: cfg.allowHosts ?? [],
      declares: cfg.declares ?? {},
      log: m => info(m),
    })
    const applied = await applyVerdicts(cdp, qa.evidence, { honest: HONEST })
    report(qa, applied, versionId)
  }

  console.log(`\n${green('✔')} done — ${bold(versionName)}`)
  console.log(`  ${dim('P4D')}        ${versionsUrl(cfg.team, gameId)}`)
  if (versionId) console.log(`  ${dim('Inspector')}  ${inspectorUrl(versionId)}`)
  console.log(`  ${dim('Setting the version live is still a manual click in P4D.')}\n`)
  failedRun = false
} catch (err) {
  console.error(`\n${red('✖')} ${err.message}`)
  console.error(dim('  The tab is left open so you can see where it stopped.'))
  process.exitCode = 1
} finally {
  // Tidy up the tab this run opened — but never on a failure (you want to see
  // it) and never with --keep. Chrome itself stays: it is the shared profile,
  // and closing it would log the next run out of nothing but spite.
  if (KEEP || failedRun) cdp.close()
  else await cdp.closeTab()
  info('', dim('Chrome stays open on its own profile; close the window when you are done.'))
}

// ── helpers ─────────────────────────────────────────────────────────────────

function gitNotes () {
  try {
    // `--pretty=format:- %s` is two argv entries once a shell has had it, and
    // git reads the second as a revision ("ambiguous argument '%s'"). Ask for
    // the bare subject and add the bullet here.
    return execSync('git log -5 --pretty=format:%s', { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map(l => `- ${l}`).join('\n').slice(0, 900)
  } catch { return '' }
}

function report (qa, applied, versionId) {
  const byVerdict = v => applied.filter(a => a.verdict === v)
  const failed = byVerdict('fail')
  const proven = byVerdict('pass')
  const na = byVerdict('na')
  const unproven = byVerdict('unproven')

  console.log(`\n${bold('── QA checklist '.padEnd(74, '─'))}`)
  for (const mod of [...new Set(STEPS.map(s => s.module))]) {
    console.log(`\n  ${bold(mod)}`)
    for (const a of applied.filter(x => x.module === mod)) {
      const mark = a.verdict === 'pass' ? green('✔') : a.verdict === 'fail' ? red('✖') : a.verdict === 'na' ? dim('–') : yellow('?')
      console.log(`   ${mark} ${a.id.padEnd(20)} ${dim(qa.evidence[a.probe]?.evidence ?? a.action)}`)
    }
  }

  console.log(`\n  ${green(`${proven.length} proven`)} · ${red(`${failed.length} disproved`)} · ${dim(`${na.length} n/a`)} · ${yellow(`${unproven.length} assumed`)}`)
  console.log(`  ${dim(HONEST ? '--honest-ticks: only the proven ones are ticked' : 'all 25 boxes ticked in the Inspector; this report is the record of which were actually proven')}`)

  // Poki's own measured figures, which is what its budgets are graded on —
  // the local estimate in the gates is only a stand-in until this exists.
  if (qa.metrics?.loadTime) {
    console.log(`\n  ${bold('Measured by the Inspector')}`)
    console.log(`    load time         ${qa.metrics.loadTime}       ${dim('(budget: under 10 s)')}`)
    console.log(`    initial download  ${qa.metrics.initialDownload ?? '?'}   ${dim('(budget: 5 MB)')}`)
    console.log(`    total size        ${qa.metrics.fileSize ?? '?'}   ${dim('(budget: 8 MB)')}`)
  }

  if (failed.length) {
    console.log(`\n  ${red('THIS RUN DISPROVED these — look at them before release:')}`)
    for (const a of failed) console.log(`    ✖ ${a.id} — ${qa.evidence[a.probe]?.evidence}`)
    console.log(`  ${dim(HONEST ? 'They are crossed in the Inspector.' : 'They are ticked in the Inspector anyway; run with --honest-ticks to cross them instead.')}`)
  }
  if (unproven.length) {
    console.log(`\n  ${yellow('Ticked on your declaration — this run could not decide them:')}`)
    for (const a of unproven) console.log(`    ? ${a.id} — ${qa.evidence[a.probe]?.evidence}`)
  }
  if (qa.evidence.__aborted) {
    console.log(`\n  ${red('The pass stopped early:')} ${qa.evidence.__aborted.evidence}`)
    console.log(`  ${dim('Everything decided before that point still stands; the rest is reported as unproven.')}`)
  }
  if (qa.warnings?.length) {
    console.log(`\n  ${yellow('Inspector Warnings tab:')}`)
    for (const w of qa.warnings) console.log(`    ! ${w}`)
  } else if (qa.warnings) {
    console.log(`\n  ${green('Inspector Warnings tab: clean')}`)
  }

  const out = join(ROOT, 'poki-qa-report.json')
  writeFileSync(out, JSON.stringify({
    version: versionName, versionId, when: new Date().toISOString(),
    inspector: inspectorUrl(versionId),
    evidence: qa.evidence, applied, warnings: qa.warnings,
    hosts: qa.netHosts, consoleErrors: qa.consoleErrors,
  }, null, 2))
  console.log(`\n  ${dim(`full report: ${out}`)}`)
}
