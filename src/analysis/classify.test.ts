/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import {
  BEST_MOVE_TOLERANCE,
  CLASSIFICATION_THRESHOLDS,
  FORCED_ALTERNATIVE_GAP,
  allowsAvoidableMate,
  classifyMove,
  isNoteworthy,
} from './classify.ts'
import type { ClassificationInput } from './classify.ts'

/** A quiet, level position with plenty of choices, unless a test says otherwise. */
function input(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    winPercentBefore: 50,
    winPercentAfter: 50,
    isTopEngineMove: false,
    legalMoveCount: 30,
    ...overrides,
  }
}

/** Classifies a move that gave away exactly `lost` points. */
function lost(lost: number, overrides: Partial<ClassificationInput> = {}) {
  return classifyMove(input({ winPercentBefore: 50, winPercentAfter: 50 - lost, ...overrides }))
}

describe('classifyMove: the bands', () => {
  it('grades by how much winning chance was given away', () => {
    expect(lost(1.5).classification).toBe('excellent')
    expect(lost(3).classification).toBe('good')
    expect(lost(7).classification).toBe('inaccuracy')
    expect(lost(15).classification).toBe('mistake')
    expect(lost(40).classification).toBe('blunder')
  })

  it('puts each boundary in the harsher band', () => {
    const { excellent, good, inaccuracy, mistake } = CLASSIFICATION_THRESHOLDS

    expect(lost(excellent).classification).toBe('good')
    expect(lost(good).classification).toBe('inaccuracy')
    expect(lost(inaccuracy).classification).toBe('mistake')
    expect(lost(mistake).classification).toBe('blunder')
  })

  it('reports how much was lost alongside the grade', () => {
    expect(lost(12.5).winPercentLost).toBeCloseTo(12.5, 10)
  })

  it('never reports a negative loss when the move beat the engine expectation', () => {
    const result = classifyMove(input({ winPercentBefore: 50, winPercentAfter: 58 }))

    expect(result.winPercentLost).toBe(0)
    expect(result.classification).toBe('best')
  })
})

describe('classifyMove: best', () => {
  it('calls the engine first choice best, however much the position changed', () => {
    const result = classifyMove(
      input({ winPercentBefore: 90, winPercentAfter: 60, isTopEngineMove: true }),
    )

    expect(result.classification).toBe('best')
  })

  it('calls a move within the tolerance best, even when it is not the engine choice', () => {
    expect(lost(BEST_MOVE_TOLERANCE).classification).toBe('best')
    expect(lost(0.4).classification).toBe('best')
  })

  it('drops to excellent just past the tolerance', () => {
    expect(lost(BEST_MOVE_TOLERANCE + 0.01).classification).toBe('excellent')
  })
})

describe('classifyMove: the win-percentage premise', () => {
  it('forgives a large centipawn drop that barely moves the winning chances', () => {
    // Stockfish reports both +9 and +6 as very nearly a certain win, so the
    // 300cp the move cost buys the opponent almost nothing.
    const result = classifyMove(input({ winPercentBefore: 99.8, winPercentAfter: 99.2 }))

    expect(result.classification).toBe('best')
  })

  it('punishes a much smaller drop that moves them a great deal', () => {
    // 80cp in a level position: far less material, far more consequence.
    const result = classifyMove(input({ winPercentBefore: 50, winPercentAfter: 42.7 }))

    expect(result.classification).toBe('inaccuracy')
  })

  it('punishes a large drop in a level position harder still', () => {
    const result = classifyMove(input({ winPercentBefore: 50, winPercentAfter: 32 }))

    expect(result.classification).toBe('mistake')
  })

  it('treats throwing away a won game as a blunder', () => {
    const result = classifyMove(input({ winPercentBefore: 95, winPercentAfter: 20 }))

    expect(result.classification).toBe('blunder')
  })
})

