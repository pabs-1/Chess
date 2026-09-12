/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { Chess } from 'chess.js'

/**
 * The position as the opening book keys it.
 *
 * A FEN without the move counters, and without an en passant square unless a
 * capture is actually available. That last part is not pedantry: a FEN records
 * the en passant square after every double push, whether or not anything can
 * take there. Without stripping it, the position after 1. e4 c5 2. Nf3 e6
 * would key differently from the same position reached as 1. e4 e6 2. Nf3 c5,
 * and every transposition through one of them would be missed.
 *
 * scripts/fetch-openings.mjs contains the same function. They must agree: the
 * book is written with one and read with the other.
 */
export function toEpd(fen: string): string {
  const [board, turn, castling, enPassant] = fen.split(' ')
  if (board === undefined || turn === undefined || castling === undefined) return fen
  if (enPassant === undefined || enPassant === '-') return `${board} ${turn} ${castling} -`

  try {
    const capturable = new Chess(fen)
      .moves({ verbose: true })
      .some((move) => move.flags.includes('e'))
    return `${board} ${turn} ${castling} ${capturable ? enPassant : '-'}`
  } catch {
    // A position that cannot be set up has no en passant capture either.
    return `${board} ${turn} ${castling} -`
  }
}
