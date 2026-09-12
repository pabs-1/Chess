#!/usr/bin/env node
/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Rebuilds the opening book from lichess-org/chess-openings.
 *
 * That data set is a collection of facts released under CC0, so it can be
 * shipped inside a GPLv3 program without friction. Unlike the engine, the
 * result is small and is committed: it keeps builds reproducible and offline,
 * and the source changes rarely. Run this only to pick up upstream changes.
 *
 *   node scripts/fetch-openings.mjs
 *
 * The upstream repository also publishes a `dist/` with the positions already
 * computed, but it is built by CI and not committed, so the moves are replayed
 * here instead — which also guarantees the positions are written in exactly the
 * form src/openings/epd.ts will look them up by.
 */

import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Chess } = require('chess.js')

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = join(projectRoot, 'src', 'openings', 'data', 'openings.json')

const VOLUMES = ['a', 'b', 'c', 'd', 'e']
const SOURCE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'

/**
 * The position as the book keys it: a FEN without move counters, and without an
 * en passant square unless a capture is actually available.
 *
 * Must stay identical to toEpd in src/openings/epd.ts. A position reached by a
 * double push and the same position reached quietly would otherwise be two
 * different keys, and every transposition through one would be missed.
 */
function toEpd(fen) {
  const [board, turn, castling, enPassant] = fen.split(' ')
  if (enPassant === '-') return `${board} ${turn} ${castling} -`

  const capturable = new Chess(fen)
    .moves({ verbose: true })
    .some((move) => move.flags.includes('e'))

  return `${board} ${turn} ${castling} ${capturable ? enPassant : '-'}`
}

function parseTsv(text) {
  const rows = []
  const lines = text.split('\n')

  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    const [eco, name, pgn] = line.split('\t')
    if (eco === undefined || name === undefined || pgn === undefined) continue
    rows.push({ eco, name, pgn: pgn.trim() })
  }

  return rows
}

async function main() {
  const entries = []
  let skipped = 0

  for (const volume of VOLUMES) {
    const response = await fetch(`${SOURCE}/${volume}.tsv`)
    if (!response.ok) throw new Error(`${volume}.tsv: HTTP ${response.status}`)

    for (const row of parseTsv(await response.text())) {
      const board = new Chess()
      try {
        board.loadPgn(row.pgn)
      } catch {
        skipped += 1
        continue
      }
      entries.push([toEpd(board.fen()), row.eco, row.name])
    }
  }

  // Later entries win: the data set adds extra lines for transpositions, and a
  // duplicate position is the same opening under a different move order.
  entries.sort((a, b) => a[0].localeCompare(b[0]))

  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, `${JSON.stringify(entries)}\n`)

  const unique = new Set(entries.map((entry) => entry[0])).size
  console.log(
    `[fetch-openings] ${entries.length} openings, ${unique} distinct positions` +
      (skipped > 0 ? `, ${skipped} skipped` : ''),
  )
}

main().catch((error) => {
  console.error(`[fetch-openings] ${error.message}`)
  process.exitCode = 1
})
