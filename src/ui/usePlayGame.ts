/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
/**
 * Lines the coach asks for, on **both** sides of every grading delta.
 *
 * A MultiPV search prunes nothing and can score its first line differently from
 * a single-line search at the same depth, so asking for three before the move
 * and one after would grade the move against two different engines. Nothing in
 * live play reads past the first line anyway.
 */
const COACH_MULTI_PV = 1

/** Stockfish refuses anything below 1320. `null` is full strength. */
export const ELO_LEVELS: readonly (number | null)[] = [1320, 1600, 2000, 2400, null]

/** What the player is told about a move of theirs. */
export interface MoveReview {
  san: string
  /**
   * The move played, in UCI. Kept beside the SAN because naming the engine's
   * choice only says something when that choice differs from what was played:
   * announcing the player's own move back to them, as the engine's, reads as
   * if the engine had made it.
   */
  uci: string
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

/**
 * A move shown to the player, graded, and not yet part of the game.
 *
 * Training holds every move here before letting the opponent answer, so the
 * player sees what the move did and can take it back. Nothing about it has
 * touched the game yet: the committed position and the baseline analysis are
 * both still the ones from before it was played.
 */
export interface PendingMove {
  move: PlayedMove
  review: MoveReview
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
  /**
   * Training only: the move is on the board and graded, and the player has to
   * decide whether to keep it before the opponent gets to answer.
   */
  | 'confirm'
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
  /** In training, the move waiting for the player to keep it or take it back. */
  pending: PendingMove | null
  /** The review of the player's last accepted move, in coach mode. */
  lastReview: MoveReview | null
  error: string | null
  settings: PlaySettings
  start: (settings: PlaySettings) => void
  play: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void
  /** Commits the pending move and lets the opponent answer. */
  confirm: () => void
  /** Discards the pending move, leaving the position exactly as it was. */
  takeBack: () => void
  resign: () => void
}

const DEFAULT_SETTINGS: PlaySettings = { mode: 'coach', playerColor: 'w', elo: 1320 }

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
  /**
   * The Elo limit currently applied, `null` for full strength, `undefined` when
   * nothing has been applied yet. A boolean would not do: at full strength the
   * "limited" and "unlimited" states are the same, and the option would be
   * re-sent before every move the opponent makes.
   */
  const appliedEloRef = useRef<number | null | undefined>(undefined)
  /** The engine's view of the position the player is about to move from. */
  const baselineRef = useRef<AnalysisResult | null>(null)
  const settingsRef = useRef<PlaySettings>(DEFAULT_SETTINGS)
  const fenRef = useRef(START_FEN)
  const movesRef = useRef<PlayedMove[]>([])
  /** Bumped on every new game so a stale turn cannot write into a fresh one. */
  const generationRef = useRef(0)
  /** Mirrors `pending` for the run loop, which decides the phase after a turn. */
  const pendingRef = useRef<PendingMove | null>(null)

  const [settings, setSettings] = useState<PlaySettings>(DEFAULT_SETTINGS)
  const [fen, setFen] = useState(START_FEN)
  const [moves, setMoves] = useState<PlayedMove[]>([])
  const [phase, setPhase] = useState<PlayPhase>('idle')
  const [refused, setRefused] = useState<MoveReview | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
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

  /** Applies the handicap, or removes it, and only when it actually changes. */
  const setLimited = useCallback(async (engine: Engine, limited: boolean) => {
    const wanted = limited ? settingsRef.current.elo : null
    if (appliedEloRef.current === wanted) return

    if (wanted === null) {
      await engine.setOption('UCI_LimitStrength', false)
    } else {
      await engine.setOption('UCI_LimitStrength', true)
      await engine.setOption('UCI_Elo', wanted)
    }

    appliedEloRef.current = wanted
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

          // A move held for the player's decision is not the player's turn and
          // not the engine's: it is its own state, and ends when they choose.
          if (pendingRef.current !== null) {
            setPhase('confirm')
            return
          }

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
      appliedEloRef.current = undefined
      baselineRef.current = null
      fenRef.current = START_FEN
      movesRef.current = []

      pendingRef.current = null

      setSettings(next)
      setPending(null)
      setRefused(null)
      setLastReview(null)
      setError(null)
      publish()

      run(async (engine) => {
        // Clear whatever the last game left applied.
        await setLimited(engine, false)
        if (next.playerColor === 'b') await playEngineMove(engine)
        await refreshBaseline(engine)
      })
    },
    [playEngineMove, publish, refreshBaseline, run, setLimited],
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
            uci: move.uci,
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

          // Otherwise training hands the decision back. The move goes on the
          // board and is graded, but nothing is committed: the player sees what
          // it did and chooses. A move that ends the game is committed at once,
          // since there is nothing left to reconsider.
          if (mode === 'training' && outcomeOf(move.fenAfter) === 'playing') {
            const held: PendingMove = { move: { ...move, review }, review }
            pendingRef.current = held
            setPending(held)
            setLastReview(review)
            setFen(move.fenAfter)
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

  /** Keeps the pending move: it joins the game and the opponent answers. */
  const confirm = useCallback(() => {
    const held = pendingRef.current
    if (held === null) return

    pendingRef.current = null
    setPending(null)

    movesRef.current = [...movesRef.current, held.move]
    fenRef.current = held.move.fenAfter
    publish()

    run(async (engine) => {
      if (outcomeOf(fenRef.current) !== 'playing') return
      await playEngineMove(engine)
      if (outcomeOf(fenRef.current) !== 'playing') return
      await refreshBaseline(engine)
    })
  }, [playEngineMove, publish, refreshBaseline, run])

  /**
   * Drops the pending move.
   *
   * Nothing has to be undone: the move was never committed, so the position and
   * the baseline analysis are still the ones the first attempt was graded
   * against, and the next attempt is measured by exactly the same numbers.
   */
  const takeBack = useCallback(() => {
    if (pendingRef.current === null) return

    pendingRef.current = null
    setPending(null)
    setLastReview(null)
    setFen(fenRef.current)
    setPhase('player')
  }, [])

  const resign = useCallback(() => {
    generationRef.current += 1
    pendingRef.current = null
    engineRef.current?.stop()
    setPending(null)
    setPhase('over')
  }, [])

  const outcome = outcomeOf(fen)
  const playerToMove = phase === 'player' && turnOf(fen) === settings.playerColor

  // Kept stable: the board is reconfigured whenever this changes identity, and
  // reconfiguring it mid-drag would drop the piece the player is holding.
  const dests = useMemo(
    () => (playerToMove ? legalDestinations(fen) : EMPTY_DESTS),
    [playerToMove, fen],
  )

  return {
    fen,
    moves,
    phase,
    outcome,
    dests,
    refused,
    pending,
    lastReview,
    error,
    settings,
    start,
    play,
    confirm,
    takeBack,
    resign,
  }
}
