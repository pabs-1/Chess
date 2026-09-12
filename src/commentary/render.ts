/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import type { TFunction } from 'i18next'

import type { CommentStep } from './types.ts'

/**
 * Renders one step into a sentence.
 *
 * Comment keys are assembled at runtime from motif ids, so they cannot be the
 * literal types the typed `t` expects. The cast lives here, once, rather than
 * at every call site — and comment.test.ts proves every key it can produce
 * resolves in every language, which is the guarantee the types would have given.
 */
export function renderStep(t: TFunction, step: CommentStep): string {
  const translate = t as unknown as (
    key: string,
    values: Readonly<Record<string, string | number>>,
  ) => string

  return translate(step.key, step.values)
}
