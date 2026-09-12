/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Grading a played move.
 *
 * The measure is how much *winning chance* the move gave away, not how many
 * centipawns. Dropping 300cp while already winning by nine pawns changes
 * nothing about the outcome; dropping 80cp in a level position changes a great
 * deal. Only a win percentage makes those two comparable, which is why
 * everything here is expressed in points of win percentage.
 *
 * Pure, and returns codes rather than words: the labels live in the translation
 * files. See CLAUDE.md.
 */

import type { MoveClassification } from './types.ts'

/**
 * Upper bounds, in points of win percentage lost, for each grade. A move
 * qualifies for the first band it falls under.
 */
export const CLASSIFICATION_THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
} as const

/**
 * How close to the engine's own choice still counts as `best`.
 *
 * At depth 14 the first and second engine lines are routinely a few tenths of a
 * point apart. Calling one "best" and the other merely "excellent" draws a
 * distinction the player cannot perceive and did not make.
 */
export const BEST_MOVE_TOLERANCE = 1

/**
 * How far the alternatives must fall behind before the best move counts as
 * forced in practice rather than merely strongest.
 */
export const FORCED_ALTERNATIVE_GAP = 20

/**
 * Mate scores either side of a move, from the mover's point of view: a negative
 * number of moves means they are the one being mated, null means the engine
 * reported no forced mate at all.
 */
export interface MateContext {
  mateBefore: number | null
  mateAfter: number | null
}

/**
 * True when the move handed the opponent a forced mate that was not already
 * there.
 *
 * Both the grade and the `allows-mate` motif rest on this, so it lives in one
 * place: a position the detector calls a mate while the grade calls it best
 * would put two contradictory sentences on the same screen.
 */
export function allowsAvoidableMate(mate: MateContext): boolean {
  // No mate against the mover after the move: nothing was allowed.
  if (mate.mateAfter === null || mate.mateAfter >= 0) return false
  // Already being mated beforehand: this move is not what let it in.
  return !(mate.mateBefore !== null && mate.mateBefore < 0)
}

export interface ClassificationInput {
  /** Win percentage for the player about to move, before they moved. */
  winPercentBefore: number
  /** Win percentage for that same player, after their move. */
  winPercentAfter: number
  /** Whether the move played is the engine's first choice. */
  isTopEngineMove: boolean
  /** How many legal moves the position offered. */
  legalMoveCount: number
  /**
   * Win percentage the player would have had with the engine's *second* choice,
   * when a MultiPV search covered this position. Absent on positions that were
   * only searched for a single line.
   */
  secondBestWinPercent?: number
  /**
   * Mate scores either side of the move, when the engine reported any. Absent
   * when the caller has no mate information to give.
   */
  mate?: MateContext
}

export interface Classification {
  classification: MoveClassification
  /** Points of win percentage given away; never negative. */
  winPercentLost: number
}

/**
 * True when the player had no real choice: one legal move, or one move so far
 * ahead of every alternative that playing anything else loses the game.
 *
 * The second case requires the player to have actually found it: otherwise the
 * position was not forced for them, it was a trap they fell into.
 */
function isForced(input: ClassificationInput): boolean {
  if (input.legalMoveCount <= 1) return true
  if (!input.isTopEngineMove) return false

  const second = input.secondBestWinPercent
  if (second === undefined) return false
  return input.winPercentBefore - second >= FORCED_ALTERNATIVE_GAP
}

export function classifyMove(input: ClassificationInput): Classification {
  // A move that improves on the engine's expectation gave away nothing; the
  // difference is search noise between two depths, not a gain.
  const winPercentLost = Math.max(0, input.winPercentBefore - input.winPercentAfter)

  if (isForced(input)) return { classification: 'forced', winPercentLost }

  // Walking into a forced mate is a blunder whatever the arithmetic says.
  // Once a position is lost the win percentage has already reached zero, so
  // the delta cannot fall any further, and the move that actually gets the
  // player mated would otherwise be graded `best` for costing nothing. The
  // engine's own choice is exempt: if it too allows mate, there was no better
  // move to play and the loss was not this move's doing.
  if (!input.isTopEngineMove && input.mate !== undefined && allowsAvoidableMate(input.mate)) {
    return { classification: 'blunder', winPercentLost }
  }

  if (input.isTopEngineMove || winPercentLost <= BEST_MOVE_TOLERANCE) {
    return { classification: 'best', winPercentLost }
  }

  const thresholds = CLASSIFICATION_THRESHOLDS
  if (winPercentLost < thresholds.excellent) return { classification: 'excellent', winPercentLost }
  if (winPercentLost < thresholds.good) return { classification: 'good', winPercentLost }
  if (winPercentLost < thresholds.inaccuracy) return { classification: 'inaccuracy', winPercentLost }
  if (winPercentLost < thresholds.mistake) return { classification: 'mistake', winPercentLost }
  return { classification: 'blunder', winPercentLost }
}

/** The grades that mark a move as worth reviewing, worst first. */
export const NOTEWORTHY_CLASSIFICATIONS: readonly MoveClassification[] = [
  'blunder',
  'mistake',
  'inaccuracy',
]

/** Whether a grade is one the player should be shown an explanation for. */
export function isNoteworthy(classification: MoveClassification): boolean {
  return NOTEWORTHY_CLASSIFICATIONS.includes(classification)
}
