/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { PIECE_VALUES, attackersOf, piecesAttackedFrom, playUci } from './board.ts'
import type { Detector, PieceOnSquare } from './types.ts'
import type { PieceCode } from './types.ts'

/**
 * The opponent's reply hits two things at once.
 *
 * Not every double attack is a fork worth naming: a queen touching two defended
 * pawns has achieved nothing. A target counts when taking it would actually
 * cost the player something: it is the king, it is worth more than the piece
 * attacking it, or nothing defends it.
 */
function isWorthwhileTarget(
  fen: string,
  target: PieceOnSquare,
  forker: PieceCode,
  defender: 'w' | 'b',
): boolean {
  if (target.piece === 'k') return true
  if (PIECE_VALUES[target.piece] > PIECE_VALUES[forker]) return true
  return attackersOf(fen, target.square, defender).length === 0
}

export const allowsFork: Detector = (context) => {
  const reply = context.refutation[0]
  if (reply === undefined) return null

  const played = playUci(context.fenAfter, reply)
  if (played === null) return null

  const forker = played.move.piece
  const landing = played.move.to

  const targets = piecesAttackedFrom(played.fen, landing, context.mover).filter((target) =>
    isWorthwhileTarget(played.fen, target, forker, context.mover),
  )

  if (targets.length < 2) return null

  return {
    id: 'allows-fork',
    tier: 'tactics',
    level: 'intermediate',
    forker: { piece: forker, square: landing },
    targets,
    reply: played.move.san,
  }
}
