/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * These tests render through the real locale files, in both languages.
 *
 * That is the point of keeping analysis and language apart: a motif is data, a
 * sentence is a lookup, and proving every motif says something sensible in
 * every language is a loop rather than a manual review. A missing key, a typo
 * in a placeholder or a template that forgot an interpolation all fail here.
 */

import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import { commentFor } from './comment.ts'
import { renderStep } from './render.ts'
import { COMMENT_KINDS } from './types.ts'
import type { CommentStep } from './types.ts'
import enLocale from '../i18n/locales/en.json'
import itLocale from '../i18n/locales/it.json'
import type { Motif, MotifId } from '../analysis/motifs/index.ts'
import type { ReviewedMove } from '../analysis/reviewGame.ts'

const LANGUAGES = ['it', 'en'] as const
type Language = (typeof LANGUAGES)[number]

const instance = i18next.createInstance()

beforeAll(async () => {
  await instance.init({
    resources: { it: { translation: itLocale }, en: { translation: enLocale } },
    lng: 'it',
    fallbackLng: false,
    interpolation: { escapeValue: false },
  })
})

function render(language: Language, step: CommentStep): string {
  return renderStep(instance.getFixedT(language), step)
}

/** Every motif, one of each, so the loops below can cover the whole set. */
const MOTIF_FIXTURES: Record<MotifId, Motif> = {
  'allows-mate': { id: 'allows-mate', tier: 'mate', level: 'beginner', moves: 2, line: ['Qh4+', 'g3', 'Qxg3#'] },
  'misses-mate': { id: 'misses-mate', tier: 'mate', level: 'intermediate', moves: 1, bestMove: 'Ra8#' },
  'hangs-piece': {
    id: 'hangs-piece',
    tier: 'material',
    level: 'beginner',
    target: { piece: 'n', square: 'd4' },
    capture: 'Nxd4',
    undefended: true,
  },
  'misses-material': {
    id: 'misses-material',
    tier: 'material',
    level: 'beginner',
    target: { piece: 'r', square: 'd5' },
    bestMove: 'cxd5',
  },
  'allows-fork': {
    id: 'allows-fork',
    tier: 'tactics',
    level: 'intermediate',
    forker: { piece: 'n', square: 'f6' },
    targets: [
      { piece: 'k', square: 'g8' },
      { piece: 'r', square: 'e8' },
    ],
    reply: 'Nf6+',
  },
  'weakens-king': { id: 'weakens-king', tier: 'positional', level: 'advanced', from: 'g2', kingSquare: 'g1' },
  'loses-castling': { id: 'loses-castling', tier: 'positional', level: 'advanced' },
}

const MOTIF_IDS = Object.keys(MOTIF_FIXTURES) as MotifId[]

function move(overrides: Partial<ReviewedMove> = {}): ReviewedMove {
  return {
    ply: 4,
    moveNumber: 3,
    color: 'w',
    san: 'Nd4',
    uci: 'f3d4',
    fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3',
    fenAfter: 'r1bqkbnr/pppp1ppp/2n5/4p3/3N4/8/PPPPPPPP/RNBQKB1R b KQkq - 1 3',
    classification: 'blunder',
    winPercentLost: 30,
    accuracy: 25,
    winPercentWhite: 20,
    evaluation: { cp: -300, mate: null, wdl: null },
    bestMove: 'b1c3',
    bestMoveSan: 'Nc3',
    alternatives: [],
    motif: null,
    refutation: ['Nxd4'],
    ...overrides,
  }
}

