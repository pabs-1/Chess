/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Converting engine output into human-readable chess notation.
 *
 * Stockfish speaks UCI long algebraic ("e2e4", "e7e8q"); people read SAN
 * ("e4", "e8=Q+"). This is notation, not language: SAN is identical in every
 * locale, so it stays here in the analysis layer and never touches i18n.
 *
 * Pure: a position goes in, strings come out, nothing is mutated.
 */

import { Chess, validateFen } from 'chess.js'

/** Whether a FEN string describes a position chess.js can actually set up. */
export function isValidFen(fen: string): boolean {
  return validateFen(fen).ok
}

/** The reason a FEN was rejected, or null when it is valid. */
export function fenError(fen: string): string | null {
  const result = validateFen(fen)
  return result.ok ? null : (result.error ?? 'Invalid FEN')
}

interface UciMove {
  from: string
  to: string
  promotion?: string
}

/** Splits a UCI move: "e7e8q" → from e7, to e8, promoting to a queen. */
export function parseUciMove(uci: string): UciMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null

  const promotion = uci.slice(4)
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(promotion === '' ? {} : { promotion }),
  }
}

/**
 * Converts a principal variation from UCI to SAN.
 *
 * Stops at the first move that cannot be played — an illegal move means the
 * rest of the variation is meaningless anyway — and returns an empty array for
 * a position that cannot be set up. Never throws: a malformed variation is a
 * display problem, not a reason to take the page down.
 */
export function uciPvToSan(fen: string, pv: readonly string[]): string[] {
  if (!isValidFen(fen)) return []

  const board = new Chess(fen)
  const san: string[] = []

  for (const uci of pv) {
    const move = parseUciMove(uci)
    if (move === null) break

    try {
      san.push(board.move(move).san)
    } catch {
      break
    }
  }

  return san
}

/** Converts a single UCI move in a position, or null when it cannot be played. */
export function uciMoveToSan(fen: string, uci: string): string | null {
  return uciPvToSan(fen, [uci])[0] ?? null
}