describe('classifyMove: forced', () => {
  it('marks a position with a single legal move as forced', () => {
    expect(classifyMove(input({ legalMoveCount: 1 })).classification).toBe('forced')
  })

  it('marks it forced even when the only move loses the game', () => {
    const result = classifyMove(
      input({ legalMoveCount: 1, winPercentBefore: 70, winPercentAfter: 5 }),
    )

    expect(result.classification).toBe('forced')
    // The loss is still reported: the position was lost, the player was not at fault.
    expect(result.winPercentLost).toBeCloseTo(65, 10)
  })

  it('marks the only good move forced when the alternatives collapse', () => {
    const result = classifyMove(
      input({
        winPercentBefore: 60,
        winPercentAfter: 60,
        isTopEngineMove: true,
        secondBestWinPercent: 60 - FORCED_ALTERNATIVE_GAP,
      }),
    )

    expect(result.classification).toBe('forced')
  })

  it('does not call it forced when the second choice is nearly as good', () => {
    const result = classifyMove(
      input({ winPercentBefore: 60, winPercentAfter: 60, isTopEngineMove: true, secondBestWinPercent: 58 }),
    )

    expect(result.classification).toBe('best')
  })

  it('does not call it forced for a player who missed the only move', () => {
    // The position was not forced for them; they walked into the trap.
    const result = classifyMove(
      input({
        winPercentBefore: 60,
        winPercentAfter: 25,
        isTopEngineMove: false,
        secondBestWinPercent: 20,
      }),
    )

    expect(result.classification).toBe('blunder')
  })

  it('does not guess at forcedness without MultiPV data', () => {
    const result = classifyMove(input({ isTopEngineMove: true }))

    expect(result.classification).toBe('best')
  })
})

describe('isNoteworthy', () => {
  it('flags the grades worth explaining to the player', () => {
    expect(isNoteworthy('blunder')).toBe(true)
    expect(isNoteworthy('mistake')).toBe(true)
    expect(isNoteworthy('inaccuracy')).toBe(true)
  })

  it('leaves the rest alone', () => {
    expect(isNoteworthy('best')).toBe(false)
    expect(isNoteworthy('excellent')).toBe(false)
    expect(isNoteworthy('good')).toBe(false)
    expect(isNoteworthy('forced')).toBe(false)
  })
})

describe('classifyMove: walking into mate', () => {
  /** The real shape of the bug: already lost, so the delta cannot fall. */
  const alreadyLost = { winPercentBefore: 0, winPercentAfter: 0 }

  it('calls an avoidable mate a blunder even when nothing measurable was lost', () => {
    const grade = classifyMove(
      input({ ...alreadyLost, mate: { mateBefore: null, mateAfter: -1 } }),
    )

    expect(grade.classification).toBe('blunder')
    // The arithmetic is untouched: the move really did cost nothing measurable.
    expect(grade.winPercentLost).toBe(0)
  })

  it('stays quiet when the mate was already there to begin with', () => {
    const grade = classifyMove(
      input({ ...alreadyLost, mate: { mateBefore: -3, mateAfter: -1 } }),
    )

    expect(grade.classification).not.toBe('blunder')
  })

  it('does not punish the engine own choice when every move allows mate', () => {
    const grade = classifyMove(
      input({ ...alreadyLost, isTopEngineMove: true, mate: { mateBefore: null, mateAfter: -2 } }),
    )

    expect(grade.classification).toBe('best')
  })

  it('leaves a move that delivers mate alone', () => {
    const grade = classifyMove(
      input({ winPercentBefore: 100, winPercentAfter: 100, mate: { mateBefore: 2, mateAfter: 1 } }),
    )

    expect(grade.classification).not.toBe('blunder')
  })

  it('grades normally when the caller has no mate information', () => {
    expect(lost(0).classification).toBe('best')
    expect(lost(40).classification).toBe('blunder')
  })
})

describe('allowsAvoidableMate', () => {
  it('is true only for a mate this move let in', () => {
    expect(allowsAvoidableMate({ mateBefore: null, mateAfter: -1 })).toBe(true)
    // Mating the opponent is not allowing a mate.
    expect(allowsAvoidableMate({ mateBefore: null, mateAfter: 3 })).toBe(false)
    // No mate on the board at all.
    expect(allowsAvoidableMate({ mateBefore: null, mateAfter: null })).toBe(false)
    // Being mated already: this move is not what let it in.
    expect(allowsAvoidableMate({ mateBefore: -2, mateAfter: -1 })).toBe(false)
    // Had a mate, threw it away, and is now the one being mated.
    expect(allowsAvoidableMate({ mateBefore: 2, mateAfter: -1 })).toBe(true)
  })
})
