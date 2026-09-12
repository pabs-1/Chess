/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Color as BoardColor, Dests, Key } from 'chessground/types'

import { parseUciMove } from '../analysis/index.ts'
import type { Color } from '../analysis/index.ts'

export interface BoardProps {
  /** Position to show. */
  fen: string
  orientation?: 'white' | 'black'
  /** Move to highlight, in UCI; the move that produced this position. */
  lastMove?: string | undefined
  /** Accessible description, since the board itself is a grid of divs. */
  label?: string
  /**
   * Which side the viewer may move, and where. Omit for a board that is only
   * looked at, which is what the review does.
   */
  movable?:
    | {
        color: Color
        /** Legal destinations per origin square. */
        dests: Map<string, string[]>
        onMove: (from: string, to: string) => void
      }
    | undefined
  /** Squares to mark, e.g. a king in check. */
  check?: boolean
}

const BOARD_COLOR: Record<Color, BoardColor> = { w: 'white', b: 'black' }

/**
 * Chessground, wrapped for React.
 *
 * The instance outlives renders and is never recreated: React hands it new
 * props, and it animates between positions itself. Recreating it per render
 * would lose the animation and the drag in progress.
 */
export function Board({
  fen,
  orientation = 'white',
  lastMove,
  label,
  movable,
  check = false,
}: BoardProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<Api | null>(null)
  /**
   * Kept in a ref so the handler chessground was given at mount never goes
   * stale, without rebuilding the board every time the parent re-renders.
   */
  const onMoveRef = useRef(movable?.onMove)
  useEffect(() => {
    onMoveRef.current = movable?.onMove
  })

  useEffect(() => {
    const mount = mountRef.current
    if (mount === null) return

    const api = Chessground(mount, {
      coordinates: true,
      addPieceZIndex: true,
      animation: { enabled: true, duration: 180 },
      drawable: { enabled: false },
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (from: Key, to: Key) => {
            onMoveRef.current?.(from, to)
          },
        },
      },
    })
    apiRef.current = api

    return () => {
      api.destroy()
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    const move = lastMove === undefined ? null : parseUciMove(lastMove)
    const dests: Dests = new Map()
    if (movable !== undefined) {
      for (const [from, tos] of movable.dests) dests.set(from as Key, tos as Key[])
    }

    // exactOptionalPropertyTypes: chessground's Config wants keys absent rather
    // than set to undefined, so the optional halves are spread in.
    apiRef.current?.set({
      fen,
      orientation,
      check,
      viewOnly: movable === undefined,
      ...(movable === undefined
        ? { movable: { free: false, showDests: true, dests } }
        : {
            turnColor: BOARD_COLOR[movable.color],
            movable: { free: false, showDests: true, color: BOARD_COLOR[movable.color], dests },
          }),
      ...(move === null ? {} : { lastMove: [move.from, move.to] as Key[] }),
    })
  }, [fen, orientation, lastMove, movable, check])

  return (
    <div
      ref={mountRef}
      role="img"
      aria-label={label ?? fen}
      className="cg-wrap aspect-square w-full max-w-[28rem]"
    />
  )
}
