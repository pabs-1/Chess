/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { PIECE_VALUES, attackersOf, opponent, playUci, staticExchangeGain } from './board.ts'
import type { Detector } from './types.ts'

/** What a move wins outright, in pawns; 0 when it captures nothing. */
function valueCaptured(fen: string, uci: string): number {
  const played = playUci(fen, uci)
  const captured = played?.move.captured
  return captured === undefined ? 0 : PIECE_VALUES[captured]
}

/**
 * The move left something where the opponent simply takes it.
 *
 * Judged on the material swing across both plies, not on the opponent's capture
 * alone: a bishop that takes a knight and is taken back has not been hung, it
 * has been traded. What the move itself won is subtracted from what the
 * opponent wins back.
 */
export const hangsPiece: Detector = (context) => {
  const reply = context.refutation[0]
  if (reply === undefined) return null

  const played = playUci(context.fenAfter, reply)
  if (played?.move.captured === undefined) return null
  // En passant takes a pawn that is not on the destination square, so naming
  // the square would name the wrong one.
  if (played.move.flags.includes('e')) return null

  const won = valueCaptured(context.fenBefore, context.uci)
  const lost = staticExchangeGain(context.fenAfter, played.move.to, opponent(context.mover))
  if (lost - won <= 0) return null

  const defenders = attackersOf(context.fenAfter, played.move.to, context.mover)

  return {
    id: 'hangs-piece',
    tier: 'material',
    level: 'beginner',
    target: { piece: played.move.captured, square: played.move.to },
    capture: played.move.san,
    undefended: defenders.length === 0,
  }
}

/** The player passed up a capture that wins material. */
export const missesMaterial: Detector = (context) => {
  const { bestMove } = context
  if (bestMove === null || bestMove === context.uci) return null

  const played = playUci(context.fenBefore, bestMove)
  if (played?.move.captured === undefined) return null
  if (played.move.flags.includes('e')) return null

  // Only a capture that actually wins something counts as material missed;
  // declining an even trade is not a blunder.
  if (staticExchangeGain(context.fenBefore, played.move.to, context.mover) <= 0) return null

  return {
    id: 'misses-material',
    tier: 'material',
    level: 'beginner',
    target: { piece: played.move.captured, square: played.move.to },
    bestMove: played.move.san,
  }
}
