/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { describe, expect, it } from 'vitest'

import { gamePositions, parsePgn } from './pgn.ts'
import { ReviewCancelledError, reviewGame } from './reviewGame.ts'
import type { ReviewEngine, ReviewProgress } from './reviewGame.ts'
import type { AnalysisLine, AnalysisResult } from '../engine/types.ts'
import type { ParsedGame } from './types.ts'

const GAME_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 *'

function parseOk(pgn: string): ParsedGame {
  const result = parsePgn(pgn)
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.error}`)
  return result.game
}

/** One engine line, written the way a test wants to think about it. */
interface ScriptedLine {
  uci: string
  /** 0–100 for the side to move in that position. */
  winPercent: number
}

/**
 * Builds an AnalysisLine whose WDL yields exactly `winPercent`, since
 * winPercentFromWdl is (win + draw/2) / 10 and therefore exact.
 */
function lineOf(multipv: number, { uci, winPercent }: ScriptedLine): AnalysisLine {
  const win = Math.round(winPercent * 10)
  return {
    multipv,
    depth: 14,
    scoreCp: 0,
    scoreMate: null,
    wdl: { win, draw: 0, loss: 1000 - win },
    pv: [uci],
  }
}

/**
 * An engine that answers from a script keyed by position index.
 *
 * `detailScript`, when given, answers the MultiPV pass instead: the only way
 * to prove that grading never reaches for the detail pass's numbers.
 */
function engineFor(
  game: ParsedGame,
  script: ScriptedLine[][],
  detailScript?: ScriptedLine[][],
) {
  const positions = gamePositions(game)
  const calls: { fen: string; multiPV: number }[] = []
  let stopped = 0

  const engine: ReviewEngine = {
    analyse: (request): Promise<AnalysisResult> => {
      const multiPV = request.multiPV ?? 1
      calls.push({ fen: request.fen, multiPV })

      const source = multiPV > 1 && detailScript !== undefined ? detailScript : script
      const scripted = (source[positions.indexOf(request.fen)] ?? []).slice(0, multiPV)

      return Promise.resolve({
        fen: request.fen,
        lines: scripted.map((line, rank) => lineOf(rank + 1, line)),
        bestMove: scripted[0]?.uci ?? '',
        depthReached: 14,
      })
    },
    stop: () => {
      stopped += 1
    },
  }

  return { engine, calls, stopCount: () => stopped }
}

/**
 * A script in which every side to move sits at `winPercent[i]` and the engine's
 * choice is whatever was actually played, so nobody loses anything.
 */
function levelScript(game: ParsedGame, winPercents: number[]): ScriptedLine[][] {
  const positions = gamePositions(game)
  return positions.map((_, index) => {
    const played = game.moves[index]
    return [{ uci: played?.uci ?? 'e2e4', winPercent: winPercents[index] ?? 50 }]
  })
}

/**
 * Makes the engine prefer some other move at `index`, so that what was played
 * can be graded as a mistake. A move the engine itself picked is never one.
 */
function withBestMove(
  script: ScriptedLine[][],
  index: number,
  uci: string,
): ScriptedLine[][] {
  const updated = script.map((lines) => [...lines])
  const existing = updated[index]?.[0]
  if (existing !== undefined) updated[index] = [{ uci, winPercent: existing.winPercent }]
  return updated
}

describe('reviewGame', () => {
  it('grades every move of the game', async () => {
    const game = parseOk(GAME_PGN)
    const { engine } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    const review = await reviewGame(engine, game)

    expect(review.moves).toHaveLength(game.moves.length)
    expect(review.moves.map((move) => move.san)).toEqual(game.moves.map((move) => move.san))
    expect(review.moves.every((move) => move.classification === 'best')).toBe(true)
  })

  it('scans every position once for a single line', async () => {
    const game = parseOk(GAME_PGN)
    const { engine, calls } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    await reviewGame(engine, game)

    const positions = gamePositions(game)
    expect(calls).toHaveLength(positions.length)
    expect(calls.map((call) => call.fen)).toEqual(positions)
    expect(calls.every((call) => call.multiPV === 1)).toBe(true)
  })

  it('grades a blunder against the player who made it', async () => {
    const game = parseOk(GAME_PGN)
    // White is level and the engine wanted 1. d4; 1. e4 was played instead and
    // leaves Black at 80%.
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game)

    expect(review.moves[0]?.color).toBe('w')
    expect(review.moves[0]?.classification).toBe('blunder')
    expect(review.moves[0]?.winPercentLost).toBeCloseTo(30, 5)
  })

  it('grades a blunder by Black against Black, not White', async () => {
    const game = parseOk(GAME_PGN)
    // Black to move at position 1 sits at 50%; the engine wanted 1... c5, but
    // 1... e5 was played and leaves White at 85%, so Black threw away 35 points.
    // White's own move was the engine's choice and cost nothing.
    const script = withBestMove(levelScript(game, [50, 50, 85, 50, 50, 50, 50, 50, 50]), 1, 'c7c5')
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game)

    expect(review.moves[1]?.color).toBe('b')
    expect(review.moves[1]?.classification).toBe('blunder')
    expect(review.moves[1]?.winPercentLost).toBeCloseTo(35, 5)
    // The point-of-view conversion must not smear the loss onto White.
    expect(review.moves[0]?.winPercentLost).toBeCloseTo(0, 5)
  })

  it('keeps the evaluation graph on White s axis throughout', async () => {
    const game = parseOk(GAME_PGN)
    // Every position reads 70% for whoever is to move, which on a White-relative
    // axis must alternate 70 / 30.
    const { engine } = engineFor(game, levelScript(game, Array<number>(9).fill(70)))

    const review = await reviewGame(engine, game)

    expect(review.winPercentWhite[0]).toBeCloseTo(70, 5)
    expect(review.winPercentWhite[1]).toBeCloseTo(30, 5)
    expect(review.winPercentWhite[2]).toBeCloseTo(70, 5)
    expect(review.winPercentWhite).toHaveLength(game.moves.length + 1)
  })

  it('prefers the detail pass ordering as the advice it shows', async () => {
    const game = parseOk(GAME_PGN)
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')

    // The MultiPV pass searched the same depth without pruning the alternatives
    // away, and ranks a different move first.
    const detailScript = script.map((lines) => [...lines])
    detailScript[0] = [
      { uci: 'g1f3', winPercent: 50 },
      { uci: 'd2d4', winPercent: 49 },
    ]

    const { engine } = engineFor(game, script, detailScript)
    const review = await reviewGame(engine, game, { multiPV: 3 })

    expect(review.moves[0]?.bestMoveSan).toBe('Nf3')
    // The grade still comes from the scan pass on both sides.
    expect(review.moves[0]?.winPercentLost).toBeCloseTo(30, 5)
  })

  it('records the engine choice in both notations', async () => {
    const game = parseOk(GAME_PGN)
    const script = levelScript(game, Array<number>(9).fill(50))
    script[0] = [{ uci: 'd2d4', winPercent: 50 }]
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game)

    expect(review.moves[0]?.bestMove).toBe('d2d4')
    expect(review.moves[0]?.bestMoveSan).toBe('d4')
  })

  it('averages accuracy per colour', async () => {
    const game = parseOk(GAME_PGN)
    const { engine } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    const review = await reviewGame(engine, game)

    expect(review.accuracy.w).toBeCloseTo(100, 1)
    expect(review.accuracy.b).toBeCloseTo(100, 1)
  })

  it('counts the grades per colour', async () => {
    const game = parseOk(GAME_PGN)
    const { engine } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    const review = await reviewGame(engine, game)

    expect(review.counts.w.best).toBe(4)
    expect(review.counts.b.best).toBe(4)
    expect(review.counts.w.blunder).toBe(0)
  })
})

describe('reviewGame: the detail pass', () => {
  it('revisits only the positions where the player went wrong', async () => {
    const game = parseOk(GAME_PGN)
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')
    const { engine, calls } = engineFor(game, script)

    await reviewGame(engine, game, { multiPV: 3 })

    const detailCalls = calls.filter((call) => call.multiPV === 3)
    expect(detailCalls).toHaveLength(1)
    expect(detailCalls[0]?.fen).toBe(game.moves[0]?.fenBefore)
  })

  it('does not run at all when the game has no mistakes in it', async () => {
    const game = parseOk(GAME_PGN)
    const { engine, calls } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    await reviewGame(engine, game, { multiPV: 3 })

    expect(calls.every((call) => call.multiPV === 1)).toBe(true)
  })

  it('records the alternatives it found', async () => {
    const game = parseOk(GAME_PGN)
    const script = levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50])
    script[0] = [
      { uci: 'd2d4', winPercent: 50 },
      { uci: 'g1f3', winPercent: 48 },
      { uci: 'c2c4', winPercent: 45 },
    ]
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game, { multiPV: 3 })

    expect(review.moves[0]?.alternatives.map((line) => line.san)).toEqual(['d4', 'Nf3', 'c4'])
    expect(review.moves[0]?.alternatives[1]?.winPercent).toBeCloseTo(48, 5)
  })

  it('leaves alternatives empty on moves it did not revisit', async () => {
    const game = parseOk(GAME_PGN)
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game, { multiPV: 3 })

    expect(review.moves[1]?.alternatives).toEqual([])
  })

  it('grades the delta from the scan pass, never from the detail pass', async () => {
    const game = parseOk(GAME_PGN)
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')

    // The detail pass disagrees wildly about the same position. It must not be
    // used for the subtraction, or this move's delta would stop being
    // comparable with its neighbours'.
    const detailScript = script.map((lines) => [...lines])
    detailScript[0] = [
      { uci: 'd2d4', winPercent: 10 },
      { uci: 'g1f3', winPercent: 9 },
    ]

    const { engine } = engineFor(game, script, detailScript)

    const review = await reviewGame(engine, game, { multiPV: 3 })

    expect(review.moves[0]?.winPercentLost).toBeCloseTo(30, 5)
    // The alternatives, by contrast, do come from the detail pass.
    expect(review.moves[0]?.alternatives[0]?.winPercent).toBeCloseTo(10, 5)
  })
})

describe('reviewGame: progress and cancellation', () => {
  it('reports both phases as they run', async () => {
    const game = parseOk(GAME_PGN)
    const script = withBestMove(levelScript(game, [50, 80, 50, 50, 50, 50, 50, 50, 50]), 0, 'd2d4')
    const { engine } = engineFor(game, script)

    const progress: ReviewProgress[] = []
    await reviewGame(engine, game, { multiPV: 3, onProgress: (p) => progress.push(p) })

    const scan = progress.filter((p) => p.phase === 'scan')
    const detail = progress.filter((p) => p.phase === 'detail')

    expect(scan).toHaveLength(gamePositions(game).length)
    expect(scan.map((p) => p.completed)).toEqual(scan.map((_, index) => index + 1))
    expect(scan[0]?.total).toBe(gamePositions(game).length)
    expect(detail).toHaveLength(1)
    expect(detail[0]).toEqual({ phase: 'detail', completed: 1, total: 1 })
  })

  it('stops the engine and rejects when cancelled mid-scan', async () => {
    const game = parseOk(GAME_PGN)
    const { engine } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))
    const controller = new AbortController()

    const promise = reviewGame(engine, game, {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.completed === 3) controller.abort()
      },
    })

    await expect(promise).rejects.toBeInstanceOf(ReviewCancelledError)
  })

  it('rejects before doing any work when the signal is already aborted', async () => {
    const game = parseOk(GAME_PGN)
    const { engine, calls } = engineFor(game, levelScript(game, Array<number>(9).fill(50)))

    await expect(
      reviewGame(engine, game, { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(ReviewCancelledError)
    expect(calls).toHaveLength(0)
  })
})

describe('reviewGame: games that end', () => {
  it('reads a checkmate as a win for the player who delivered it', async () => {
    const game = parseOk('1. f3 e5 2. g4 Qh4# 0-1')
    const positions = gamePositions(game)
    const script: ScriptedLine[][] = [
      [{ uci: 'e2e4', winPercent: 50 }],
      [{ uci: 'e7e5', winPercent: 55 }],
      [{ uci: 'g1f3', winPercent: 45 }],
      [{ uci: 'd8h4', winPercent: 99 }],
      // The final position is checkmate: the engine returns nothing at all.
      [],
    ]
    expect(positions).toHaveLength(script.length)
    const { engine } = engineFor(game, script)

    const review = await reviewGame(engine, game)
    const mateMove = review.moves[3]

    expect(mateMove?.san).toBe('Qh4#')
    expect(mateMove?.classification).toBe('best')
    // White is mated, so White's axis reads 0 at the end.
    expect(review.winPercentWhite[4]).toBe(0)
    expect(mateMove?.evaluation).toBeNull()
  })
})
