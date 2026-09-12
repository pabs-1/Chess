/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { ImportError, fetchGames } from '../import/index.ts'
import type { GameSource, ImportErrorCode, ImportedGame } from '../import/index.ts'

export type ImportStatus = 'idle' | 'searching' | 'done' | 'error'

export interface UseGameImportResult {
  status: ImportStatus
  games: ImportedGame[]
  /** A code; the wording comes from the translation files. */
  error: ImportErrorCode | null
  search: (source: GameSource, username: string) => void
  reset: () => void
}

export function useGameImport(): UseGameImportResult {
  const abortRef = useRef<AbortController | null>(null)

  const [status, setStatus] = useState<ImportStatus>('idle')
  const [games, setGames] = useState<ImportedGame[]>([])
  const [error, setError] = useState<ImportErrorCode | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const search = useCallback((source: GameSource, username: string) => {
    const trimmed = username.trim()
    if (trimmed === '') return

    // One search at a time: a new one replaces whatever is still in flight.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('searching')
    setGames([])
    setError(null)

    void (async () => {
      try {
        const found = await fetchGames(source, trimmed, { signal: controller.signal })
        if (controller.signal.aborted) return
        setGames(found)
        setStatus('done')
      } catch (caught) {
        if (controller.signal.aborted) return
        setError(caught instanceof ImportError ? caught.code : 'unexpected')
        setStatus('error')
      }
    })()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setGames([])
    setError(null)
  }, [])

  return { status, games, error, search, reset }
}
