/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Pure parsing of the UCI text protocol.
 *
 * Nothing here touches a worker, a timer or any state: the Engine class feeds
 * these functions raw lines and they return data. That is what makes the
 * protocol handling unit-testable without booting a 7 MB WebAssembly module.
 *
 * Every score produced here is from the side-to-move point of view, exactly as
 * Stockfish reports it. See src/engine/types.ts.
 */

import type { AnalysisLine, Wdl } from './types.ts'

/** An `info` line that carries a usable principal variation. */
export interface ParsedInfo {
  multipv: number
  depth: number
  seldepth: number | null
  scoreCp: number | null
  scoreMate: number | null
  wdl: Wdl | null
  nodes: number | null
  nps: number | null
  timeMs: number | null
  pv: string[]
}

export interface ParsedBestMove {
  /** UCI move, or the empty string for `bestmove (none)` in a terminal position. */
  bestMove: string
  ponder: string | null
}

function toInt(token: string | undefined): number | null {
  if (token === undefined) return null
  const parsed = Number.parseInt(token, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parses one `info` line.
 *
 * Returns null (meaning "nothing usable here", not "malformed") for:
 *  - `info string …`, which is human-readable engine chatter;
 *  - lines flagged `lowerbound` / `upperbound`, whose score is an aspiration
 *    window bound rather than an exact evaluation;
 *  - lines without a principal variation, such as the `info depth 0 score cp 0`
 *    that Stockfish emits for a position with no legal move, or the
 *    `currmove` progress reports.
 */
export function parseInfo(line: string): ParsedInfo | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return null

  let depth: number | null = null
  let seldepth: number | null = null
  let multipv = 1
  let scoreCp: number | null = null
  let scoreMate: number | null = null
  let wdl: Wdl | null = null
  let nodes: number | null = null
  let nps: number | null = null
  let timeMs: number | null = null
  let pv: string[] | null = null

  for (let i = 1; i < tokens.length; i += 1) {
    switch (tokens[i]) {
      case 'string':
        return null

      case 'lowerbound':
      case 'upperbound':
        return null

      case 'depth':
        depth = toInt(tokens[i + 1])
        i += 1
        break

      case 'seldepth':
        seldepth = toInt(tokens[i + 1])
        i += 1
        break

      case 'multipv':
        multipv = toInt(tokens[i + 1]) ?? 1
        i += 1
        break

      case 'nodes':
        nodes = toInt(tokens[i + 1])
        i += 1
        break

      case 'nps':
        nps = toInt(tokens[i + 1])
        i += 1
        break

      case 'time':
        timeMs = toInt(tokens[i + 1])
        i += 1
        break

      case 'score': {
        const kind = tokens[i + 1]
        const value = toInt(tokens[i + 2])
        if (kind === 'cp') scoreCp = value
        else if (kind === 'mate') scoreMate = value
        i += 2
        break
      }

      case 'wdl': {
        const win = toInt(tokens[i + 1])
        const draw = toInt(tokens[i + 2])
        const loss = toInt(tokens[i + 3])
        if (win !== null && draw !== null && loss !== null) wdl = { win, draw, loss }
        i += 3
        break
      }

      case 'pv':
        // `pv` is variadic and always last, so everything after it is the line.
        pv = tokens.slice(i + 1)
        i = tokens.length
        break

      default:
        // Unknown key or one of its values: skip it rather than guessing arity.
        break
    }
  }

  if (depth === null) return null
  if (pv === null || pv.length === 0) return null
  if (scoreCp === null && scoreMate === null) return null

  return { multipv, depth, seldepth, scoreCp, scoreMate, wdl, nodes, nps, timeMs, pv }
}

/** Parses a `bestmove` line, the terminator of every search. */
export function parseBestMove(line: string): ParsedBestMove | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'bestmove') return null

  const move = tokens[1]
  if (move === undefined) return null

  return {
    bestMove: move === '(none)' ? '' : move,
    ponder: tokens[2] === 'ponder' ? (tokens[3] ?? null) : null,
  }
}

export function toAnalysisLine(info: ParsedInfo): AnalysisLine {
  return {
    multipv: info.multipv,
    depth: info.depth,
    scoreCp: info.scoreCp,
    scoreMate: info.scoreMate,
    wdl: info.wdl,
    pv: info.pv,
  }
}

/**
 * Folds an `info` line into the accumulated set, keyed by `multipv`.
 *
 * Pure: returns a new array, ordered by `multipv`. A line that is shallower
 * than the one already held for that slot is dropped, so a late-arriving stale
 * update can never walk the results backwards.
 */
export function upsertLine(lines: readonly AnalysisLine[], info: ParsedInfo): AnalysisLine[] {
  const incoming = toAnalysisLine(info)
  const existing = lines.find((line) => line.multipv === incoming.multipv)
  if (existing !== undefined && existing.depth > incoming.depth) return [...lines]

  return [...lines.filter((line) => line.multipv !== incoming.multipv), incoming].sort(
    (a, b) => a.multipv - b.multipv,
  )
}

/** Highest depth any line has reached; 0 when there is nothing yet. */
export function depthReached(lines: readonly AnalysisLine[]): number {
  return lines.reduce((max, line) => Math.max(max, line.depth), 0)
}
