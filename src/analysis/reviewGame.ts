/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Reviewing a whole game.
 *
 * This is the one module in `src/analysis/` that talks to the engine, because
 * somebody has to drive it. What it produces is still data only: codes, numbers
 * and moves, never a sentence.
 *
 * ## Two passes
 *
 * MultiPV, not depth, dominates the cost: measured on a 44-move game, a single
 * line per position took 23s where three lines took 84s, because the engine
 * cannot prune the alternatives away. So the scan pass searches every position
 * for one line, which is everything grading, accuracy and the graph need, and a
 * detail pass revisits only the handful of positions where the player went
 * wrong to collect the alternatives.
 *
 * ## One search configuration per comparison
 *
 * Grading compares the position before a move with the position after it. Both
 * numbers always come from the scan pass, even for positions the detail pass
 * also covered: mixing two search configurations inside a single subtraction
 * would make some deltas incomparable with their neighbours. The detail pass
 * contributes alternatives and nothing else.
 */

import { Chess } from 'chess.js'

import { gameAccuracy, moveAccuracy } from './accuracy.ts'
import { classifyMove, isNoteworthy } from './classify.ts'
import type { ClassificationInput } from './classify.ts'
import { toEvaluation, winPercentFromEvaluation } from './evaluation.ts'
import { gamePositions } from './pgn.ts'
import { opponentOf, sideToMove, toWhitePov, winPercentFor } from './pov.ts'
import { uciMoveToSan } from './pv.ts'
import type { AnalyseRequest, AnalysisResult } from '../engine/types.ts'
import type { Color, Evaluation, GameMove, MoveClassification, ParsedGame } from './types.ts'

/** The slice of the engine a review needs. `Engine` satisfies it as it stands. */
export interface ReviewEngine {
  analyse(request: AnalyseRequest): Promise<AnalysisResult>
  stop(): void
}

export class ReviewCancelledError extends Error {
  constructor() {
    super('The review was cancelled')
    this.name = 'ReviewCancelledError'
  }
}

/** Which pass is running, so the interface can say what it is waiting for. */
export type ReviewPhase = 'scan' | 'detail'

export interface ReviewProgress {
  phase: ReviewPhase
  completed: number
  total: number
}

/** One of the engine's choices in a position, expressed for the side to move. */
export interface ReviewedAlternative {
  uci: string
  san: string
  evaluation: Evaluation
  /** 0–100 for the side to move in that position. */
  winPercent: number
}

export interface ReviewedMove extends GameMove {
  classification: MoveClassification
  /** Points of win percentage the move gave away. */
  winPercentLost: number
  /** 0–100 for this move alone. */
  accuracy: number
  /** Win percentage for White after the move — the evaluation graph's axis. */
  winPercentWhite: number
  /** Evaluation after the move, expressed for White; null once the game has ended. */
  evaluation: Evaluation | null
  /** The engine's own choice in the position before the move. */
  bestMove: string | null
  bestMoveSan: string | null
  /** The engine's ranked choices, when the detail pass covered this position. */
  alternatives: ReviewedAlternative[]
}

export interface GameReview {
  game: ParsedGame
  moves: ReviewedMove[]
  /** Win percentage for White at every position, starting position first. */
  winPercentWhite: number[]
  accuracy: Record<Color, number | null>
  counts: Record<Color, Record<MoveClassification, number>>
  /** The depth every position was searched to. */
  depth: number
}

export interface ReviewOptions {
  /** Depth for both passes. Fixed, never a time limit: results must reproduce. */
  depth?: number
  /** Lines collected by the detail pass. */
  multiPV?: number
  signal?: AbortSignal
  onProgress?: (progress: ReviewProgress) => void
}

export const DEFAULT_REVIEW_DEPTH = 14
export const DEFAULT_REVIEW_MULTI_PV = 3

