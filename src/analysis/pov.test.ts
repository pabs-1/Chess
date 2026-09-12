/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import {
  invertEvaluation,
  invertWdl,
  opponentOf,
  sideToMove,
  toPov,
  toWhitePov,
  winPercentFor,
} from './pov.ts'
import type { Evaluation } from './types.ts'

const evaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  cp: null,
  mate: null,
  wdl: null,
  ...overrides,
})

describe('sideToMove', () => {
  it('reads the side to move out of a FEN', () => {
    expect(sideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('w')
    expect(sideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('b')
  })
})

describe('invertWdl', () => {
  it('swaps win and loss and leaves the draw alone', () => {
    expect(invertWdl({ win: 710, draw: 250, loss: 40 })).toEqual({
      win: 40,
      draw: 250,
      loss: 710,
    })
  })

  it('is its own inverse', () => {
    const wdl = { win: 123, draw: 456, loss: 421 }

    expect(invertWdl(invertWdl(wdl))).toEqual(wdl)
  })
})

describe('invertEvaluation', () => {
  it('flips a centipawn score', () => {
    expect(invertEvaluation(evaluation({ cp: 120 })).cp).toBe(-120)
    expect(invertEvaluation(evaluation({ cp: -35 })).cp).toBe(35)
  })

  it('turns a level score into a level score, not negative zero', () => {
    const flipped = invertEvaluation(evaluation({ cp: 0 }))

    expect(flipped.cp).toBe(0)
    expect(Object.is(flipped.cp, -0)).toBe(false)
  })

  it('flips a mate score: mating becomes being mated', () => {
    expect(invertEvaluation(evaluation({ mate: 3 })).mate).toBe(-3)
    expect(invertEvaluation(evaluation({ mate: -1 })).mate).toBe(1)
  })

  it('flips the WDL alongside the score', () => {
    const flipped = invertEvaluation(evaluation({ cp: 300, wdl: { win: 800, draw: 150, loss: 50 } }))

    expect(flipped.wdl).toEqual({ win: 50, draw: 150, loss: 800 })
  })

  it('leaves absent fields absent', () => {
    expect(invertEvaluation(evaluation({ cp: 10 }))).toEqual({ cp: -10, mate: null, wdl: null })
  })

  it('is its own inverse', () => {
    const original = evaluation({ cp: -87, wdl: { win: 120, draw: 500, loss: 380 } })

    expect(invertEvaluation(invertEvaluation(original))).toEqual(original)
  })

  it('does not mutate its input', () => {
    const original = evaluation({ cp: 50, wdl: { win: 600, draw: 300, loss: 100 } })
    invertEvaluation(original)

    expect(original.cp).toBe(50)
    expect(original.wdl).toEqual({ win: 600, draw: 300, loss: 100 })
  })
})

describe('toPov', () => {
  it('leaves an evaluation alone when it is already for the wanted side', () => {
    const original = evaluation({ cp: 75 })

    expect(toPov(original, 'w', 'w')).toBe(original)
    expect(toPov(original, 'b', 'b')).toBe(original)
  })

  it('flips when the sides differ', () => {
    expect(toPov(evaluation({ cp: 75 }), 'b', 'w').cp).toBe(-75)
    expect(toPov(evaluation({ cp: 75 }), 'w', 'b').cp).toBe(-75)
  })
})

describe('toWhitePov', () => {
  it('keeps a White evaluation as it is', () => {
    expect(toWhitePov(evaluation({ cp: 40 }), 'w').cp).toBe(40)
  })

  it('flips a Black evaluation', () => {
    // Black to move, +200 for Black, is -200 on a White-relative graph.
    expect(toWhitePov(evaluation({ cp: 200 }), 'b').cp).toBe(-200)
  })
})

describe('winPercentFor', () => {
  it('reads a WDL for the side it is expressed for', () => {
    const winning = evaluation({ wdl: { win: 1000, draw: 0, loss: 0 } })

    expect(winPercentFor(winning, 'w', 'w')).toBe(100)
  })

  it('reads a WDL for the other side', () => {
    const winning = evaluation({ wdl: { win: 1000, draw: 0, loss: 0 } })

    expect(winPercentFor(winning, 'w', 'b')).toBe(0)
  })

  it('always sums to 100 across the two sides', () => {
    const position = evaluation({ wdl: { win: 340, draw: 500, loss: 160 } })

    expect(winPercentFor(position, 'w', 'w') + winPercentFor(position, 'w', 'b')).toBeCloseTo(100, 10)
  })

  it('flips a centipawn evaluation', () => {
    const position = evaluation({ cp: 300 })

    expect(winPercentFor(position, 'w', 'w')).toBeCloseTo(75.1126, 3)
    expect(winPercentFor(position, 'w', 'b')).toBeCloseTo(24.8874, 3)
  })

  it('flips a mate evaluation', () => {
    const position = evaluation({ mate: 4 })

    expect(winPercentFor(position, 'b', 'b')).toBe(100)
    expect(winPercentFor(position, 'b', 'w')).toBe(0)
  })

  it('reads a real pair of consecutive engine evaluations consistently', () => {
    // White plays a move; the engine evaluates the resulting position with
    // Black to move, so +50 there means Black is slightly better. For White
    // that is a position below 50%.
    const afterWhiteMove = evaluation({ cp: 50 })
    const forWhite = winPercentFor(afterWhiteMove, 'b', 'w')

    expect(forWhite).toBeLessThan(50)
    expect(forWhite).toBeCloseTo(100 - winPercentFor(afterWhiteMove, 'b', 'b'), 10)
  })
})

describe('opponentOf', () => {
  it('swaps the colours', () => {
    expect(opponentOf('w')).toBe('b')
    expect(opponentOf('b')).toBe('w')
  })
})
