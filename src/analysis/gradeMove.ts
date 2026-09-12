/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Grading one move, given what the engine said about the positions either side
 * of it.
 *
 * This is shared deliberately. A whole-game review and the live coach ask the
 * same question (how much did this move cost, and why), and if they answered
 * it with two copies of the same arithmetic they would eventually disagree
 * about the same position, which is the one thing a learning tool cannot do.
 *
 * Pure: engine output in, data out. Nothing here searches, and nothing here
 * speaks.
 */

import { Chess } from 'chess.js'

import { classifyMove } from './classify.ts'
import type { Classification, ClassificationInput, MateContext } from './classify.ts'
import { toEvaluation } from './evaluation.ts'
import { detectMotif } from './motifs/index.ts'
import type { Motif } from './motifs/index.ts'
import { opponentOf, sideToMove, winPercentFor } from './pov.ts'
import { uciMoveToSan } from './pv.ts'
import type { AnalysisResult } from '../engine/types.ts'
import type { Color, GameMove } from './types.ts'

/**
 * Win percentage for the side to move in a position the engine returned no line
 * for, which means the game ended there.
 *
 * @returns 0–100, or null when the position is not in fact terminal
 */
export function terminalWinPercent(fen: string): number | null {
  const board = new Chess(fen)
  if (board.isCheckmate()) return 0
  if (board.isStalemate() || board.isDraw() || board.isInsufficientMaterial()) return 50
  return null
}

/**
 * Win percentage for whoever is to move, from the engine's own point of view on
 * that position, falling back to the result when the game is already over.
 */
export function winPercentToMove(fen: string, analysis: AnalysisResult | undefined): number {
  const best = analysis?.lines[0]
  if (best !== undefined) return winPercentFor(toEvaluation(best), sideToMove(fen), sideToMove(fen))
  return terminalWinPercent(fen) ?? 50
}

/** The engine's choice in a position, or null when it had none to offer. */
export function bestMoveOf(analysis: AnalysisResult | undefined): string | null {
  const best = analysis?.bestMove
  return best === undefined || best === '' ? null : best
}

export interface MoveGrade extends Classification {
  /** Win percentage for the mover before and after, both from their side. */
  winPercentBefore: number
  winPercentAfter: number
  /** Kept so a later, better-informed pass can re-grade from the same numbers. */
  input: ClassificationInput
}

/**
 * Grades a move from the engine's view of the positions either side of it.
 *
 * `before` is expressed for the mover, since it was their turn; `after` is
 * expressed for the opponent, since it is now theirs. Converting the second is
 * the whole reason `src/analysis/pov.ts` exists.
 */
export function gradeMove(
  move: GameMove,
  before: AnalysisResult | undefined,
  after: AnalysisResult | undefined,
  extra: { secondBestWinPercent?: number } = {},
): MoveGrade {
  const mover = move.color
  const winPercentBefore = winPercentToMove(move.fenBefore, before)

  const afterLine = after?.lines[0]
  const winPercentAfter =
    afterLine === undefined
      ? 100 - (terminalWinPercent(move.fenAfter) ?? 50)
      : winPercentFor(toEvaluation(afterLine), opponentOf(mover), mover)

  const input: ClassificationInput = {
    winPercentBefore,
    winPercentAfter,
    isTopEngineMove: before?.bestMove === move.uci,
    legalMoveCount: new Chess(move.fenBefore).moves().length,
    mate: mateContextOf(before, after),
    ...(extra.secondBestWinPercent === undefined
      ? {}
      : { secondBestWinPercent: extra.secondBestWinPercent }),
  }

  return { ...classifyMove(input), winPercentBefore, winPercentAfter, input }
}

/**
 * Mate scores either side of the move, both from the mover's point of view.
 *
 * The engine expresses every score for the side to move, so the score after
 * the move belongs to the opponent and has to be negated. Doing it here, once,
 * is what keeps the grade and the motif talking about the same mate.
 */
export function mateContextOf(
  before: AnalysisResult | undefined,
  after: AnalysisResult | undefined,
): MateContext {
  const afterMate = after?.lines[0]?.scoreMate
  return {
    mateBefore: before?.lines[0]?.scoreMate ?? null,
    mateAfter: afterMate == null ? null : -afterMate,
  }
}

/** Why the move went wrong, or null when nothing was recognised. */
export function motifFor(
  move: GameMove,
  before: AnalysisResult | undefined,
  after: AnalysisResult | undefined,
  classification: MoveGrade['classification'],
  bestMove: string | null,
): Motif | null {
  const afterLine = after?.lines[0]

  return detectMotif({
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    uci: move.uci,
    san: move.san,
    mover: move.color,
    bestMove,
    refutation: afterLine?.pv ?? [],
    ...mateContextOf(before, after),
    classification,
  })
}

/** The engine's choice in SAN, for showing the player what to play instead. */
export function bestMoveSanOf(fenBefore: string, bestMove: string | null): string | null {
  return bestMove === null ? null : uciMoveToSan(fenBefore, bestMove)
}

/** The side that is not `color`; re-exported so callers need one import. */
export { opponentOf }
export type { Color }
