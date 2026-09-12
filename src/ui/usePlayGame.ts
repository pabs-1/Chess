/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  bestMoveOf,
  bestMoveSanOf,
  gradeMove,
  legalDestinations,
  makeMove,
  motifFor,
  outcomeOf,
  turnOf,
} from '../analysis/index.ts'
import type {
  Color,
  Destinations,
  GameMove,
  Motif,
  MoveClassification,
  PlayMode,
  PlayOutcome,
} from '../analysis/index.ts'
import { Engine, EngineDisposedError } from '../engine/index.ts'
import type { AnalysisResult } from '../engine/index.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Shared so a board that cannot be moved does not get a new Map each render. */
const EMPTY_DESTS: Destinations = new Map()

/** Depth the coach analyses at. Lower than a review: someone is waiting. */
export const COACH_DEPTH = 12
/** Depth the opponent searches at; its strength is set by UCI_Elo, not by this. */
const OPPONENT_DEPTH = 12
/** Lines the coach asks for, so a refused move can name the alternatives. */
const COACH_MULTI_PV = 3

/** Stockfish refuses anything below 1320. `null` is full strength. */
export const ELO_LEVELS: readonly (number | null)[] = [1320, 1600, 2000, 2400, null]

/** What the player is told about a move of theirs. */
export interface MoveReview {
  san: string
  classification: MoveClassification
  winPercentLost: number
  motif: Motif | null
  bestMove: string | null
  bestMoveSan: string | null
}

export interface PlayedMove extends GameMove {
  /** Present for the player's own moves in coach mode. */
  review: MoveReview | null
}

export type PlayPhase =
  /** No game yet. */
  | 'idle'
  /** Booting the engine. */
  | 'loading'
  /** Waiting for the player. */
  | 'player'
  /** The engine is working, either coaching or choosing its move. */
  | 'engine'
  /** The game is over. */
  | 'over'

export interface PlaySettings {
  mode: PlayMode
  playerColor: Color
  /** UCI_Elo for the opponent, or null for full strength. */
  elo: number | null
}

export interface UsePlayGameResult {
  fen: string
  moves: PlayedMove[]
  phase: PlayPhase
  outcome: PlayOutcome
  dests: Destinations
  /** A move training would not accept. Cleared as soon as another is tried. */
  refused: MoveReview | null
  /** The review of the player's last accepted move, in coach mode. */
  lastReview: MoveReview | null
  error: string | null
  settings: PlaySettings
  start: (settings: PlaySettings) => void
  play: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void
  resign: () => void
}

const DEFAULT_SETTINGS: PlaySettings = { mode: 'coach', playerColor: 'w', elo: 1600 }

/**
 * Plays a game against Stockfish.
 *
 * The engine does two different jobs here and they must not be confused. It
 * chooses the opponent's moves, possibly deliberately weakened by `UCI_Elo`;
 * and it analyses the player's moves for the coach, which has to be at full
 * strength, because coaching with a handicapped engine would teach the handicap.
 * So the limit is switched off around every analysis and back on around every
 * move the opponent makes.
 */
