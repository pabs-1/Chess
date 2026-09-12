/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import { gamePositions, parsePgn } from './pgn.ts'
import type { ParsedGame } from './types.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A Chess.com export, clock comments and annotation glyphs and all. */
const CHESS_COM_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.03.11"]
[Round "?"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[WhiteElo "1420"]
[BlackElo "1455"]
[TimeControl "600"]

1. e4 {[%clk 0:09:58.1]} e5 {[%clk 0:09:57]} 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5?! d5!
5. exd5 Nd4 $2 6. c3 b5 0-1`

function expectOk(pgn: string): ParsedGame {
  const result = parsePgn(pgn)
  if (!result.ok) throw new Error(`expected a parsed game, got ${result.error}: ${result.detail}`)
  return result.game
}

describe('parsePgn', () => {
  it('reads the moves of a plain game', () => {
    const game = expectOk('1. e4 e5 2. Nf3 Nc6 *')

    expect(game.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(game.initialFen).toBe(START_FEN)
  })

  it('gives each move both notations and the positions either side of it', () => {
    const game = expectOk('1. e4 e5 *')
    const [first, second] = game.moves

    expect(first).toEqual({
      ply: 0,
      moveNumber: 1,
      color: 'w',
      san: 'e4',
      uci: 'e2e4',
      fenBefore: START_FEN,
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    })
    // Each move must start from where the previous one left off.
    expect(second?.fenBefore).toBe(first?.fenAfter)
  })

  it('numbers moves the way the PGN prints them', () => {
    const game = expectOk('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *')

    expect(game.moves.map((move) => move.moveNumber)).toEqual([1, 1, 2, 2, 3, 3])
    expect(game.moves.map((move) => move.color)).toEqual(['w', 'b', 'w', 'b', 'w', 'b'])
  })

  it('reads the headers of a real export', () => {
    const game = expectOk(CHESS_COM_PGN)

    expect(game.headers.white).toBe('alice')
    expect(game.headers.black).toBe('bob')
    expect(game.headers.result).toBe('0-1')
    expect(game.headers.whiteElo).toBe(1420)
    expect(game.headers.blackElo).toBe(1455)
    expect(game.headers.event).toBe('Live Chess')
    // Anything the interface does not model is still reachable.
    expect(game.headers.raw.TimeControl).toBe('600')
  })

  it('treats chess.js placeholder headers as absent', () => {
    const game = expectOk(CHESS_COM_PGN)

    expect(game.headers.round).toBeNull()
  })

  it('is unbothered by clock comments and annotation glyphs', () => {
    const game = expectOk(CHESS_COM_PGN)

    expect(game.moves).toHaveLength(12)
    expect(game.moves.map((move) => move.san).join(' ')).toBe(
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nd4 c3 b5',
    )
  })

  it('keeps the main line and drops variations', () => {
    const game = expectOk('1. e4 (1. d4 d5 2. c4) 1... e5 {a comment} 2. Nf3 *')

    expect(game.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
  })

  it('records castling and promotion in UCI', () => {
    const castling = expectOk('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 *')
    expect(castling.moves[6]?.uci).toBe('e1g1')

    const promotion = expectOk('[SetUp "1"]\n[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. a8=Q+ *')
    expect(promotion.moves[0]?.uci).toBe('a7a8q')
  })

  it('starts a [SetUp] game from its own position and move number', () => {
    const game = expectOk(
      '[SetUp "1"]\n[FEN "8/5k2/8/8/8/8/5K2/7R w - - 4 31"]\n\n31. Rh7+ Kf6 32. Rh6+ *',
    )

    expect(game.initialFen).toBe('8/5k2/8/8/8/8/5K2/7R w - - 4 31')
    expect(game.moves.map((move) => move.moveNumber)).toEqual([31, 31, 32])
  })

  it('handles a [SetUp] game where Black moves first', () => {
    const game = expectOk('[SetUp "1"]\n[FEN "8/5k2/8/8/8/8/5K2/7R b - - 4 31"]\n\n31... Kf6 *')

    expect(game.moves[0]?.color).toBe('b')
    expect(game.moves[0]?.moveNumber).toBe(31)
  })

  it('reports an empty paste', () => {
    expect(parsePgn('')).toMatchObject({ ok: false, error: 'empty' })
    expect(parsePgn('   \n  ')).toMatchObject({ ok: false, error: 'empty' })
  })

  it('reports a PGN with headers but no moves', () => {
    expect(parsePgn('[White "alice"]\n[Black "bob"]\n\n*')).toMatchObject({
      ok: false,
      error: 'no-moves',
    })
  })

  it('reports a move that cannot be played, and says which', () => {
    const result = parsePgn('1. e4 e5 2. Qxf7 *')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid')
    expect(result.detail).toMatch(/Qxf7/)
  })

  it('reports nonsense', () => {
    expect(parsePgn('this is not a game').ok).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(expectOk('\n\n  1. e4 e5  \n\n').moves).toHaveLength(2)
  })
})

describe('gamePositions', () => {
  it('is one longer than the move list: every position the game passes through', () => {
    const game = expectOk('1. e4 e5 2. Nf3 *')
    const positions = gamePositions(game)

    expect(positions).toHaveLength(game.moves.length + 1)
    expect(positions[0]).toBe(START_FEN)
    expect(positions[positions.length - 1]).toBe(game.moves[game.moves.length - 1]?.fenAfter)
  })
})
