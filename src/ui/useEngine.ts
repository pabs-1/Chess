/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { Engine, EngineDisposedError } from '../engine/index.ts'
import type { AnalyseRequest, AnalysisResult, AnalysisSnapshot, EngineState } from '../engine/index.ts'

export interface UseEngineResult {
  state: EngineState
  /** Latest data, streamed while the search deepens. */
  snapshot: AnalysisSnapshot | null
  /** Set once the search ends; carries the best move. */
  result: AnalysisResult | null
  error: string | null
  analyse: (request: AnalyseRequest) => void
  stop: () => void
}

/**
 * Owns one Engine for the lifetime of the component.
 *
 * The engine is created on mount but booted lazily on the first analysis, so
 * opening the page does not pull 7 MB of WebAssembly nobody asked for.
 */
export function useEngine(): UseEngineResult {
  const engineRef = useRef<Engine | null>(null)
  const [state, setState] = useState<EngineState>('idle')
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  const analyse = useCallback((request: AnalyseRequest) => {
    const engine = engineRef.current
    if (engine === null) return

    setError(null)
    setResult(null)
    setSnapshot(null)

    void (async () => {
      try {
        if (engine.state === 'idle') {
          setState('loading')
          await engine.init()
        }
        setState('searching')

        const analysis = await engine.analyse({
          ...request,
          onProgress: (progress) => setSnapshot(progress),
        })
        setSnapshot(analysis)
        setResult(analysis)
      } catch (caught) {
        // Disposal is how unmounting cancels work, not a failure worth showing.
        if (caught instanceof EngineDisposedError) return
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setState(engineRef.current?.state ?? 'disposed')
      }
    })()
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
  }, [])

  return { state, snapshot, result, error, analyse, stop }
}
