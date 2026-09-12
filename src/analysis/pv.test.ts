/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import { fenError, isValidFen, parseUciMove, uciMoveToSan, uciPvToSan } from './pv.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('isValidFen', () => {
  it('accepts a well-formed position', () => {
    expect(isValidFen(START_FEN)).toBe(true)
  })

  it('rejects nonsense', () => {
    expect(isValidFen('garbage')).toBe(false)
    expect(isValidFen('')).toBe(false)
  })

  it('rejects a position with the wrong number of fields', () => {
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).toBe(false)
  })
})

describe('fenError', () => {
  it('is null for a valid position', () => {
    expect(fenError(START_FEN)).toBeNull()
  })

  it('explains why a position was rejected', () => {
    expect(fenError('garbage')).toMatch(/Invalid FEN/)
  })
})

describe('parseUciMove', () => {
  it('splits a plain move', () => {
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4' })
  })

  it('splits a promotion', () => {
    expect(parseUciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
  })

  it('rejects anything that is not a UCI move', () => {
    expect(parseUciMove('')).toBeNull()
    expect(parseUciMove('e2')).toBeNull()
    expect(parseUciMove('e2e9')).toBeNull()
    expect(parseUciMove('z2z4')).toBeNull()
    expect(parseUciMove('e7e8k')).toBeNull()
    expect(parseUciMove('(none)')).toBeNull()
  })
})

describe('uciPvToSan', () => {
  it('converts a variation from the starting position', () => {
    expect(uciPvToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
    ])
  })

  it('marks checks and captures', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1'

    expect(uciPvToSan(fen, ['f3f7'])).toEqual(['Qxf7#'])
  })

  it('formats castling', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1'

    expect(uciPvToSan(fen, ['e1g1', 'e8g8'])).toEqual(['O-O', 'O-O'])
  })

  it('formats a promotion', () => {
    expect(uciPvToSan('8/P6k/8/8/8/8/6K1/8 w - - 0 1', ['a7a8q'])).toEqual(['a8=Q'])
  })

  it('disambiguates when two pieces can reach the square', () => {
    expect(uciPvToSan('4k3/8/8/8/8/8/6K1/R6R w - - 0 1', ['a1d1'])).toEqual(['Rad1'])
  })

  it('respects the side to move encoded in the FEN', () => {
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'

    expect(uciPvToSan(blackToMove, ['e7e5'])).toEqual(['e5'])
  })

  it('is empty for a variation that is empty', () => {
    expect(uciPvToSan(START_FEN, [])).toEqual([])
  })

  it('is empty for a position that cannot be set up', () => {
    expect(uciPvToSan('garbage', ['e2e4'])).toEqual([])
  })

  it('stops at the first move that cannot be played', () => {
    expect(uciPvToSan(START_FEN, ['e2e4', 'a1a8', 'g1f3'])).toEqual(['e4'])
  })

  it('stops at a malformed move without throwing', () => {
    expect(uciPvToSan(START_FEN, ['e2e4', '(none)'])).toEqual(['e4'])
  })

  it('does not leak state between calls', () => {
    uciPvToSan(START_FEN, ['e2e4', 'e7e5'])

    expect(uciPvToSan(START_FEN, ['d2d4'])).toEqual(['d4'])
  })
})

describe('uciMoveToSan', () => {
  it('converts a single move', () => {
    expect(uciMoveToSan(START_FEN, 'g1f3')).toBe('Nf3')
  })

  it('is null for a move that cannot be played', () => {
    expect(uciMoveToSan(START_FEN, 'e1e8')).toBeNull()
  })

  it('is null for the empty best move of a terminal position', () => {
    expect(uciMoveToSan(START_FEN, '')).toBeNull()
  })
})
