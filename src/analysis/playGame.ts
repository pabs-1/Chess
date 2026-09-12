/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * The rules side of playing a game: legal moves, applying one, and knowing when
 * it is over. Pure, and data only — the engine and React live elsewhere.
 */

import { Chess } from 'chess.js'

import type { Color, GameMove } from './types.ts'

/** How much help the player has asked for. */
export type PlayMode =
  /** Just play. No commentary, no interference. */
  | 'free'
  /** Every move of yours is explained once it is made, and the game goes on. */
  | 'coach'
  /** A blunder is refused before it reaches the board, and you try again. */
  | 'training'

export const PLAY_MODES: readonly PlayMode[] = ['free', 'coach', 'training']

export type PlayOutcome =
  | 'playing'
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move'
  | 'threefold'

/** Legal destinations per origin square, the shape a board wants. */
export type Destinations = Map<string, string[]>

/**
 * A position a FEN cannot describe is a bug upstream, not something a board
 * should crash on. Every reader here answers "nothing" rather than throwing.
 */
function boardAt(fen: string): Chess | null {
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}

export function legalDestinations(fen: string): Destinations {
  const board = boardAt(fen)
  const dests: Destinations = new Map()
  if (board === null) return dests

  for (const move of board.moves({ verbose: true })) {
    const existing = dests.get(move.from)
    if (existing === undefined) dests.set(move.from, [move.to])
    else if (!existing.includes(move.to)) existing.push(move.to)
  }

  return dests
}

/** Whether the game has ended, and how. */
export function outcomeOf(fen: string): PlayOutcome {
  const board = boardAt(fen)
  if (board === null) return 'playing'
  if (board.isCheckmate()) return 'checkmate'
  if (board.isStalemate()) return 'stalemate'
  if (board.isInsufficientMaterial()) return 'insufficient-material'
  if (board.isThreefoldRepetition()) return 'threefold'
  if (board.isDrawByFiftyMoves()) return 'fifty-move'
  return 'playing'
}

export function isCheck(fen: string): boolean {
  return boardAt(fen)?.isCheck() ?? false
}

/** Whether a pawn move would land on the last rank and so needs a choice. */
export function needsPromotion(fen: string, from: string, to: string): boolean {
  const piece = boardAt(fen)?.get(from as never)
  if (piece?.type !== 'p') return false

  return piece.color === 'w' ? to.endsWith('8') : to.endsWith('1')
}

/**
 * Plays a move, returning it in the shape the rest of the analysis layer uses.
 *
 * Null when the move is not legal, which is how an interface that let one
 * through finds out rather than by corrupting the game.
 */
export function makeMove(
  fen: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' | undefined,
  ply: number,
): GameMove | null {
  const board = boardAt(fen)
  if (board === null) return null

  try {
    const move = board.move({ from, to, ...(promotion === undefined ? {} : { promotion }) })
    return {
      ply,
      moveNumber: Number.parseInt(fen.split(' ')[5] ?? '1', 10) || 1,
      color: move.color,
      san: move.san,
      uci: move.lan,
      fenBefore: fen,
      fenAfter: board.fen(),
    }
  } catch {
    return null
  }
}

/** Whose turn it is. */
export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}
