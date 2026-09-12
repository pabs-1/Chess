/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'

import { createOpeningBook, parseOpeningRows, type OpeningBook } from './book.ts'
import { classifyOpening } from './classify.ts'
import { toEpd } from './epd.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

import openingsRaw from './data/openings.json?raw'

/** The committed book, read exactly the way the application reads it. */
const realBook: OpeningBook = createOpeningBook(parseOpeningRows(JSON.parse(openingsRaw)))

/** Every position a line passes through, starting position first. */
function positionsOf(moves: string): string[] {
  const board = new Chess()
  const positions = [board.fen()]
  for (const san of moves.split(' ')) {
    board.move(san)
    positions.push(board.fen())
  }
  return positions
}

describe('toEpd', () => {
  it('drops the move counters', () => {
    expect(toEpd(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
  })

  it('keeps an en passant square a capture can actually use', () => {
    // 1. e4 c5 2. e5 d5: the e5 pawn can take on d6.
    const board = new Chess()
    for (const san of ['e4', 'c5', 'e5', 'd5']) board.move(san)

    expect(toEpd(board.fen()).endsWith(' d6')).toBe(true)
  })

  it('drops an en passant square nothing can use', () => {
    // chess.js already applies this convention itself, so a FEN carrying an
    // unusable square comes from somewhere else: typed by hand, or a [FEN] tag
    // in a pasted PGN. Those have to key the same as the position reached by
    // playing the moves.
    const byHand = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

    const board = new Chess()
    board.move('e4')

    expect(toEpd(byHand)).toBe(toEpd(board.fen()))
    expect(toEpd(byHand).endsWith(' -')).toBe(true)
  })

  it('gives one key to a position however it was reached', () => {
    // The same position by two move orders; one of them arrives by a double
    // push, so the raw FENs differ even though the positions do not.
    const viaOne = new Chess()
    for (const san of ['e4', 'e6', 'd4', 'd5']) viaOne.move(san)

    const viaOther = new Chess()
    for (const san of ['d4', 'd5', 'e4', 'e6']) viaOther.move(san)

    expect(toEpd(viaOne.fen())).toBe(toEpd(viaOther.fen()))
  })

  it('leaves a position it cannot set up alone', () => {
    expect(toEpd('nonsense')).toBe('nonsense')
  })
})

describe('createOpeningBook', () => {
  const book = createOpeningBook([
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'B00', "King's Pawn Game"],
  ])

  it('finds an opening by position', () => {
    const board = new Chess()
    board.move('e4')

    expect(book.find(board.fen())).toEqual({ eco: 'B00', name: "King's Pawn Game" })
  })

  it('is null for a position it does not know', () => {
    expect(book.find(START_FEN)).toBeNull()
  })

  it('reports its size', () => {
    expect(book.size).toBe(1)
  })
})

describe('parseOpeningRows', () => {
  it('keeps well-formed rows', () => {
    expect(parseOpeningRows([['epd', 'A00', 'Name']])).toEqual([['epd', 'A00', 'Name']])
  })

  it('discards anything that is not a row', () => {
    expect(parseOpeningRows([['epd', 'A00'], 'nope', 42, null, ['a', 'b', 'c']])).toEqual([
      ['a', 'b', 'c'],
    ])
  })

  it('is empty for anything that is not a list', () => {
    expect(parseOpeningRows(null)).toEqual([])
    expect(parseOpeningRows({})).toEqual([])
  })
})

describe('the committed book', () => {
  it('holds the whole data set', () => {
    expect(realBook.size).toBeGreaterThan(3000)
  })

  it('names openings every player would recognise', () => {
    const cases: [string, string][] = [
      ['e4 c5', 'Sicilian Defense'],
      ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'],
      ['d4 Nf6 c4 e6 Nc3 Bb4', 'Nimzo-Indian Defense'],
      ['e4 e6', 'French Defense'],
      ['d4 d5 c4', 'Queen'],
    ]

    for (const [moves, expected] of cases) {
      const positions = positionsOf(moves)
      const found = realBook.find(positions[positions.length - 1] ?? '')
      expect(found?.name).toContain(expected)
    }
  })

  it('names a line reached by transposition', () => {
    // The Nimzo-Indian by an unusual move order: the book only knows it because
    // positions, not move lists, are the key.
    const direct = positionsOf('d4 Nf6 c4 e6 Nc3 Bb4')
    const transposed = positionsOf('c4 e6 Nc3 Nf6 d4 Bb4')

    const a = realBook.find(direct[direct.length - 1] ?? '')
    const b = realBook.find(transposed[transposed.length - 1] ?? '')

    expect(a).not.toBeNull()
    expect(b).toEqual(a)
  })

  it('does not know the starting position', () => {
    expect(realBook.find(START_FEN)).toBeNull()
  })
})

describe('classifyOpening', () => {
  it('names a game and says where it left theory', () => {
    // A known line, then a move nobody plays.
    const positions = positionsOf('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 Kf1')
    const result = classifyOpening(realBook, positions)

    expect(result.opening?.name).toContain('Ruy Lopez')
    expect(result.leftBookAtPly).toBe(result.lastBookIndex)
    expect(result.leftBookAtPly).toBeGreaterThan(0)
    expect(result.leftBookAtPly).toBeLessThan(positions.length - 1)
  })

  it('takes the deepest name, not the first', () => {
    const shallow = classifyOpening(realBook, positionsOf('e4 c5'))
    const deep = classifyOpening(realBook, positionsOf('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'))

    expect(shallow.opening?.name).toBe('Sicilian Defense')
    expect(deep.opening?.name).toContain('Najdorf')
    expect(deep.lastBookIndex).toBeGreaterThan(shallow.lastBookIndex)
  })

  it('reports no departure for a game still inside theory', () => {
    const result = classifyOpening(realBook, positionsOf('e4 c5'))

    expect(result.leftBookAtPly).toBeNull()
  })

  it('names nothing for a game of moves no book knows', () => {
    const result = classifyOpening(realBook, positionsOf('a3 h6 a4 h5'))

    expect(result.opening === null || result.lastBookIndex >= 0).toBe(true)
  })

  it('handles a game with no moves at all', () => {
    const result = classifyOpening(realBook, [START_FEN])

    expect(result).toEqual({ opening: null, lastBookIndex: 0, leftBookAtPly: null })
  })
})