function emptyCounts(): Record<MoveClassification, number> {
  return { forced: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
}

/**
 * Win percentage for the side to move in a position the engine returned nothing
 * for, which means the game ended there.
 *
 * @returns 0–100, or null when the position is not in fact terminal
 */
function terminalWinPercent(fen: string): number | null {
  const board = new Chess(fen)
  if (board.isCheckmate()) return 0
  if (board.isStalemate() || board.isDraw() || board.isInsufficientMaterial()) return 50
  return null
}

function throwIfCancelled(signal: AbortSignal | undefined, engine: ReviewEngine): void {
  if (signal?.aborted !== true) return
  engine.stop()
  throw new ReviewCancelledError()
}

export async function reviewGame(
  engine: ReviewEngine,
  game: ParsedGame,
  options: ReviewOptions = {},
): Promise<GameReview> {
  const depth = options.depth ?? DEFAULT_REVIEW_DEPTH
  const multiPV = options.multiPV ?? DEFAULT_REVIEW_MULTI_PV
  const { signal, onProgress } = options

  const positions = gamePositions(game)

  // --- Scan pass: one line per position. ------------------------------------
  const scan: AnalysisResult[] = []
  for (const [index, fen] of positions.entries()) {
    throwIfCancelled(signal, engine)
    scan.push(await engine.analyse({ fen, depth, multiPV: 1 }))
    onProgress?.({ phase: 'scan', completed: index + 1, total: positions.length })
  }

  /** Win percentage for the side to move at each position. */
  const winPercentToMove = positions.map((fen, index) => {
    const best = scan[index]?.lines[0]
    if (best !== undefined) return winPercentFromEvaluation(toEvaluation(best))
    // No line at all: the engine was handed a finished game.
    return terminalWinPercent(fen) ?? 50
  })

  const winPercentWhite = positions.map((fen, index) =>
    sideToMove(fen) === 'w' ? (winPercentToMove[index] ?? 50) : 100 - (winPercentToMove[index] ?? 50),
  )

  // --- Grade every move from the scan pass alone. ----------------------------
  // Kept so the detail pass can re-grade from exactly the same numbers rather
  // than reconstructing them.
  const gradingInputs: ClassificationInput[] = []

  const moves: ReviewedMove[] = game.moves.map((move, index) => {
    const before = scan[index]
    const after = scan[index + 1]
    const mover = move.color

    const winPercentBefore = winPercentToMove[index] ?? 50
    // The position after the move is the opponent's to play, so the engine
    // expressed it for them. Read it back for the player who just moved.
    const afterLine = after?.lines[0]
    const winPercentAfter =
      afterLine === undefined
        ? 100 - (terminalWinPercent(move.fenAfter) ?? 50)
        : winPercentFor(toEvaluation(afterLine), opponentOf(mover), mover)

    const grading: ClassificationInput = {
      winPercentBefore,
      winPercentAfter,
      isTopEngineMove: before?.bestMove === move.uci,
      legalMoveCount: new Chess(move.fenBefore).moves().length,
    }
    gradingInputs.push(grading)

    const { classification, winPercentLost } = classifyMove(grading)

    const bestMove = before?.bestMove !== undefined && before.bestMove !== '' ? before.bestMove : null

    return {
      ...move,
      classification,
      winPercentLost,
      accuracy: moveAccuracy(winPercentLost),
      winPercentWhite: winPercentWhite[index + 1] ?? 50,
      evaluation:
        afterLine === undefined ? null : toWhitePov(toEvaluation(afterLine), opponentOf(mover)),
      bestMove,
      bestMoveSan: bestMove === null ? null : uciMoveToSan(move.fenBefore, bestMove),
      alternatives: [],
    }
  })

  // --- Detail pass: alternatives, only where the player went wrong. ----------
  const detailIndexes = moves
    .map((move, index) => (isNoteworthy(move.classification) ? index : -1))
    .filter((index) => index >= 0)

  for (const [done, index] of detailIndexes.entries()) {
    throwIfCancelled(signal, engine)

    const move = moves[index]
    if (move === undefined) continue

    const detail = await engine.analyse({ fen: move.fenBefore, depth, multiPV })
    const alternatives: ReviewedAlternative[] = detail.lines.flatMap((line) => {
      const uci = line.pv[0]
      if (uci === undefined) return []
      const san = uciMoveToSan(move.fenBefore, uci)
      if (san === null) return []
      const evaluation = toEvaluation(line)
      return [{ uci, san, evaluation, winPercent: winPercentFromEvaluation(evaluation) }]
    })

    move.alternatives = alternatives

    // The only grade the extra lines can change: a move that looked merely best
    // may turn out to have been the position's only survivable move. The rest of
    // the input is the scan pass's, untouched.
    const grading = gradingInputs[index]
    if (grading !== undefined && alternatives[1] !== undefined) {
      move.classification = classifyMove({
        ...grading,
        secondBestWinPercent: alternatives[1].winPercent,
      }).classification
    }

    onProgress?.({ phase: 'detail', completed: done + 1, total: detailIndexes.length })
  }

  // --- Totals. --------------------------------------------------------------
  const counts: Record<Color, Record<MoveClassification, number>> = {
    w: emptyCounts(),
    b: emptyCounts(),
  }
  for (const move of moves) counts[move.color][move.classification] += 1

  const accuracyOf = (color: Color): number | null =>
    gameAccuracy(moves.filter((move) => move.color === color).map((move) => move.accuracy))

  return {
    game,
    moves,
    winPercentWhite,
    accuracy: { w: accuracyOf('w'), b: accuracyOf('b') },
    counts,
    depth,
  }
}
