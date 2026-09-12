/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import { playUci } from './board.ts'
import { DETECTORS, detectMotif } from './index.ts'
import { allowsMate, missesMate } from './mate.ts'
import { hangsPiece, missesMaterial } from './material.ts'
import { losesCastling, weakensKing } from './positional.ts'
import { allowsFork } from './tactics.ts'
import { MOTIF_TIERS } from './types.ts'
import type { MotifContext } from './types.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Builds a context by actually playing the move, so `fenAfter` can never
 * disagree with `fenBefore` and `uci` the way a hand-written fixture could —
 * and an illegal fixture fails loudly instead of quietly testing nothing.
 */
function contextOf(
  fenBefore: string,
  uci: string,
  overrides: Partial<MotifContext> = {},
): MotifContext {
  const played = playUci(fenBefore, uci)
  if (played === null) throw new Error(`fixture move ${uci} is not legal in ${fenBefore}`)

  return {
    fenBefore,
    fenAfter: played.fen,
    uci,
    san: played.move.san,
    mover: played.move.color,
    bestMove: null,
    refutation: [],
    mateBefore: null,
    mateAfter: null,
    classification: 'blunder',
    ...overrides,
  }
}

describe('detector ordering', () => {
  it('consults detectors in tier priority order', () => {
    // The array order is the priority rule, so it must not drift unnoticed.
    expect(DETECTORS.map((detect) => detect.name)).toEqual([
      'allowsMate',
      'missesMate',
      'hangsPiece',
      'missesMaterial',
      'allowsFork',
      'weakensKing',
      'losesCastling',
    ])
  })

  it('ranks the tiers mate, material, tactics, positional', () => {
    expect(MOTIF_TIERS).toEqual(['mate', 'material', 'tactics', 'positional'])
  })
})

describe('allowsMate', () => {
  // 1. f3 e5 2. g4?? and Black mates with Qh4#.
  const BEFORE_G4 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'

  it('fires when the move hands the opponent a forced mate', () => {
    const motif = allowsMate(contextOf(BEFORE_G4, 'g2g4', { mateAfter: -1, refutation: ['d8h4'] }))

    expect(motif).toMatchObject({
      id: 'allows-mate',
      tier: 'mate',
      level: 'beginner',
      moves: 1,
      line: ['Qh4#'],
    })
  })

  it('stays quiet when the player was already being mated', () => {
    const context = contextOf(BEFORE_G4, 'g2g4', { mateBefore: -2, mateAfter: -1 })

    expect(allowsMate(context)).toBeNull()
  })

  it('stays quiet when there is no mate at all', () => {
    expect(allowsMate(contextOf(START_FEN, 'e2e4'))).toBeNull()
  })

  it('stays quiet when the mate is the mover own', () => {
    expect(allowsMate(contextOf(START_FEN, 'e2e4', { mateAfter: 3 }))).toBeNull()
  })
})

describe('missesMate', () => {
  const BACK_RANK = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'

  it('fires when the player had mate and played something else', () => {
    const context = contextOf(BACK_RANK, 'g1f1', { mateBefore: 1, bestMove: 'a1a8' })

    expect(missesMate(context)).toMatchObject({
      id: 'misses-mate',
      tier: 'mate',
      level: 'intermediate',
      moves: 1,
      bestMove: 'Ra8#',
    })
  })

  it('stays quiet when the move played was the mate', () => {
    const context = contextOf(BACK_RANK, 'a1a8', {
      mateBefore: 1,
      mateAfter: 1,
      bestMove: 'a1a8',
    })

    expect(missesMate(context)).toBeNull()
  })

  it('stays quiet without a mate to miss', () => {
    expect(missesMate(contextOf(START_FEN, 'e2e4', { bestMove: 'd2d4' }))).toBeNull()
  })
})

describe('hangsPiece', () => {
  it('names a piece the opponent simply takes', () => {
    // Nd4?? and the knight is taken by the one on c6.
    const before = 'r1bqkbnr/pppp1ppp/2n5/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3'

    expect(hangsPiece(contextOf(before, 'f3d4', { refutation: ['c6d4'] }))).toMatchObject({
      id: 'hangs-piece',
      tier: 'material',
      level: 'beginner',
      target: { piece: 'n', square: 'd4' },
      capture: 'Nxd4',
      undefended: true,
    })
  })

  it('fires on a defended piece when the capture still wins by value', () => {
    // The rook on d5 is defended by the c6 pawn, but a pawn takes it anyway:
    // rook for pawn is winning even after the recapture.
    const before = '4k3/8/2p5/3r4/2P5/8/8/4K3 b - - 0 1'
    const motif = hangsPiece(contextOf(before, 'e8e7', { refutation: ['c4d5'] }))

    expect(motif).toMatchObject({ target: { piece: 'r', square: 'd5' }, undefended: false })
  })

  it('stays quiet on a fair trade the player can recapture', () => {
    // Bxc6 takes a defended knight with a bishop: an even exchange.
    const before = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'

    expect(hangsPiece(contextOf(before, 'b5c6', { refutation: ['d7c6'] }))).toBeNull()
  })

  it('stays quiet when the refutation is not a capture', () => {
    expect(hangsPiece(contextOf(START_FEN, 'e2e4', { refutation: ['e7e5'] }))).toBeNull()
  })

  it('stays quiet without a refutation to look at', () => {
    expect(hangsPiece(contextOf(START_FEN, 'e2e4'))).toBeNull()
  })
})

