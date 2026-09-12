/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatEval, isValidFen, uciMoveToSan, uciPvToSan, winPercentFromLine } from '../analysis/index.ts'
import type { AnalysisLine } from '../engine/index.ts'
import { useEngine } from './useEngine.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MIN_DEPTH = 1
const MAX_DEPTH = 30
const MIN_MULTI_PV = 1
const MAX_MULTI_PV = 5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * A deliberately plain harness for the engine wrapper: paste a FEN, run a
 * search, watch the typed results stream in as the depth grows. It exists to
 * prove the wrapper works, not to look like the finished product.
 */
export function AnalysisPlayground() {
  const { t, i18n } = useTranslation()
  const { state, snapshot, result, error, analyse, stop } = useEngine()

  const [fen, setFen] = useState(START_FEN)
  const [depth, setDepth] = useState(18)
  const [multiPV, setMultiPV] = useState(3)

  const fenFieldId = useId()
  const depthFieldId = useId()
  const multiPvFieldId = useId()

  const fenIsValid = isValidFen(fen.trim())
  const isSearching = state === 'searching'

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.resolvedLanguage],
  )

  const analysedFen = snapshot?.fen ?? fen.trim()
  const lines: AnalysisLine[] = snapshot?.lines ?? []
  const bestMoveSan =
    result === null || result.bestMove === '' ? null : uciMoveToSan(result.fen, result.bestMove)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">{t('playground.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('playground.description')}</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!fenIsValid || isSearching) return
          analyse({ fen: fen.trim(), depth, multiPV })
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={fenFieldId}>
            {t('playground.fenLabel')}
          </label>
          <textarea
            id={fenFieldId}
            className="min-h-20 rounded-md border border-slate-700 bg-slate-900 p-2 font-mono text-sm"
            value={fen}
            spellCheck={false}
            aria-invalid={!fenIsValid}
            onChange={(event) => setFen(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-rose-400">{fenIsValid ? '' : t('playground.fenInvalid')}</span>
            <button
              type="button"
              className="text-xs text-slate-400 underline hover:text-slate-200"
              onClick={() => setFen(START_FEN)}
            >
              {t('playground.fenReset')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300" htmlFor={depthFieldId}>
              {t('playground.depthLabel')}
            </label>
            <input
              id={depthFieldId}
              type="number"
              className="w-24 rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
              min={MIN_DEPTH}
              max={MAX_DEPTH}
              value={depth}
              onChange={(event) =>
                setDepth(clamp(Number(event.target.value) || MIN_DEPTH, MIN_DEPTH, MAX_DEPTH))
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300" htmlFor={multiPvFieldId}>
              {t('playground.multiPvLabel')}
            </label>
            <input
              id={multiPvFieldId}
              type="number"
              className="w-24 rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
              min={MIN_MULTI_PV}
              max={MAX_MULTI_PV}
              value={multiPV}
              onChange={(event) =>
                setMultiPV(
                  clamp(Number(event.target.value) || MIN_MULTI_PV, MIN_MULTI_PV, MAX_MULTI_PV),
                )
              }
            />
          </div>

          <button
            type="submit"
            disabled={!fenIsValid || isSearching || state === 'loading'}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('playground.analyse')}
          </button>

          <button
            type="button"
            onClick={stop}
            disabled={!isSearching}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
          >
            {t('playground.stop')}
          </button>

          <span aria-live="polite" className="text-sm text-slate-400">
            {t(`engineState.${state}`)}
          </span>
        </div>
      </form>

      {error !== null && (
        <p role="alert" className="rounded-md border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {t('playground.error', { message: error })}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">{t('playground.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-300">
            <span>{t('playground.depthReached', { depth: snapshot?.depthReached ?? 0 })}</span>
            {bestMoveSan !== null && <span>{t('playground.bestMove', { move: bestMoveSan })}</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">{t('playground.columnLine')}</th>
                  <th className="py-2 pr-4 font-medium">{t('playground.columnEval')}</th>
                  <th className="py-2 pr-4 font-medium">{t('playground.columnWinPercent')}</th>
                  <th className="py-2 pr-4 font-medium">{t('playground.columnWdl')}</th>
                  <th className="py-2 font-medium">{t('playground.columnPv')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.multipv} className="border-b border-slate-800 align-top">
                    <td className="py-2 pr-4 tabular-nums text-slate-400">{line.multipv}</td>
                    <td className="py-2 pr-4 font-mono tabular-nums">{formatEval(line)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {percentFormatter.format(winPercentFromLine(line))}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-slate-400">
                      {line.wdl === null
                        ? t('playground.wdlUnavailable')
                        : [line.wdl.win, line.wdl.draw, line.wdl.loss]
                            .map((permille) => percentFormatter.format(permille / 10))
                            .join(' · ')}
                    </td>
                    <td className="py-2 font-mono text-slate-200">
                      {uciPvToSan(analysedFen, line.pv).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">{t('playground.sideToMoveHint')}</p>
        </div>
      )}
    </section>
  )
}
