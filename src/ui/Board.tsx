/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'

import { parseUciMove } from '../analysis/index.ts'

export interface BoardProps {
  /** Position to show. */
  fen: string
  orientation?: 'white' | 'black'
  /** Move to highlight, in UCI; the move that produced this position. */
  lastMove?: string | undefined
  /** Accessible description, since the board itself is a grid of divs. */
  label?: string
}

/**
 * Chessground, wrapped for React.
 *
 * View only for now: the review navigates positions, it does not play them.
 * Making it interactive is a matter of handing chessground `movable` — it is
 * built for that — and is left for when there is a game to play.
 */
export function Board({ fen, orientation = 'white', lastMove, label }: BoardProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<Api | null>(null)

  // The instance outlives renders; React only ever hands it new props.
  useEffect(() => {
    const mount = mountRef.current
    if (mount === null) return

    const api = Chessground(mount, {
      viewOnly: true,
      coordinates: true,
      addPieceZIndex: true,
      animation: { enabled: true, duration: 180 },
      drawable: { enabled: false },
    })
    apiRef.current = api

    return () => {
      api.destroy()
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    const move = lastMove === undefined ? null : parseUciMove(lastMove)
    // exactOptionalPropertyTypes: chessground's Config wants the key absent
    // rather than set to undefined when there is no move to highlight.
    apiRef.current?.set({
      fen,
      orientation,
      ...(move === null ? {} : { lastMove: [move.from, move.to] as Key[] }),
    })
  }, [fen, orientation, lastMove])

  return (
    <div
      ref={mountRef}
      role="img"
      aria-label={label ?? fen}
      className="cg-wrap aspect-square w-full max-w-[28rem]"
    />
  )
}