describe('commentFor: the ladder', () => {
  it('says nothing about a move that did not go wrong', () => {
    for (const classification of ['best', 'excellent', 'good', 'forced'] as const) {
      expect(commentFor(move({ classification }))).toEqual([])
    }
  })

  it('gives four steps when a motif was found', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['hangs-piece'] }))

    expect(steps.map((step) => step.kind)).toEqual(['signal', 'theme', 'detail', 'solution'])
  })

  it('omits theme and detail rather than inventing a reason', () => {
    const steps = commentFor(move({ motif: null }))

    expect(steps.map((step) => step.kind)).toEqual(['signal', 'solution'])
  })

  it('omits the solution when the player already played the engine move', () => {
    const steps = commentFor(move({ motif: null, bestMove: 'f3d4', bestMoveSan: 'Nd4' }))

    expect(steps.map((step) => step.kind)).toEqual(['signal'])
  })

  it('reveals strictly more with every step', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['allows-fork'] }))
    const order = steps.map((step) => COMMENT_KINDS.indexOf(step.kind))

    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('is deterministic', () => {
    const first = commentFor(move({ motif: MOTIF_FIXTURES['hangs-piece'] }))
    const second = commentFor(move({ motif: MOTIF_FIXTURES['hangs-piece'] }))

    expect(first).toEqual(second)
  })
})

describe.each(LANGUAGES)('commentFor rendered in %s', (language) => {
  it.each(MOTIF_IDS)('says something complete about %s', (id) => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES[id] }))

    for (const step of steps) {
      const sentence = render(language, step)

      // A missing key comes back as the key itself.
      expect(sentence).not.toBe(step.key)
      // An unresolved placeholder means the values and the template disagree.
      expect(sentence).not.toMatch(/\{\{|\}\}/)
      expect(sentence.trim().length).toBeGreaterThan(0)
    }
  })

  it.each(['inaccuracy', 'mistake', 'blunder'] as const)('has a signal for %s', (classification) => {
    const [signal] = commentFor(move({ classification }))
    expect(signal).toBeDefined()
    if (signal === undefined) return

    const sentence = render(language, signal)
    expect(sentence).not.toBe(signal.key)
    expect(sentence.trim().length).toBeGreaterThan(0)
  })
})

describe('piece names come from the locale, not from the code', () => {
  it('turns a piece code into the right word in each language', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['hangs-piece'] }))
    const detail = steps.find((step) => step.kind === 'detail')
    expect(detail).toBeDefined()
    if (detail === undefined) return

    // The data layer only ever said 'n'; the article is the locale's problem.
    expect(detail.values.piece).toBe('n')
    expect(render('it', detail)).toContain('cavallo')
    expect(render('en', detail)).toContain('knight')
  })

  it('names both sides of a fork in each language', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['allows-fork'] }))
    const detail = steps.find((step) => step.kind === 'detail')
    expect(detail).toBeDefined()
    if (detail === undefined) return

    const italian = render('it', detail)
    expect(italian).toContain('re')
    expect(italian).toContain('torre')
    expect(italian).toContain('g8')
    expect(italian).toContain('e8')

    const english = render('en', detail)
    expect(english).toContain('king')
    expect(english).toContain('rook')
  })
})

describe('the full Italian and English wording', () => {
  it('reads as intended for a hung piece', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['hangs-piece'] }))

    expect(steps.map((step) => render('it', step))).toEqual([
      'Questa mossa cambia la partita, e non a tuo favore.',
      "Hai lasciato un pezzo dove l'avversario può prenderlo.",
      "L'avversario gioca Nxd4 e vince il cavallo in d4.",
      'Il motore avrebbe giocato Nc3.',
    ])

    expect(steps.map((step) => render('en', step))).toEqual([
      'This move changes the game, and not in your favour.',
      'You left a piece where your opponent can simply take it.',
      'Your opponent plays Nxd4 and wins the knight on d4.',
      'The engine would have played Nc3.',
    ])
  })

  it('reads as intended for an allowed mate', () => {
    const steps = commentFor(move({ motif: MOTIF_FIXTURES['allows-mate'] }))
    const detail = steps.find((step) => step.kind === 'detail')
    expect(detail).toBeDefined()
    if (detail === undefined) return

    expect(render('it', detail)).toBe('Matto in 2: Qh4+ g3 Qxg3#.')
    expect(render('en', detail)).toBe('Mate in 2: Qh4+ g3 Qxg3#.')
  })
})
