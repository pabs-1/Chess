/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useId } from 'react'
import { useTranslation } from 'react-i18next'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 200

export interface EvalChartProps {
  /** Win percentage for White at each position, starting position first. */
  winPercentWhite: readonly number[]
  /** Index into that array, i.e. the position currently on the board. */
  selected: number
  onSelect: (index: number) => void
}

/**
 * The evaluation graph, drawn by hand.
 *
 * It is a filled area under a polyline and a midline — a charting library would
 * be a dependency for one shape. The vertical axis is always White's win
 * percentage, so the picture does not flip meaning every ply.
 */
export function EvalChart({ winPercentWhite, selected, onSelect }: EvalChartProps) {
  const { t } = useTranslation()
  const gradientId = useId()

  if (winPercentWhite.length < 2) return null

  const lastIndex = winPercentWhite.length - 1
  const x = (index: number) => (index / lastIndex) * VIEW_WIDTH
  const y = (percent: number) => VIEW_HEIGHT - (percent / 100) * VIEW_HEIGHT

  const curve = winPercentWhite.map((percent, index) => `${x(index)},${y(percent)}`).join(' ')
  const area = `0,${VIEW_HEIGHT} ${curve} ${VIEW_WIDTH},${VIEW_HEIGHT}`
  const columnWidth = VIEW_WIDTH / lastIndex

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium text-slate-300">{t('review.graph')}</figcaption>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full rounded-md border border-slate-800 bg-slate-900"
        role="presentation"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline points={curve} fill="none" stroke="#f8fafc" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          x2={VIEW_WIDTH}
          y1={VIEW_HEIGHT / 2}
          y2={VIEW_HEIGHT / 2}
          stroke="#64748b"
          strokeDasharray="6 6"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x(selected)}
          x2={x(selected)}
          y1="0"
          y2={VIEW_HEIGHT}
          stroke="#34d399"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />

        {winPercentWhite.map((_, index) => (
          <rect
            key={index}
            x={x(index) - columnWidth / 2}
            y={0}
            width={columnWidth}
            height={VIEW_HEIGHT}
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onSelect(index)}
          />
        ))}
      </svg>

      <p className="text-xs text-slate-500">{t('review.graphHint')}</p>
    </figure>
  )
}