describe('missesMaterial', () => {
  const FREE_ROOK = '4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1'

  it('names a capture the player passed up', () => {
    expect(missesMaterial(contextOf(FREE_ROOK, 'e1e2', { bestMove: 'c4d5' }))).toMatchObject({
      id: 'misses-material',
      tier: 'material',
      level: 'beginner',
      target: { piece: 'r', square: 'd5' },
      bestMove: 'cxd5',
    })
  })

  it('stays quiet when the player made the capture', () => {
    expect(missesMaterial(contextOf(FREE_ROOK, 'c4d5', { bestMove: 'c4d5' }))).toBeNull()
  })

  it('stays quiet when the best move is not a capture', () => {
    expect(missesMaterial(contextOf(START_FEN, 'a2a3', { bestMove: 'e2e4' }))).toBeNull()
  })
})

describe('allowsFork', () => {
  // Black king h8 and rook e8; a white knight on e4 can reach f6 and hit both.
  const BEFORE_FORK = '4r2k/8/8/8/4N3/8/8/5K2 b - - 0 1'

  it('names the forking piece and everything it hits', () => {
    const motif = allowsFork(contextOf(BEFORE_FORK, 'h8g8', { refutation: ['e4f6'] }))

    expect(motif).toMatchObject({
      id: 'allows-fork',
      tier: 'tactics',
      level: 'intermediate',
      forker: { piece: 'n', square: 'f6' },
      reply: 'Nf6+',
    })

    const targets = motif?.id === 'allows-fork' ? motif.targets : []
    expect(targets.map((target) => `${target.piece}${target.square}`).sort()).toEqual([
      'kg8',
      're8',
    ])
  })

  it('stays quiet when the reply only hits one thing', () => {
    expect(allowsFork(contextOf(BEFORE_FORK, 'h8g8', { refutation: ['e4d6'] }))).toBeNull()
  })

  it('stays quiet without a refutation to look at', () => {
    expect(allowsFork(contextOf(BEFORE_FORK, 'h8g8'))).toBeNull()
  })
})

describe('weakensKing', () => {
  const CASTLED = 'rnbq1rk1/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 0 1'

  it('fires on a pawn push in front of a castled king', () => {
    expect(weakensKing(contextOf(CASTLED, 'g2g4'))).toMatchObject({
      id: 'weakens-king',
      tier: 'positional',
      level: 'advanced',
      from: 'g2',
      kingSquare: 'g1',
    })
  })

  it('stays quiet while the king is still in the centre', () => {
    const central = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

    expect(weakensKing(contextOf(central, 'g2g4'))).toBeNull()
  })

  it('stays quiet for a pawn far from the king', () => {
    expect(weakensKing(contextOf(CASTLED, 'a2a4'))).toBeNull()
  })

  it('stays quiet for a piece move', () => {
    expect(weakensKing(contextOf(CASTLED, 'f3e5'))).toBeNull()
  })
})

describe('losesCastling', () => {
  const BOTH_RIGHTS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1'

  it('fires when a king move gives up every right', () => {
    expect(losesCastling(contextOf(BOTH_RIGHTS, 'e1f1'))).toMatchObject({
      id: 'loses-castling',
      tier: 'positional',
      level: 'advanced',
    })
  })

  it('does not call castling itself a loss of castling', () => {
    expect(losesCastling(contextOf(BOTH_RIGHTS, 'e1g1'))).toBeNull()
  })

  it('stays quiet while one right still stands', () => {
    expect(losesCastling(contextOf(BOTH_RIGHTS, 'h1g1'))).toBeNull()
  })

  it('stays quiet when there were no rights to lose', () => {
    const noRights = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w kq - 0 1'

    expect(losesCastling(contextOf(noRights, 'e1f1'))).toBeNull()
  })
})

describe('detectMotif', () => {
  const HANGS_KNIGHT = 'r1bqkbnr/pppp1ppp/2n5/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3'

  it('says nothing about a move that cost nothing', () => {
    const context = contextOf(START_FEN, 'e2e4', {
      classification: 'best',
      mateAfter: -1,
      refutation: ['e7e5'],
    })

    expect(detectMotif(context)).toBeNull()
  })

  it('reports one motif, not a list', () => {
    const motif = detectMotif(contextOf(HANGS_KNIGHT, 'f3d4', { refutation: ['c6d4'] }))

    expect(motif).not.toBeNull()
    expect(Array.isArray(motif)).toBe(false)
  })

  it('prefers the mate when both a mate and a capture apply', () => {
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
    const context = contextOf(before, 'g2g4', { mateAfter: -1, refutation: ['d8h4'] })

    expect(detectMotif(context)?.tier).toBe('mate')
  })

  it('prefers material over a positional concession', () => {
    expect(detectMotif(contextOf(HANGS_KNIGHT, 'f3d4', { refutation: ['c6d4'] }))?.tier).toBe(
      'material',
    )
  })

  it('returns null when nothing is recognised', () => {
    expect(detectMotif(contextOf(START_FEN, 'a2a3', { refutation: ['e7e5'] }))).toBeNull()
  })
})
