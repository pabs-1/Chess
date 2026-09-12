/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const packageVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

/** Asks git something, or null when there is no repository to ask. */
function git(...args: string[]): string | null {
  try {
    const out = execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const trimmed = out.toString().trim()
    return trimmed === '' ? null : trimmed
  } catch {
    return null
  }
}

/**
 * Which commit this bundle was built from.
 *
 * A deployed site otherwise gives no way to tell a stale build from a current
 * one except by hunting for a changed detail in the interface, which is how a
 * build that never deployed went unnoticed. CI checks out a detached HEAD and
 * usually states the commit itself, so prefer what it says over the clone.
 */
function buildCommit(): string {
  const fromCi =
    process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (fromCi !== undefined && fromCi !== '') return fromCi.slice(0, 7)
  return git('rev-parse', '--short=7', 'HEAD') ?? 'unknown'
}

/**
 * The commit's own date, not the moment of the build: a date that changed on
 * every rebuild would make two builds of identical source look different.
 */
function buildDate(): string {
  return (git('log', '-1', '--format=%cs') ?? new Date().toISOString()).slice(0, 10)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_DATE__: JSON.stringify(buildDate()),
  },
  test: {
    // Everything under analysis/ and the UCI parser is pure: no DOM needed.
    // Add a jsdom project here if component tests are introduced later.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
