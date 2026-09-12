/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { uciMoveToSan, uciPvToSan } from '../pv.ts'
import type { Detector } from './types.ts'

/** How much of a mating line is worth showing before it stops being help. */
const MAX_LINE_LENGTH = 6

/**
 * The move handed the opponent a forced mate.
 *
 * Only when the mate was not already there: a player who was being mated before
 * the move did not cause it with this one.
 */
export const allowsMate: Detector = (context) => {
  const { mateAfter, mateBefore } = context
  if (mateAfter === null || mateAfter >= 0) return null
  if (mateBefore !== null && mateBefore < 0) return null

  return {
    id: 'allows-mate',
    tier: 'mate',
    level: 'beginner',
    moves: Math.abs(mateAfter),
    line: uciPvToSan(context.fenAfter, [...context.refutation]).slice(0, MAX_LINE_LENGTH),
  }
}

/** The player had a forced mate and played something else. */
export const missesMate: Detector = (context) => {
  const { mateBefore, mateAfter, bestMove } = context
  if (mateBefore === null || mateBefore <= 0) return null
  // Still mating after the move, just more slowly: not a missed mate.
  if (mateAfter !== null && mateAfter > 0) return null
  if (bestMove === null) return null

  const san = uciMoveToSan(context.fenBefore, bestMove)
  if (san === null) return null

  return { id: 'misses-mate', tier: 'mate', level: 'intermediate', moves: mateBefore, bestMove: san }
}
