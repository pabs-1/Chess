/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import {
  isCheck,
  legalDestinations,
  makeMove,
  needsPromotion,
  outcomeOf,
  turnOf,
} from './playGame.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('legalDestinations', () => {
  it('lists every legal move grouped by origin', () => {
    const dests = legalDestinations(START_FEN)

    expect(dests.get('e2')?.sort()).toEqual(['e3', 'e4'])
    expect(dests.get('g1')?.sort()).toEqual(['f3', 'h3'])
    // Twenty legal moves from the start: sixteen pawn, four knight.
    expect([...dests.values()].flat()).toHaveLength(20)
  })

  it('offers nothing in a finished position', () => {
    expect(legalDestinations('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').size).toBe(0)
  })

  it('respects a pin', () => {
    // The knight on e4 is pinned against its own king by the rook on e8.
    expect(legalDestinations('4r1k1/8/8/8/4N3/8/8/4K3 w - - 0 1').has('e4')).toBe(false)
  })
})

describe('outcomeOf', () => {
  it('recognises a game still in play', () => {
    expect(outcomeOf(START_FEN)).toBe('playing')
  })

  it('recognises checkmate', () => {
    expect(outcomeOf('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe(
      'checkmate',
    )
  })

  it('recognises stalemate', () => {
    expect(outcomeOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('stalemate')
  })

  it('recognises a draw by insufficient material', () => {
    expect(outcomeOf('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('insufficient-material')
  })
})

describe('isCheck', () => {
  it('is true when the side to move is in check', () => {
    expect(isCheck('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isCheck(START_FEN)).toBe(false)
  })
})

describe('needsPromotion', () => {
  it('is true for a pawn reaching the last rank', () => {
    expect(needsPromotion('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8')).toBe(true)
    expect(needsPromotion('4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a2', 'a1')).toBe(true)
  })

  it('is false for a pawn anywhere else', () => {
    expect(needsPromotion(START_FEN, 'e2', 'e4')).toBe(false)
  })

  it('is false for a piece reaching the last rank', () => {
    expect(needsPromotion('4k3/R7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8')).toBe(false)
  })

  it('is false for an empty square', () => {
    expect(needsPromotion(START_FEN, 'e4', 'e5')).toBe(false)
  })
})

describe('makeMove', () => {
  it('returns the move in the shape the analysis layer uses', () => {
    const move = makeMove(START_FEN, 'e2', 'e4', undefined, 0)

    expect(move).toMatchObject({
      ply: 0,
      moveNumber: 1,
      color: 'w',
      san: 'e4',
      uci: 'e2e4',
      fenBefore: START_FEN,
    })
    expect(move?.fenAfter).toContain(' b ')
  })

  it('carries the move number of the position it was played from', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 17'

    expect(makeMove(fen, 'g1', 'f3', undefined, 32)?.moveNumber).toBe(17)
  })

  it('promotes to the piece asked for', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'

    expect(makeMove(fen, 'a7', 'a8', 'q', 0)?.san).toBe('a8=Q+')
    expect(makeMove(fen, 'a7', 'a8', 'n', 0)?.san).toBe('a8=N')
  })

  it('is null for a move that is not legal', () => {
    expect(makeMove(START_FEN, 'e2', 'e5', undefined, 0)).toBeNull()
    expect(makeMove(START_FEN, 'e4', 'e5', undefined, 0)).toBeNull()
  })

  it('is null for a position that cannot be set up', () => {
    expect(makeMove('nonsense', 'e2', 'e4', undefined, 0)).toBeNull()
  })
})

describe('turnOf', () => {
  it('reads the side to move', () => {
    expect(turnOf(START_FEN)).toBe('w')
    expect(turnOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('b')
  })
})
