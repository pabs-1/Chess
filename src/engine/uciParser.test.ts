/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Every `info` / `bestmove` string in this file was captured verbatim from
 * Stockfish 18 Lite WASM with `UCI_ShowWDL` enabled, so the parser is tested
 * against the protocol as it is actually spoken, not as it is remembered.
 */

import { describe, expect, it } from 'vitest'

import {
  depthReached,
  parseBestMove,
  parseInfo,
  toAnalysisLine,
  upsertLine,
} from './uciParser.ts'
import type { AnalysisLine } from './types.ts'

describe('parseInfo', () => {
  it('parses a centipawn line with WDL and a multi-move PV', () => {
    const info = parseInfo(
      'info depth 4 seldepth 9 multipv 1 score cp 33 wdl 71 923 6 nodes 2924 nps 292400 hashfull 0 time 10 pv e2e4 d7d5 e4e5 e7e6',
    )

    expect(info).toEqual({
      multipv: 1,
      depth: 4,
      seldepth: 9,
      scoreCp: 33,
      scoreMate: null,
      wdl: { win: 71, draw: 923, loss: 6 },
      nodes: 2924,
      nps: 292400,
      timeMs: 10,
      pv: ['e2e4', 'd7d5', 'e4e5', 'e7e6'],
    })
  })

  it('parses the multipv rank of secondary lines', () => {
    const info = parseInfo(
      'info depth 13 seldepth 35 multipv 3 score cp -10 wdl 13 960 27 nodes 292670 nps 841005 hashfull 102 time 348 pv b1c3 h7h6',
    )

    expect(info?.multipv).toBe(3)
    expect(info?.scoreCp).toBe(-10)
    expect(info?.wdl).toEqual({ win: 13, draw: 960, loss: 27 })
  })

  it('parses a winning mate score and leaves scoreCp null', () => {
    const info = parseInfo(
      'info depth 22 seldepth 16 multipv 1 score mate 8 wdl 1000 0 0 nodes 224066 nps 1273102 hashfull 25 time 176 pv e2e7 d5c4',
    )

    expect(info?.scoreMate).toBe(8)
    expect(info?.scoreCp).toBeNull()
    expect(info?.wdl).toEqual({ win: 1000, draw: 0, loss: 0 })
  })

  it('keeps the sign of a mate score against the side to move', () => {
    const info = parseInfo(
      'info depth 3 seldepth 4 multipv 1 score mate -1 wdl 0 0 1000 nodes 22 nps 22000 hashfull 0 time 1 pv a8b8 h7h8',
    )

    expect(info?.scoreMate).toBe(-1)
    expect(info?.wdl).toEqual({ win: 0, draw: 0, loss: 1000 })
  })

  it('parses a line without WDL, for when UCI_ShowWDL is off', () => {
    const info = parseInfo('info depth 10 multipv 1 score cp 25 nodes 100 time 3 pv d2d4')

    expect(info?.wdl).toBeNull()
    expect(info?.scoreCp).toBe(25)
  })

  it('defaults multipv to 1 when the engine omits it', () => {
    expect(parseInfo('info depth 6 score cp 12 pv g1f3')?.multipv).toBe(1)
  })

  it('ignores engine chatter', () => {
    expect(
      parseInfo('info string NNUE evaluation using nn-9067e33176e8.nnue (11MiB, (22528, 256, 15, 32, 1))'),
    ).toBeNull()
    expect(parseInfo('info string Network replica 1: Local memory.')).toBeNull()
  })

  it('ignores aspiration-window bounds, whose score is not exact', () => {
    expect(
      parseInfo('info depth 20 multipv 1 score cp 55 lowerbound nodes 100 time 3 pv e2e4'),
    ).toBeNull()
    expect(
      parseInfo('info depth 20 multipv 1 score cp -12 upperbound nodes 100 time 3 pv e2e4'),
    ).toBeNull()
  })

  it('ignores the depth-0 report of a position with no legal move', () => {
    expect(parseInfo('info depth 0 score cp 0')).toBeNull()
  })

  it('ignores currmove progress reports, which carry no PV', () => {
    expect(parseInfo('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull()
  })

  it('ignores lines that are not info lines', () => {
    expect(parseInfo('bestmove e2e4 ponder e7e6')).toBeNull()
    expect(parseInfo('readyok')).toBeNull()
    expect(parseInfo('')).toBeNull()
  })

  it('tolerates irregular whitespace', () => {
    const info = parseInfo('  info   depth 8   multipv 1  score cp 4   pv  e2e4  e7e5 ')

    expect(info?.depth).toBe(8)
    expect(info?.pv).toEqual(['e2e4', 'e7e5'])
  })
})

describe('parseBestMove', () => {
  it('parses a best move with a ponder move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e6')).toEqual({
      bestMove: 'e2e4',
      ponder: 'e7e6',
    })
  })

  it('parses a best move without a ponder move', () => {
    expect(parseBestMove('bestmove g1f1')).toEqual({ bestMove: 'g1f1', ponder: null })
  })

  it('maps (none) to the empty string for terminal positions', () => {
    expect(parseBestMove('bestmove (none)')).toEqual({ bestMove: '', ponder: null })
  })

  it('parses a promotion', () => {
    expect(parseBestMove('bestmove a7a8q')?.bestMove).toBe('a7a8q')
  })

  it('ignores lines that are not bestmove lines', () => {
    expect(parseBestMove('info depth 1 score cp 7 pv d2d4')).toBeNull()
    expect(parseBestMove('bestmove')).toBeNull()
  })
})

