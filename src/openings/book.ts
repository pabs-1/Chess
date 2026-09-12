/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Opening names, looked up by position.
 *
 * The data is lichess-org/chess-openings, a collection of facts released under
 * CC0 and therefore free to ship inside a GPLv3 program. It is committed rather
 * than fetched, so builds stay reproducible and work offline;
 * scripts/fetch-openings.mjs regenerates it.
 *
 * Roughly 450 KB of it, so it is loaded on demand rather than bundled into the
 * page every visitor downloads. Nothing here is needed until a game exists to
 * name.
 */

import { toEpd } from './epd.ts'

export interface Opening {
  /** ECO classification, e.g. 'B90'. */
  eco: string
  /** English name, e.g. 'Sicilian Defense: Najdorf Variation'. */
  name: string
}

export interface OpeningBook {
  /** The opening whose known position this is, or null. */
  find: (fen: string) => Opening | null
  /** How many positions the book holds. */
  size: number
}

/** One row of the generated data: position, classification, name. */
export type OpeningRow = readonly [epd: string, eco: string, name: string]

export function createOpeningBook(rows: readonly OpeningRow[]): OpeningBook {
  const byPosition = new Map<string, Opening>()
  for (const [epd, eco, name] of rows) byPosition.set(epd, { eco, name })

  return {
    find: (fen: string) => byPosition.get(toEpd(fen)) ?? null,
    size: byPosition.size,
  }
}

/** Reads the generated rows, discarding anything that is not one. */
export function parseOpeningRows(value: unknown): OpeningRow[] {
  if (!Array.isArray(value)) return []

  const rows: OpeningRow[] = []
  for (const entry of value as unknown[]) {
    if (!Array.isArray(entry)) continue
    const [epd, eco, name] = entry as unknown[]
    if (typeof epd === 'string' && typeof eco === 'string' && typeof name === 'string') {
      rows.push([epd, eco, name])
    }
  }

  return rows
}

let pending: Promise<OpeningBook> | null = null

/** Loads the book, once per page. */
export function loadOpeningBook(): Promise<OpeningBook> {
  pending ??= import('./data/openings.json?raw').then((module) =>
    createOpeningBook(parseOpeningRows(JSON.parse(module.default))),
  )
  return pending
}
