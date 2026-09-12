/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Board questions the detectors ask.
 *
 * Every function takes a FEN and returns a plain answer: nothing is mutated and
 * nothing is cached, so a detector can never leave the board in a state that
 * affects the next one.
 */

import { Chess } from 'chess.js'
import type { Move, Square } from 'chess.js'

import { parseUciMove } from '../pv.ts'
import type { Color } from '../types.ts'
import type { PieceCode, PieceOnSquare } from './types.ts'

/** Ordinary material values. The king has none: it is never won. */
export const PIECE_VALUES: Record<PieceCode, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const SQUARE_PATTERN = /^[a-h][1-8]$/

export function isSquare(value: string): value is Square {
  return SQUARE_PATTERN.test(value)
}

export function opponent(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

function boardAt(fen: string): Chess | null {
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}

export function pieceAt(fen: string, square: string): PieceOnSquare & { color: Color } | null {
  const board = boardAt(fen)
  if (board === null || !isSquare(square)) return null

  const piece = board.get(square)
  if (piece === undefined) return null

  return { piece: piece.type, square, color: piece.color }
}

/** Plays a UCI move, returning the resulting position and the move itself. */
export function playUci(fen: string, uci: string): { fen: string; move: Move } | null {
  const board = boardAt(fen)
  const parsed = parseUciMove(uci)
  if (board === null || parsed === null) return null

  try {
    const move = board.move(parsed)
    return { fen: board.fen(), move }
  } catch {
    return null
  }
}

/** Squares from which `color` attacks `square`; defenders when it is their own. */
export function attackersOf(fen: string, square: string, color: Color): string[] {
  const board = boardAt(fen)
  if (board === null || !isSquare(square)) return []
  return board.attackers(square, color)
}

/** Every piece of `color` that the piece standing on `from` attacks. */
export function piecesAttackedFrom(fen: string, from: string, color: Color): PieceOnSquare[] {
  const board = boardAt(fen)
  if (board === null || !isSquare(from)) return []

  const attacked: PieceOnSquare[] = []
  for (const row of board.board()) {
    for (const entry of row) {
      if (entry?.color !== color) continue
      if (board.attackers(entry.square, opponent(color)).includes(from)) {
        attacked.push({ piece: entry.type, square: entry.square })
      }
    }
  }
  return attacked
}

/** The castling rights field of a FEN, as the two flags for one colour. */
export function castlingRights(fen: string, color: Color): { king: boolean; queen: boolean } {
  const field = fen.split(' ')[2] ?? '-'
  return color === 'w'
    ? { king: field.includes('K'), queen: field.includes('Q') }
    : { king: field.includes('k'), queen: field.includes('q') }
}

/**
 * Material won by starting a sequence of captures on one square.
 *
 * Static exchange evaluation: each side takes with its least valuable attacker
 * in turn, and either side stops as soon as continuing would cost it. The
 * result is what `side` gains by capturing there, in pawns, never negative —
 * a side that would lose by capturing simply does not.
 *
 * Pieces are moved on a real board rather than on a copy so that x-ray
 * attackers appear as the pieces in front of them come off, which is the whole
 * reason a naive count of attackers and defenders gets exchanges wrong.
 *
 * Pins are ignored, as they are in every engine's SEE: a pinned defender is
 * counted as a defender.
 */
export function staticExchangeGain(fen: string, square: string, side: Color): number {
  const board = boardAt(fen)
  if (board === null || !isSquare(square)) return 0
  return exchange(board, square, side)
}

function exchange(board: Chess, square: Square, side: Color): number {
  const target = board.get(square)
  if (target === undefined) return 0

  const attackers = board.attackers(square, side)
  const from = leastValuable(board, attackers)
  if (from === null) return 0

  const attacker = board.get(from)
  if (attacker === undefined) return 0

  board.remove(from)
  board.remove(square)
  board.put(attacker, square)

  // Recapturing is optional: a side only continues when it comes out ahead.
  const gain = Math.max(0, PIECE_VALUES[target.type] - exchange(board, square, opponent(side)))

  board.remove(square)
  board.put(attacker, from)
  board.put(target, square)

  return gain
}

function leastValuable(board: Chess, squares: readonly Square[]): Square | null {
  let best: Square | null = null
  let bestValue = Number.POSITIVE_INFINITY

  for (const square of squares) {
    const piece = board.get(square)
    if (piece === undefined) continue
    // The king is the most expensive attacker there is: it cannot be traded.
    const value = piece.type === 'k' ? 1000 : PIECE_VALUES[piece.type]
    if (value < bestValue) {
      bestValue = value
      best = square
    }
  }

  return best
}

/** Where a colour's king stands, or null in a position without one. */
export function kingSquare(fen: string, color: Color): string | null {
  const board = boardAt(fen)
  if (board === null) return null

  const found = board.findPiece({ type: 'k', color })
  return found[0] ?? null
}
