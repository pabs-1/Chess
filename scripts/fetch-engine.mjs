#!/usr/bin/env node
/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Copies the Stockfish WebAssembly build from node_modules into public/engine/.
 *
 * The engine binaries are ~7 MB and are GPLv3 artefacts of a separate project,
 * so they are never committed to this repository: they are fetched from the
 * `stockfish` npm package at install time by the `postinstall` hook.
 *
 * Usage:
 *   node scripts/fetch-engine.mjs [--variant=<name>] [--force]
 *
 * Variants (see node_modules/stockfish/bin):
 *   lite-single  single-threaded, ~7 MB   [default, no COOP/COEP headers needed]
 *   lite         multi-threaded,  ~7 MB   [requires COOP/COEP, see public/_headers]
 *   single       single-threaded, ~75 MB  [full NNUE]
 *   (bare)       multi-threaded,  ~75 MB  [full NNUE]
 *
 * Switching variant is a configuration change, not a code change: copy the other
 * build and point VITE_ENGINE_WORKER_URL at it. See README.md.
 */

import { createRequire } from 'node:module'
import { constants, copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(projectRoot, 'public', 'engine')

const args = process.argv.slice(2)
const force = args.includes('--force')
const variant =
  args.find((arg) => arg.startsWith('--variant='))?.slice('--variant='.length) ??
  process.env.ENGINE_VARIANT ??
  'lite-single'

/** Resolves node_modules/stockfish/bin without hardcoding the hoisting layout. */
function resolveEngineBinDir() {
  try {
    return join(dirname(require.resolve('stockfish/package.json')), 'bin')
  } catch {
    return null
  }
}

/** Every file belonging to a variant: the JS glue plus its .wasm payload. */
function variantFilePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^stockfish-18-${escaped}\\.[^.]+$`)
}

/** Skips the copy when the destination already matches, keeping installs fast. */
async function isUpToDate(source, destination) {
  if (force) return false
  try {
    const [from, to] = await Promise.all([stat(source), stat(destination)])
    return from.size === to.size && to.mtimeMs >= from.mtimeMs
  } catch {
    return false
  }
}

async function main() {
  const binDir = resolveEngineBinDir()
  if (binDir === null) {
    // Not an error: `npm install` runs this before the tree is guaranteed complete
    // in some setups, and contributors may install with --ignore-scripts.
    console.warn(
      '[fetch-engine] The `stockfish` package is not installed; skipping.\n' +
        '[fetch-engine] Run `npm install` and then `npm run fetch-engine`.',
    )
    return
  }

  const pattern = variantFilePattern(variant)
  const files = (await readdir(binDir)).filter((file) => pattern.test(file))

  if (files.length === 0) {
    const available = (await readdir(binDir))
      .filter((file) => file.endsWith('.wasm'))
      .map((file) => file.replace(/^stockfish-18-?/, '').replace(/\.wasm$/, '') || '(bare)')
    throw new Error(
      `Unknown engine variant "${variant}". Available variants: ${available.join(', ')}`,
    )
  }

  await mkdir(outputDir, { recursive: true })

  let copied = 0
  for (const file of files) {
    const source = join(binDir, file)
    const destination = join(outputDir, file)
    if (await isUpToDate(source, destination)) continue
    await copyFile(source, destination, constants.COPYFILE_FICLONE)
    copied += 1
  }

  const summary = copied === 0 ? 'already up to date' : `copied ${copied} file(s)`
  console.log(`[fetch-engine] ${variant} → public/engine/ (${summary})`)
}

main().catch((error) => {
  console.error(`[fetch-engine] ${error.message}`)
  process.exitCode = 1
})
