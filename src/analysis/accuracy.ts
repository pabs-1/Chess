/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Turning win percentage lost into an accuracy score.
 *
 * The curve is Lichess's, fitted against real game results. We already borrowed
 * their centipawn-to-win-percentage curve for `winPercentFromCp`, and the two
 * were tuned together, so mixing in a different accuracy model would put the
 * two halves of the same measurement on different footings.
 *
 * Pure. No text.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const SCALE = 103.1668
const DECAY = -0.04354
const OFFSET = 3.1669

/**
 * Accuracy of a single move.
 *
 * @param winPercentLost points of win percentage the move gave away
 * @returns 0–100, where a move that gives away nothing scores 100
 */
export function moveAccuracy(winPercentLost: number): number {
  const lost = Math.max(0, winPercentLost)
  return clamp(SCALE * Math.exp(DECAY * lost) - OFFSET, 0, 100)
}

/**
 * Accuracy across a player's moves.
 *
 * A plain mean, deliberately: it is trivial to reason about and to test, and
 * it is a pure function, so swapping in a volatility-weighted average later
 * changes this file and nothing else.
 *
 * @returns 0–100, or null when the player made no moves — a one-ply game has no
 *   Black accuracy, and inventing a number for that would be a lie
 */
export function gameAccuracy(moveAccuracies: readonly number[]): number | null {
  if (moveAccuracies.length === 0) return null

  const total = moveAccuracies.reduce((sum, accuracy) => sum + accuracy, 0)
  return clamp(total / moveAccuracies.length, 0, 100)
}
