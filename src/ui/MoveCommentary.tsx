/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { commentFor, renderStep } from '../commentary/index.ts'
import type { ReviewedMove } from '../analysis/index.ts'

export interface MoveCommentaryProps {
  move: ReviewedMove
}

/**
 * The explanation for one move, revealed a step at a time.
 *
 * A player who wants to work out what went wrong gets a nudge and can stop
 * there; the answer is two clicks away, not on the screen already. The parent
 * gives this a key per move, so moving on starts the ladder again from the top.
 */
export function MoveCommentary({ move }: MoveCommentaryProps) {
  const { t } = useTranslation()
  const steps = useMemo(() => commentFor(move), [move])
  const [revealed, setRevealed] = useState(1)

  if (steps.length === 0) return null

  const shown = steps.slice(0, revealed)
  const hasMore = revealed < steps.length

  return (
    <section className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <h4 className="text-xs uppercase tracking-wide text-slate-400">{t('commentary.title')}</h4>

      <ol className="flex flex-col gap-1">
        {shown.map((step) => (
          <li key={step.kind} className="text-sm text-slate-200">
            {renderStep(t, step)}
          </li>
        ))}
      </ol>

      {hasMore && (
        <div>
          <button
            type="button"
            onClick={() => setRevealed((current) => current + 1)}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
          >
            {t('commentary.reveal')}
          </button>
        </div>
      )}
    </section>
  )
}
