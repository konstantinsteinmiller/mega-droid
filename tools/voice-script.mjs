#!/usr/bin/env node
// ─── pnpm voice:script ───────────────────────────────────────────────────────
//
// Writes voice-todo.md: every voice line (each speaker's text lines in the
// locales, plus the catalogue's barks and laughs) with its file, when it
// plays, its text and its state per language (voiced by which engine, or
// missing). Rendered by src/game/audio/voiceTodo.ts; a test fails when the
// file is stale, and every `pnpm voice:gen` run rewrites it.

import { writeVoiceTodo } from './voice/todo.mjs'

writeVoiceTodo()
