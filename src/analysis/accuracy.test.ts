/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import { gameAccuracy, moveAccuracy } from './accuracy.ts'

describe('moveAccuracy', () => {
  it('scores a move that gives away nothing at 100', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 2)
  })

  it('falls as more is given away', () => {
    const scores = [0, 2, 5, 10, 20, 40].map(moveAccuracy)
    const descending = [...scores].sort((a, b) => b - a)

    expect(scores).toEqual(descending)
  })

  it('matches the reference curve', () => {
    expect(moveAccuracy(2)).toBeCloseTo(91.4, 1)
    expect(moveAccuracy(10)).toBeCloseTo(63.58, 1)
    expect(moveAccuracy(20)).toBeCloseTo(40.02, 1)
  })

  it('treats a move that beat expectation as giving away nothing', () => {
    expect(moveAccuracy(-5)).toBe(moveAccuracy(0))
  })

  it('never leaves 0–100', () => {
    expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0)
    expect(moveAccuracy(1000)).toBe(0)
  })
})

describe('gameAccuracy', () => {
  it('averages the moves', () => {
    expect(gameAccuracy([100, 50])).toBeCloseTo(75, 10)
  })

  it('is the score itself for a single move', () => {
    expect(gameAccuracy([87.5])).toBeCloseTo(87.5, 10)
  })

  it('is null when the player made no moves', () => {
    // A one-ply game has no Black accuracy; inventing a number would be a lie.
    expect(gameAccuracy([])).toBeNull()
  })

  it('is 100 for a flawless game', () => {
    expect(gameAccuracy([100, 100, 100])).toBe(100)
  })

  it('stays within 0–100', () => {
    const accuracy = gameAccuracy([0, 0, 100])

    expect(accuracy).toBeGreaterThanOrEqual(0)
    expect(accuracy).toBeLessThanOrEqual(100)
  })
})