describe('upsertLine', () => {
  const info = (multipv: number, depth: number, cp: number) => {
    const parsed = parseInfo(`info depth ${depth} multipv ${multipv} score cp ${cp} pv e2e4`)
    if (parsed === null) throw new Error('fixture failed to parse')
    return parsed
  }

  it('adds a line for a multipv slot that is not yet held', () => {
    const lines = upsertLine([], info(1, 5, 20))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.multipv).toBe(1)
    expect(lines[0]?.scoreCp).toBe(20)
  })

  it('replaces the line for a slot when a deeper report arrives', () => {
    const lines = upsertLine(upsertLine([], info(1, 5, 20)), info(1, 6, 35))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.depth).toBe(6)
    expect(lines[0]?.scoreCp).toBe(35)
  })

  it('replaces the line when the same depth is reported again', () => {
    const lines = upsertLine(upsertLine([], info(1, 5, 20)), info(1, 5, 24))

    expect(lines[0]?.scoreCp).toBe(24)
  })

  it('drops a stale shallower report rather than walking results backwards', () => {
    const lines = upsertLine(upsertLine([], info(1, 12, 35)), info(1, 4, -80))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.depth).toBe(12)
    expect(lines[0]?.scoreCp).toBe(35)
  })

  it('orders lines by multipv regardless of arrival order', () => {
    let lines: AnalysisLine[] = []
    lines = upsertLine(lines, info(3, 5, -10))
    lines = upsertLine(lines, info(1, 5, 30))
    lines = upsertLine(lines, info(2, 5, 10))

    expect(lines.map((line) => line.multipv)).toEqual([1, 2, 3])
  })

  it('does not mutate the array it is given', () => {
    const original = upsertLine([], info(1, 5, 20))
    const updated = upsertLine(original, info(2, 5, 10))

    expect(original).toHaveLength(1)
    expect(updated).toHaveLength(2)
  })
})

describe('toAnalysisLine', () => {
  it('keeps only the fields the analysis layer consumes', () => {
    const parsed = parseInfo(
      'info depth 4 seldepth 9 multipv 1 score cp 33 wdl 71 923 6 nodes 2924 nps 292400 time 10 pv e2e4',
    )
    if (parsed === null) throw new Error('fixture failed to parse')

    expect(Object.keys(toAnalysisLine(parsed)).sort()).toEqual([
      'depth',
      'multipv',
      'pv',
      'scoreCp',
      'scoreMate',
      'wdl',
    ])
  })
})

describe('depthReached', () => {
  const line = (multipv: number, depth: number): AnalysisLine => ({
    multipv,
    depth,
    scoreCp: 0,
    scoreMate: null,
    wdl: null,
    pv: ['e2e4'],
  })

  it('is 0 when nothing has been reported', () => {
    expect(depthReached([])).toBe(0)
  })

  it('is the highest depth across lines mid-iteration', () => {
    expect(depthReached([line(1, 15), line(2, 14), line(3, 14)])).toBe(15)
  })
})
