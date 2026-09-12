/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useEffect, useState } from 'react'

import { classifyOpening, loadOpeningBook } from '../openings/index.ts'
import type { OpeningClassification } from '../openings/index.ts'

/**
 * Names the opening of a game, loading the book the first time one is needed.
 *
 * The book is about 450 KB, so it is a separate chunk fetched on demand rather
 * than part of the page every visitor downloads. Until it arrives the result is
 * null, which the interface shows as nothing at all: a missing opening name is
 * not worth a spinner.
 *
 * `positions` must keep its identity between renders, or the name is discarded
 * and looked up again on every one.
 */
export function useOpening(positions: readonly string[]): OpeningClassification | null {
  const [classified, setClassified] = useState<readonly string[] | null>(null)
  const [classification, setClassification] = useState<OpeningClassification | null>(null)

  // Clear during render rather than in an effect: a new game must never show
  // the previous game's opening, not even for one paint.
  if (positions !== classified) {
    setClassified(positions)
    setClassification(null)
  }

  useEffect(() => {
    if (positions.length < 2) return

    let cancelled = false
    void loadOpeningBook().then((book) => {
      if (!cancelled) setClassification(classifyOpening(book, positions))
    })

    return () => {
      cancelled = true
    }
  }, [positions])

  return classification
}
