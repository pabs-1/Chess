/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import type { Opening, OpeningBook } from './book.ts'

export interface OpeningClassification {
  /** The deepest named position the game reached, or null if it named none. */
  opening: Opening | null
  /** Index into the positions of the deepest named one; 0 when none matched. */
  lastBookIndex: number
  /**
   * 0-based ply of the first move played outside theory, or null when the game
   * never left it: it ended while still in the book.
   */
  leftBookAtPly: number | null
}

/**
 * Names a game by the deepest position it reached that the book knows.
 *
 * Deepest, not first-miss: the data set carries extra entries for transpositions
 * precisely so that a game can wander out of one line and into a named position
 * by another move order. Stopping at the first unknown position would give the
 * wrong name to exactly the games where the name is interesting.
 *
 * @param positions every position the game passed through, starting position
 *   first, the shape `gamePositions` returns
 */
export function classifyOpening(
  book: OpeningBook,
  positions: readonly string[],
): OpeningClassification {
  let opening: Opening | null = null
  let lastBookIndex = 0

  for (const [index, fen] of positions.entries()) {
    const found = book.find(fen)
    if (found === null) continue
    opening = found
    lastBookIndex = index
  }

  const moveCount = Math.max(0, positions.length - 1)
  const leftBookAtPly = lastBookIndex < moveCount ? lastBookIndex : null

  return { opening, lastBookIndex, leftBookAtPly }
}
