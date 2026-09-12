/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { castlingRights, kingSquare, playUci } from './board.ts'
import type { Detector } from './types.ts'

const FILE_A = 'a'.charCodeAt(0)

function fileIndex(square: string): number {
  return (square.codePointAt(0) ?? FILE_A) - FILE_A
}

/**
 * A pawn in front of one's own king was pushed.
 *
 * Only once the king has left the centre: while it is still on d or e the
 * position has not committed, and pushing a pawn there is ordinary play rather
 * than a concession. Only pawns on their starting rank count, and only those on
 * the king's file or next to it: those are the three that shelter it.
 */
export const weakensKing: Detector = (context) => {
  const played = playUci(context.fenBefore, context.uci)
  if (played?.move.piece !== 'p') return null

  const king = kingSquare(context.fenBefore, context.mover)
  if (king === null) return null

  const homeRank = context.mover === 'w' ? '1' : '8'
  const pawnRank = context.mover === 'w' ? '2' : '7'
  if (king[1] !== homeRank) return null

  const kingFile = king[0] ?? ''
  if (kingFile === 'd' || kingFile === 'e') return null
  if (played.move.from[1] !== pawnRank) return null
  if (Math.abs(fileIndex(played.move.from) - fileIndex(king)) > 1) return null

  return { id: 'weakens-king', tier: 'positional', level: 'advanced', from: played.move.from, kingSquare: king }
}

/** Castling rights were given up without castling. */
export const losesCastling: Detector = (context) => {
  const before = castlingRights(context.fenBefore, context.mover)
  if (!before.king && !before.queen) return null

  const after = castlingRights(context.fenAfter, context.mover)
  if (after.king || after.queen) return null

  // Castling spends the rights by using them, which is not losing them.
  const played = playUci(context.fenBefore, context.uci)
  if (played === null) return null
  if (played.move.flags.includes('k') || played.move.flags.includes('q')) return null

  return { id: 'loses-castling', tier: 'positional', level: 'advanced' }
}
