/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useTranslation } from 'react-i18next'

import { classificationStyle } from './classificationStyle.ts'
import type { ReviewedMove } from '../analysis/index.ts'

export interface MoveListProps {
  moves: readonly ReviewedMove[]
  /** Position index: 0 is the starting position, ply + 1 is after that ply. */
  selected: number
  onSelect: (positionIndex: number) => void
}

function MoveButton({
  move,
  selected,
  onSelect,
}: {
  move: ReviewedMove | undefined
  selected: boolean
  onSelect: (positionIndex: number) => void
}) {
  const { t } = useTranslation()
  if (move === undefined) return <span />

  const style = classificationStyle(move.classification)

  return (
    <button
      type="button"
      onClick={() => onSelect(move.ply + 1)}
      aria-current={selected}
      aria-label={t('review.selectMove', { move: `${move.san}, ${t(`classification.${move.classification}`)}` })}
      className={`flex items-center gap-1 rounded px-2 py-1 text-left font-mono text-sm hover:bg-slate-800 ${
        selected ? 'bg-slate-700 text-slate-50' : style.text
      }`}
    >
      <span>{move.san}</span>
      {style.glyph !== '' && <span aria-hidden="true">{style.glyph}</span>}
    </button>
  )
}

export function MoveList({ moves, selected, onSelect }: MoveListProps) {
  const { t } = useTranslation()

  // Group into printed move numbers: White and Black share a row, and a game
  // that starts from a position may open with Black.
  const rows: { moveNumber: number; white?: ReviewedMove; black?: ReviewedMove }[] = []
  for (const move of moves) {
    const last = rows[rows.length - 1]
    if (last?.moveNumber === move.moveNumber && move.color === 'b') {
      last.black = move
    } else {
      rows.push(move.color === 'w' ? { moveNumber: move.moveNumber, white: move } : { moveNumber: move.moveNumber, black: move })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-slate-300">{t('review.moves')}</h3>

      <ol className="max-h-96 overflow-y-auto rounded-md border border-slate-800">
        <li>
          <button
            type="button"
            onClick={() => onSelect(0)}
            aria-current={selected === 0}
            className={`w-full px-3 py-1.5 text-left text-xs ${
              selected === 0 ? 'bg-slate-700 text-slate-50' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            {t('review.startPosition')}
          </button>
        </li>

        {rows.map((row) => (
          <li
            key={`${row.moveNumber}-${row.white?.ply ?? row.black?.ply ?? 0}`}
            className="grid grid-cols-[3rem_1fr_1fr] items-center gap-1 px-1 odd:bg-slate-900/50"
          >
            <span className="px-2 text-xs tabular-nums text-slate-500">{row.moveNumber}.</span>
            <MoveButton move={row.white} selected={selected === (row.white?.ply ?? -2) + 1} onSelect={onSelect} />
            <MoveButton move={row.black} selected={selected === (row.black?.ply ?? -2) + 1} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </div>
  )
}
