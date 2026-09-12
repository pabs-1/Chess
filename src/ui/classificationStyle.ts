/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import type { MoveClassification } from '../analysis/index.ts'

/**
 * How each grade is drawn.
 *
 * `glyph` is standard chess annotation, the same in every language, so it is
 * notation rather than text and does not belong in the translation files. The
 * words for each grade do, and come from `classification.*`.
 */
interface ClassificationStyle {
  glyph: string
  text: string
  dot: string
}

const STYLES: Record<MoveClassification, ClassificationStyle> = {
  forced: { glyph: '□', text: 'text-sky-300', dot: 'bg-sky-400' },
  best: { glyph: '', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  excellent: { glyph: '', text: 'text-emerald-200', dot: 'bg-emerald-300' },
  good: { glyph: '', text: 'text-slate-200', dot: 'bg-slate-400' },
  inaccuracy: { glyph: '?!', text: 'text-amber-300', dot: 'bg-amber-400' },
  mistake: { glyph: '?', text: 'text-orange-300', dot: 'bg-orange-400' },
  blunder: { glyph: '??', text: 'text-rose-300', dot: 'bg-rose-400' },
}

export function classificationStyle(classification: MoveClassification): ClassificationStyle {
  return STYLES[classification]
}

/** Every grade, in the order a summary should list them. */
export const CLASSIFICATION_ORDER: readonly MoveClassification[] = [
  'best',
  'excellent',
  'good',
  'forced',
  'inaccuracy',
  'mistake',
  'blunder',
]
