/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useTranslation } from 'react-i18next'

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

const CHOICES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n']

/** Piece letters as they appear in SAN: notation, identical in every language. */
const LETTERS: Record<PromotionPiece, string> = { q: 'Q', r: 'R', b: 'B', n: 'N' }

export interface PromotionPickerProps {
  onChoose: (piece: PromotionPiece) => void
  onCancel: () => void
}

/**
 * Asks which piece a pawn becomes.
 *
 * Chessground does not handle this, and defaulting to a queen would quietly
 * play the wrong move in the positions where underpromotion is the point.
 */
export function PromotionPicker({ onChoose, onCancel }: PromotionPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-700 bg-slate-900 p-3">
      <span className="text-sm text-slate-300">{t('play.promotion')}</span>

      {CHOICES.map((piece) => (
        <button
          key={piece}
          type="button"
          onClick={() => onChoose(piece)}
          aria-label={t(`pieceDef.${piece}`)}
          className="rounded-md border border-slate-700 px-3 py-1 font-mono text-lg hover:bg-slate-800"
        >
          {LETTERS[piece]}
        </button>
      ))}

      <button
        type="button"
        onClick={onCancel}
        className="ml-auto text-xs text-slate-400 underline hover:text-slate-200"
      >
        {t('review.cancel')}
      </button>
    </div>
  )
}
