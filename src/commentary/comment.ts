/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import type { Motif } from '../analysis/motifs/index.ts'
import type { ReviewedMove } from '../analysis/reviewGame.ts'
import type { CommentStep } from './types.ts'

/** Classifications that are worth saying anything about at all. */
const EXPLAINED = new Set(['inaccuracy', 'mistake', 'blunder'])

/**
 * The values a motif's detail template interpolates.
 *
 * Every one is a code or chess notation. Piece codes reach the template as
 * letters and are turned into words there, by nesting, so that no part of this
 * file knows how to say "knight" in anything.
 */
function detailValues(motif: Motif): Record<string, string | number> {
  switch (motif.id) {
    case 'allows-mate':
      return { moves: motif.moves, line: motif.line.join(' ') }

    case 'misses-mate':
      return { moves: motif.moves, move: motif.bestMove }

    case 'hangs-piece':
      return { capture: motif.capture, piece: motif.target.piece, square: motif.target.square }

    case 'misses-material':
      return { move: motif.bestMove, piece: motif.target.piece, square: motif.target.square }

    case 'allows-fork': {
      // The two the player most needs to see; there are always at least two.
      const [first, second] = motif.targets
      return {
        reply: motif.reply,
        forker: motif.forker.piece,
        square: motif.forker.square,
        firstPiece: first?.piece ?? '',
        firstSquare: first?.square ?? '',
        secondPiece: second?.piece ?? '',
        secondSquare: second?.square ?? '',
      }
    }

    case 'weakens-king':
      return { from: motif.from, kingSquare: motif.kingSquare }

    case 'loses-castling':
      return {}
  }
}

/**
 * The ladder of hints for one move, shortest first.
 *
 * A move nobody needs explaining gets nothing. A move with no motif behind it
 * still gets the signal and the engine's answer, but no theme and no detail:
 * claiming a reason we did not find would be worse than admitting we have none.
 */
export function commentFor(move: ReviewedMove): CommentStep[] {
  if (!EXPLAINED.has(move.classification)) return []

  const steps: CommentStep[] = [
    { kind: 'signal', key: `commentary.signal.${move.classification}`, values: {} },
  ]

  if (move.motif !== null) {
    steps.push(
      { kind: 'theme', key: `commentary.motif.${move.motif.id}.theme`, values: {} },
      {
        kind: 'detail',
        key: `commentary.motif.${move.motif.id}.detail`,
        values: detailValues(move.motif),
      },
    )
  }

  if (move.bestMoveSan !== null && move.bestMove !== move.uci) {
    steps.push({ kind: 'solution', key: 'commentary.solution', values: { move: move.bestMoveSan } })
  }

  return steps
}
