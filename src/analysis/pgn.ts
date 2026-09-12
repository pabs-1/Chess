/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * PGN in, typed game out.
 *
 * chess.js does the heavy lifting and handles more than it looks: header tags,
 * Chess.com clock comments, NAGs, `?!`-style annotations, games that start from
 * a [SetUp]/[FEN] position, and variations (it keeps the main line). This
 * module's job is to hand the rest of the app a shape it can rely on, and to
 * turn a rejection into data rather than an exception.
 */

import { Chess } from 'chess.js'

import type { GameHeaders, GameMove, ParsedGame } from './types.ts'

/**
 * Why a PGN could not be read. A code, not a message: the wording lives in the
 * translation files.
 */
export type PgnParseErrorCode =
  /** Nothing was pasted. */
  | 'empty'
  /** chess.js refused it: bad syntax, or a move that cannot be played. */
  | 'invalid'
  /** Read fine, but contains no moves: headers only, say. */
  | 'no-moves'

export type PgnParseResult =
  | { ok: true; game: ParsedGame }
  | { ok: false; error: PgnParseErrorCode; detail: string }

function headerText(raw: Record<string, string>, key: string): string | null {
  const value = raw[key]
  // chess.js fills unknown tags with '?' and dates with '????.??.??'.
  if (value === undefined || value === '' || /^[?.]+$/.test(value)) return null
  return value
}

function headerNumber(raw: Record<string, string>, key: string): number | null {
  const value = headerText(raw, key)
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toHeaders(raw: Record<string, string>): GameHeaders {
  return {
    event: headerText(raw, 'Event'),
    site: headerText(raw, 'Site'),
    date: headerText(raw, 'Date'),
    round: headerText(raw, 'Round'),
    white: headerText(raw, 'White'),
    black: headerText(raw, 'Black'),
    result: headerText(raw, 'Result'),
    whiteElo: headerNumber(raw, 'WhiteElo'),
    blackElo: headerNumber(raw, 'BlackElo'),
    raw: { ...raw },
  }
}

/**
 * Reads the move number from a FEN's fullmove field.
 *
 * Counting plies would be wrong for a game that starts from a position: those
 * begin at whatever move number the FEN says, and possibly with Black to move.
 */
function moveNumberFromFen(fen: string): number {
  const parsed = Number.parseInt(fen.split(' ')[5] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function parsePgn(pgn: string): PgnParseResult {
  const trimmed = pgn.trim()
  if (trimmed === '') return { ok: false, error: 'empty', detail: '' }

  const board = new Chess()
  try {
    board.loadPgn(trimmed)
  } catch (caught) {
    return {
      ok: false,
      error: 'invalid',
      detail: caught instanceof Error ? caught.message : String(caught),
    }
  }

  const history = board.history({ verbose: true })
  const first = history[0]
  if (first === undefined) return { ok: false, error: 'no-moves', detail: '' }

  const moves: GameMove[] = history.map((move, ply) => ({
    ply,
    moveNumber: moveNumberFromFen(move.before),
    color: move.color,
    san: move.san,
    uci: move.lan,
    fenBefore: move.before,
    fenAfter: move.after,
  }))

  return {
    ok: true,
    game: {
      headers: toHeaders(board.getHeaders()),
      initialFen: first.before,
      moves,
    },
  }
}

/** Every position the game passes through, starting position included. */
export function gamePositions(game: ParsedGame): string[] {
  return [game.initialFen, ...game.moves.map((move) => move.fenAfter)]
}