export function usePlayGame(): UsePlayGameResult {
  const engineRef = useRef<Engine | null>(null)
  /** True while the engine is deliberately weakened. */
  const limitedRef = useRef(false)
  /** The engine's view of the position the player is about to move from. */
  const baselineRef = useRef<AnalysisResult | null>(null)
  const settingsRef = useRef<PlaySettings>(DEFAULT_SETTINGS)
  const fenRef = useRef(START_FEN)
  const movesRef = useRef<PlayedMove[]>([])
  /** Bumped on every new game so a stale turn cannot write into a fresh one. */
  const generationRef = useRef(0)

  const [settings, setSettings] = useState<PlaySettings>(DEFAULT_SETTINGS)
  const [fen, setFen] = useState(START_FEN)
  const [moves, setMoves] = useState<PlayedMove[]>([])
  const [phase, setPhase] = useState<PlayPhase>('idle')
  const [refused, setRefused] = useState<MoveReview | null>(null)
  const [lastReview, setLastReview] = useState<MoveReview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  const publish = useCallback(() => {
    setFen(fenRef.current)
    setMoves([...movesRef.current])
  }, [])

  /** Turns the handicap on or off, and only when it actually changes. */
  const setLimited = useCallback(async (engine: Engine, limited: boolean) => {
    if (limitedRef.current === limited) return
    const { elo } = settingsRef.current

    if (limited && elo !== null) {
      await engine.setOption('UCI_LimitStrength', true)
      await engine.setOption('UCI_Elo', elo)
      limitedRef.current = true
      return
    }

    await engine.setOption('UCI_LimitStrength', false)
    limitedRef.current = false
  }, [])

  /** Full-strength analysis of the position the player will move from. */
  const refreshBaseline = useCallback(
    async (engine: Engine) => {
      if (settingsRef.current.mode === 'free') return
      await setLimited(engine, false)
      baselineRef.current = await engine.analyse({
        fen: fenRef.current,
        depth: COACH_DEPTH,
        multiPV: COACH_MULTI_PV,
      })
    },
    [setLimited],
  )

  /** Lets the opponent move, at whatever strength was chosen. */
  const playEngineMove = useCallback(
    async (engine: Engine) => {
      await setLimited(engine, true)
      const result = await engine.analyse({ fen: fenRef.current, depth: OPPONENT_DEPTH })

      const best = bestMoveOf(result)
      if (best === null) return

      const move = makeMove(
        fenRef.current,
        best.slice(0, 2),
        best.slice(2, 4),
        best.length > 4 ? (best.slice(4) as 'q') : undefined,
        movesRef.current.length,
      )
      if (move === null) return

      movesRef.current = [...movesRef.current, { ...move, review: null }]
      fenRef.current = move.fenAfter
      publish()
    },
    [publish, setLimited],
  )

  /** Runs a turn, guarding against a new game having started meanwhile. */
  const run = useCallback(
    (work: (engine: Engine) => Promise<void>) => {
      const engine = engineRef.current
      if (engine === null) return
      const generation = generationRef.current

      void (async () => {
        try {
          setPhase('engine')
          if (engine.state === 'idle') {
            setPhase('loading')
            await engine.init()
            setPhase('engine')
          }

          await work(engine)
          if (generation !== generationRef.current) return

          setPhase(outcomeOf(fenRef.current) === 'playing' ? 'player' : 'over')
        } catch (caught) {
          if (caught instanceof EngineDisposedError) return
          if (generation !== generationRef.current) return
          setError(caught instanceof Error ? caught.message : String(caught))
          setPhase('over')
        }
      })()
    },
    [],
  )

  const start = useCallback(
    (next: PlaySettings) => {
      generationRef.current += 1
      settingsRef.current = next
      limitedRef.current = false
      baselineRef.current = null
      fenRef.current = START_FEN
      movesRef.current = []

      setSettings(next)
      setRefused(null)
      setLastReview(null)
      setError(null)
      publish()

      run(async (engine) => {
        // Reset the handicap flag against whatever the last game left set.
        await engine.setOption('UCI_LimitStrength', false)
        if (next.playerColor === 'b') await playEngineMove(engine)
        await refreshBaseline(engine)
      })
    },
    [playEngineMove, publish, refreshBaseline, run],
  )

  const play = useCallback(
    (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      if (phase !== 'player') return

      const move = makeMove(fenRef.current, from, to, promotion, movesRef.current.length)
      if (move === null) return

      setRefused(null)

      run(async (engine) => {
        const { mode } = settingsRef.current

        if (mode === 'free') {
          movesRef.current = [...movesRef.current, { ...move, review: null }]
          fenRef.current = move.fenAfter
          publish()
        } else {
          await setLimited(engine, false)
          const after = await engine.analyse({
            fen: move.fenAfter,
            depth: COACH_DEPTH,
            multiPV: 1,
          })

          const baseline = baselineRef.current ?? undefined
          const grade = gradeMove(move, baseline, after)
          const bestMove = bestMoveOf(baseline)
          const review: MoveReview = {
            san: move.san,
            classification: grade.classification,
            winPercentLost: grade.winPercentLost,
            motif: motifFor(move, baseline, after, grade.classification, bestMove),
            bestMove,
            bestMoveSan: bestMoveSanOf(move.fenBefore, bestMove),
          }

          // Training is the only mode that refuses a move, and only a blunder.
          // The position is left exactly as it was, baseline included, so the
          // next attempt is graded against the same numbers.
          if (mode === 'training' && review.classification === 'blunder') {
            setRefused(review)
            return
          }

          setLastReview(review)
          movesRef.current = [...movesRef.current, { ...move, review }]
          fenRef.current = move.fenAfter
          publish()
        }

        if (outcomeOf(fenRef.current) !== 'playing') return

        await playEngineMove(engine)
        if (outcomeOf(fenRef.current) !== 'playing') return

        await refreshBaseline(engine)
      })
    },
    [phase, playEngineMove, publish, refreshBaseline, run, setLimited],
  )

  const resign = useCallback(() => {
    generationRef.current += 1
    engineRef.current?.stop()
    setPhase('over')
  }, [])

  const outcome = outcomeOf(fen)
  const playerToMove = phase === 'player' && turnOf(fen) === settings.playerColor

  return {
    fen,
    moves,
    phase,
    outcome,
    dests: playerToMove ? legalDestinations(fen) : EMPTY_DESTS,
    refused,
    lastReview,
    error,
    settings,
    start,
    play,
    resign,
  }
}
