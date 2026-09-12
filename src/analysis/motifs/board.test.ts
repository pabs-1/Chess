/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import {
  attackersOf,
  castlingRights,
  kingSquare,
  piecesAttackedFrom,
  playUci,
  staticExchangeGain,
} from './board.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('staticExchangeGain', () => {
  it('is the piece itself when nothing defends it', () => {
    // A lone black rook on d5, a white pawn on c4 that can take it.
    expect(staticExchangeGain('4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(5)
  })

  it('subtracts the recapture', () => {
    // Same rook, now defended by the c6 pawn: pawn takes rook, pawn takes pawn.
    expect(staticExchangeGain('4k3/8/2p5/3r4/2P5/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(4)
  })

  it('is zero when the exchange would lose material', () => {
    // A defended pawn, attacked only by a rook: taking it loses the exchange.
    expect(staticExchangeGain('4k3/2p5/3p4/8/8/3R4/8/4K3 w - - 0 1', 'd6', 'w')).toBe(0)
  })

  it('is zero for a square with nothing on it', () => {
    expect(staticExchangeGain(START_FEN, 'e4', 'w')).toBe(0)
  })

  it('is zero when the side has no attackers', () => {
    expect(staticExchangeGain('4k3/8/8/3r4/8/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(0)
  })

  it('takes with the least valuable attacker first', () => {
    // A black knight on d5 attacked by both a pawn and a queen: the pawn goes.
    // Pawn takes knight (3); nothing recaptures, so the gain is the knight.
    expect(staticExchangeGain('4k3/8/8/3n4/2P5/8/3Q4/4K3 w - - 0 1', 'd5', 'w')).toBe(3)
  })

  it('sees the x-ray attacker behind the first one', () => {
    // Two white rooks stacked on the d file against a defended black pawn.
    // Rxd5 pxR, Rxd5 wins: the second rook only exists once the first moves.
    const doubled = '4k3/2p5/8/3p4/8/3R4/3R4/4K3 w - - 0 1'

    expect(staticExchangeGain(doubled, 'd5', 'w')).toBeGreaterThan(0)
  })

  it('does not disturb the position it was asked about', () => {
    const fen = '4k3/8/2p5/3r4/2P5/8/8/4K3 w - - 0 1'
    staticExchangeGain(fen, 'd5', 'w')

    // The board is mutated during the search and must be put back exactly.
    expect(staticExchangeGain(fen, 'd5', 'w')).toBe(4)
  })
})

describe('playUci', () => {
  it('returns the resulting position and the move', () => {
    const played = playUci(START_FEN, 'e2e4')

    expect(played?.move.san).toBe('e4')
    expect(played?.fen).toContain('4P3')
  })

  it('is null for a move that cannot be played', () => {
    expect(playUci(START_FEN, 'e2e5')).toBeNull()
    expect(playUci(START_FEN, 'zzzz')).toBeNull()
  })

  it('is null for a position that cannot be set up', () => {
    expect(playUci('nonsense', 'e2e4')).toBeNull()
  })
})

describe('attackersOf', () => {
  it('finds the attackers of a square', () => {
    const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1'

    expect(attackersOf(fen, 'f7', 'w')).toEqual(['c4'])
  })

  it('finds defenders by asking for the owner colour', () => {
    const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1'

    expect(attackersOf(fen, 'f6', 'b').sort()).toEqual(['d8', 'g7'])
  })

  it('is empty for a square nothing attacks', () => {
    expect(attackersOf(START_FEN, 'e5', 'w')).toEqual([])
  })
})

describe('piecesAttackedFrom', () => {
  it('lists what a piece hits', () => {
    // A white knight on f6 hitting the black king on g8 and rook on e8.
    const fen = '4r1k1/8/5N2/8/8/8/8/5K2 b - - 0 1'

    expect(piecesAttackedFrom(fen, 'f6', 'b').map((hit) => hit.square).sort()).toEqual([
      'e8',
      'g8',
    ])
  })

  it('is empty from a square with nothing to hit', () => {
    expect(piecesAttackedFrom(START_FEN, 'e4', 'b')).toEqual([])
  })
})

describe('castlingRights', () => {
  it('reads both sides out of the FEN', () => {
    expect(castlingRights(START_FEN, 'w')).toEqual({ king: true, queen: true })
    expect(castlingRights(START_FEN, 'b')).toEqual({ king: true, queen: true })
  })

  it('reads a partial right', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Kq - 0 1'

    expect(castlingRights(fen, 'w')).toEqual({ king: true, queen: false })
    expect(castlingRights(fen, 'b')).toEqual({ king: false, queen: true })
  })

  it('reads no rights at all', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'

    expect(castlingRights(fen, 'w')).toEqual({ king: false, queen: false })
  })
})

describe('kingSquare', () => {
  it('finds each king', () => {
    expect(kingSquare(START_FEN, 'w')).toBe('e1')
    expect(kingSquare(START_FEN, 'b')).toBe('e8')
  })

  it('is null for a position that cannot be set up', () => {
    expect(kingSquare('nonsense', 'w')).toBeNull()
  })
})
