/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import {
  formatEval,
  toEvaluation,
  winPercentFromCp,
  winPercentFromEvaluation,
  winPercentFromWdl,
} from './evaluation.ts'
import type { AnalysisLine, Wdl } from '../engine/types.ts'
import type { Evaluation } from './types.ts'

function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return { cp: null, mate: null, wdl: null, ...overrides }
}

describe('winPercentFromWdl', () => {
  const wdl = (win: number, draw: number, loss: number): Wdl => ({ win, draw, loss })

  it('counts a draw as half a win', () => {
    expect(winPercentFromWdl(wdl(0, 1000, 0))).toBe(50)
  })

  it('is 100 for a certain win and 0 for a certain loss', () => {
    expect(winPercentFromWdl(wdl(1000, 0, 0))).toBe(100)
    expect(winPercentFromWdl(wdl(0, 0, 1000))).toBe(0)
  })

  it('converts permille to a percentage', () => {
    // Captured from Stockfish at the starting position: a small pull for White.
    expect(winPercentFromWdl(wdl(71, 923, 6))).toBeCloseTo(53.25, 5)
  })

  it('reads a losing side-to-move position as below 50', () => {
    expect(winPercentFromWdl(wdl(0, 0, 1000))).toBeLessThan(50)
    expect(winPercentFromWdl(wdl(13, 960, 27))).toBeCloseTo(49.3, 5)
  })

  it('stays within 0–100 even if the engine reports something odd', () => {
    expect(winPercentFromWdl(wdl(2000, 0, 0))).toBe(100)
    expect(winPercentFromWdl(wdl(-50, 0, 0))).toBe(0)
  })
})

describe('winPercentFromCp', () => {
  it('is 50 for a dead level position', () => {
    expect(winPercentFromCp(0)).toBe(50)
  })

  it('is symmetric around 50', () => {
    expect(winPercentFromCp(250) + winPercentFromCp(-250)).toBeCloseTo(100, 10)
  })

  it('rises monotonically with the score', () => {
    const percents = [-500, -100, -20, 0, 20, 100, 500].map(winPercentFromCp)
    const sorted = [...percents].sort((a, b) => a - b)

    expect(percents).toEqual(sorted)
  })

  it('matches the reference curve', () => {
    expect(winPercentFromCp(100)).toBeCloseTo(59.1026, 3)
    expect(winPercentFromCp(300)).toBeCloseTo(75.1126, 3)
    expect(winPercentFromCp(-300)).toBeCloseTo(24.8874, 3)
  })

  it('flattens out past ten pawns, so huge scores stay comparable', () => {
    expect(winPercentFromCp(10_000)).toBe(winPercentFromCp(1000))
    expect(winPercentFromCp(-10_000)).toBe(winPercentFromCp(-1000))
  })

  it('never leaves 0–100', () => {
    expect(winPercentFromCp(1_000_000)).toBeLessThanOrEqual(100)
    expect(winPercentFromCp(-1_000_000)).toBeGreaterThanOrEqual(0)
  })

  it('makes a blunder in a level position cost more than the same loss when winning', () => {
    // The sigmoid saturates, so the same centipawns matter less the further
    // ahead you are. The effect is modest on this fallback curve and much
    // stronger on the engine's own WDL, which is what the classifier normally
    // sees, but it points the same way, and that is why grading works on win
    // percentage rather than on centipawns.
    const levelPositionLoss = winPercentFromCp(0) - winPercentFromCp(-80)
    const winningPositionLoss = winPercentFromCp(900) - winPercentFromCp(600)

    expect(levelPositionLoss).toBeGreaterThan(winningPositionLoss)
  })
})

describe('winPercentFromEvaluation', () => {
  it('prefers the engine WDL over the centipawn score', () => {
    const value = winPercentFromEvaluation(evaluation({ cp: 300, wdl: { win: 0, draw: 1000, loss: 0 } }))

    expect(value).toBe(50)
  })

  it('saturates on a mate score', () => {
    expect(winPercentFromEvaluation(evaluation({ mate: 3 }))).toBe(100)
    expect(winPercentFromEvaluation(evaluation({ mate: -3 }))).toBe(0)
  })

  it('treats mate 0 as already mated', () => {
    expect(winPercentFromEvaluation(evaluation({ mate: 0 }))).toBe(0)
  })

  it('prefers a mate score over the centipawn fallback', () => {
    expect(winPercentFromEvaluation(evaluation({ cp: -50, mate: 2 }))).toBe(100)
  })

  it('falls back to centipawns when there is no WDL', () => {
    expect(winPercentFromEvaluation(evaluation({ cp: 100 }))).toBeCloseTo(59.1026, 3)
  })

  it('refuses a line with no evaluation at all', () => {
    expect(() => winPercentFromEvaluation(evaluation())).toThrow(/neither a centipawn score nor a mate/)
  })
})

describe('formatEval', () => {
  it('formats a positive score with an explicit plus', () => {
    expect(formatEval(evaluation({ cp: 35 }))).toBe('+0.35')
    expect(formatEval(evaluation({ cp: 120 }))).toBe('+1.20')
  })

  it('formats a negative score', () => {
    expect(formatEval(evaluation({ cp: -120 }))).toBe('-1.20')
    expect(formatEval(evaluation({ cp: -7 }))).toBe('-0.07')
  })

  it('formats a level score without a sign', () => {
    expect(formatEval(evaluation({ cp: 0 }))).toBe('0.00')
  })

  it('always shows two decimals', () => {
    expect(formatEval(evaluation({ cp: 100 }))).toBe('+1.00')
    expect(formatEval(evaluation({ cp: 1 }))).toBe('+0.01')
    expect(formatEval(evaluation({ cp: 2350 }))).toBe('+23.50')
  })

  it('formats a mate score', () => {
    expect(formatEval(evaluation({ mate: 4 }))).toBe('M4')
    expect(formatEval(evaluation({ mate: 1 }))).toBe('M1')
  })

  it('formats being mated', () => {
    expect(formatEval(evaluation({ mate: -3 }))).toBe('-M3')
  })

  it('prefers the mate score when both are present', () => {
    expect(formatEval(evaluation({ cp: 500, mate: 2 }))).toBe('M2')
  })

  it('refuses a line with no evaluation at all', () => {
    expect(() => formatEval(evaluation())).toThrow(/neither a centipawn score nor a mate/)
  })
})

describe('toEvaluation', () => {
  it('keeps only the evaluation a search line carries', () => {
    const line: AnalysisLine = {
      multipv: 2,
      depth: 20,
      scoreCp: 35,
      scoreMate: null,
      wdl: { win: 71, draw: 923, loss: 6 },
      pv: ['e2e4', 'e7e5'],
    }

    expect(toEvaluation(line)).toEqual({
      cp: 35,
      mate: null,
      wdl: { win: 71, draw: 923, loss: 6 },
    })
  })
})
