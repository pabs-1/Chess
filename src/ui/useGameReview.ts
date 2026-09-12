/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { ReviewCancelledError, reviewGame } from '../analysis/index.ts'
import type { GameReview, ParsedGame, ReviewProgress } from '../analysis/index.ts'
import { Engine, EngineDisposedError } from '../engine/index.ts'

export type ReviewStatus = 'idle' | 'loading' | 'running' | 'done' | 'cancelled' | 'error'

export interface UseGameReviewResult {
  status: ReviewStatus
  progress: ReviewProgress | null
  review: GameReview | null
  error: string | null
  start: (game: ParsedGame, depth: number) => void
  cancel: () => void
  reset: () => void
}

/**
 * Owns an Engine and runs a whole-game review on it.
 *
 * The engine boots on the first review rather than on mount, so opening the
 * page costs nothing. Cancelling aborts between positions: the search in flight
 * is stopped and the review rejects.
 */
export function useGameReview(): UseGameReviewResult {
  const engineRef = useRef<Engine | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [status, setStatus] = useState<ReviewStatus>('idle')
  const [progress, setProgress] = useState<ReviewProgress | null>(null)
  const [review, setReview] = useState<GameReview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine
    return () => {
      engineRef.current = null
      abortRef.current?.abort()
      engine.dispose()
    }
  }, [])

  const start = useCallback((game: ParsedGame, depth: number) => {
    const engine = engineRef.current
    if (engine === null) return

    const controller = new AbortController()
    abortRef.current = controller

    setReview(null)
    setError(null)
    setProgress(null)

    void (async () => {
      try {
        if (engine.state === 'idle') {
          setStatus('loading')
          await engine.init()
        }
        setStatus('running')

        const result = await reviewGame(engine, game, {
          depth,
          signal: controller.signal,
          onProgress: setProgress,
        })

        setReview(result)
        setStatus('done')
      } catch (caught) {
        if (caught instanceof ReviewCancelledError) {
          setStatus('cancelled')
          return
        }
        // Unmounting disposes the engine; that is cancellation, not a failure.
        if (caught instanceof EngineDisposedError) return
        setError(caught instanceof Error ? caught.message : String(caught))
        setStatus('error')
      }
    })()
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    engineRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setReview(null)
    setError(null)
  }, [])

  return { status, progress, review, error, start, cancel, reset }
}
