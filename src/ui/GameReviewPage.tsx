/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_REVIEW_DEPTH, formatEval, gamePositions, parsePgn } from '../analysis/index.ts'
import type { GameReview, ReviewedMove } from '../analysis/index.ts'
import type { ImportedGame } from '../import/index.ts'
import { Board } from './Board.tsx'
import { GameImporter } from './GameImporter.tsx'
import { MoveCommentary } from './MoveCommentary.tsx'
import { EvalChart } from './EvalChart.tsx'
import { MoveList } from './MoveList.tsx'
import { CLASSIFICATION_ORDER, classificationStyle } from './classificationStyle.ts'
import { useGameReview } from './useGameReview.ts'

/** The Blackburne Shilling Gambit: short, and both players go badly wrong. */
// No player tags, so the review falls back to the translated colour names
// rather than shipping one language's words inside a fixture.
const EXAMPLE_PGN = `[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`

const MIN_DEPTH = 8
const MAX_DEPTH = 22

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function AccuracyBadge({ label, accuracy }: { label: string; accuracy: number | null }) {
  const { t, i18n } = useTranslation()
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.resolvedLanguage],
  )

  return (
    <div className="rounded-md border border-slate-800 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {accuracy === null ? t('review.accuracyUnavailable') : formatter.format(accuracy)}
      </div>
    </div>
  )
}

function MoveDetail({ move }: { move: ReviewedMove | null }) {
  const { t, i18n } = useTranslation()
  const formatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }),
    [i18n.resolvedLanguage],
  )

  if (move === null) return <p className="text-sm text-slate-500">{t('review.startPosition')}</p>

  const style = classificationStyle(move.classification)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-800 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
        <span className="font-mono text-sm">
          {move.moveNumber}
          {move.color === 'w' ? '.' : '…'} {move.san}
        </span>
        <span className={`text-sm font-medium ${style.text}`}>
          {t(`classification.${move.classification}`)}
        </span>
        {move.evaluation !== null && (
          <span className="ml-auto font-mono text-sm text-slate-400">
            {formatEval(move.evaluation)}
          </span>
        )}
      </div>

      {move.winPercentLost > 0 && (
        <p className="text-sm text-slate-300">
          {t('review.lost', { percent: formatter.format(move.winPercentLost) })}
        </p>
      )}

      {move.bestMoveSan !== null && move.bestMove !== move.uci && (
        <p className="text-sm text-slate-300">{t('review.bestWas', { move: move.bestMoveSan })}</p>
      )}

      <MoveCommentary key={move.ply} move={move} />

      {move.alternatives.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {t('review.alternatives')}
          </div>
          <ol className="mt-1 flex flex-col gap-0.5">
            {move.alternatives.map((alternative) => (
              <li key={alternative.uci} className="font-mono text-sm text-slate-300">
                {alternative.san}{' '}
                <span className="text-slate-500">
                  {formatter.format(alternative.winPercent)}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Summary({ review, whiteName, blackName }: { review: GameReview; whiteName: string; blackName: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-slate-300">{t('review.summary')}</h3>
      <table className="text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="py-1 pr-3 text-left font-medium" />
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              {whiteName}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {blackName}
            </th>
          </tr>
        </thead>
        <tbody>
          {CLASSIFICATION_ORDER.filter(
            (grade) => review.counts.w[grade] > 0 || review.counts.b[grade] > 0,
          ).map((grade) => {
            const style = classificationStyle(grade)
            return (
              <tr key={grade}>
                <td className="py-0.5 pr-3">
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
                  <span className={style.text}>{t(`classification.${grade}`)}</span>
                </td>
                <td className="py-0.5 pr-3 text-right tabular-nums">{review.counts.w[grade]}</td>
                <td className="py-0.5 text-right tabular-nums">{review.counts.b[grade]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GameReviewPage() {
  const { t } = useTranslation()
  const { status, progress, review, error, start, cancel, reset } = useGameReview()

  const [pgn, setPgn] = useState('')
  const [depth, setDepth] = useState(DEFAULT_REVIEW_DEPTH)
  const [selected, setSelected] = useState(0)
  const [inputTab, setInputTab] = useState<'paste' | 'fetch'>('paste')

  const pgnFieldId = useId()
  const depthFieldId = useId()

  const parsed = useMemo(() => (pgn.trim() === '' ? null : parsePgn(pgn)), [pgn])
  const busy = status === 'loading' || status === 'running'

  const positions = useMemo(
    () => (review === null ? [] : gamePositions(review.game)),
    [review],
  )

  // Adjust state during render rather than in an effect: when a review arrives
  // the board should already be showing its final position on the first paint,
  // and an effect would repaint to get there.
  const [shownReview, setShownReview] = useState<GameReview | null>(null)
  if (review !== shownReview) {
    setShownReview(review)
    setSelected(review === null ? 0 : review.moves.length)
  }

  const step = useCallback(
    (delta: number) => {
      setSelected((current) => clamp(current + delta, 0, Math.max(0, positions.length - 1)))
    },
    [positions.length],
  )

  useEffect(() => {
    if (review === null) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return
      }
      if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else return
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [review, step])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (parsed === null || !parsed.ok || busy) return
    start(parsed.game, depth)
  }

  function onPickImported(game: ImportedGame) {
    // Keep the PGN either way: if it will not parse, the paste tab is where the
    // reason is shown, along with the text that caused it.
    setPgn(game.pgn)

    const result = parsePgn(game.pgn)
    if (result.ok) start(result.game, depth)
    else setInputTab('paste')
  }

  if (review !== null) {
    const selectedMove = selected === 0 ? null : (review.moves[selected - 1] ?? null)
    const headers = review.game.headers
    const whiteName = headers.white ?? t('color.white')
    const blackName = headers.black ?? t('color.black')

    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {t('review.players', { white: whiteName, black: blackName })}
            </h2>
            <p className="text-xs text-slate-500">{t('review.depthUsed', { depth: review.depth })}</p>
          </div>

          <div className="flex items-center gap-3">
            <AccuracyBadge label={`${t('review.accuracy')} · ${whiteName}`} accuracy={review.accuracy.w} />
            <AccuracyBadge label={`${t('review.accuracy')} · ${blackName}`} accuracy={review.accuracy.b} />
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              {t('review.again')}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex w-full max-w-[28rem] shrink-0 flex-col gap-3">
            <Board
              fen={positions[selected] ?? ''}
              lastMove={selectedMove?.uci}
              label={t('review.startPosition')}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={selected === 0}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
              >
                ← {t('review.previousMove')}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={selected >= positions.length - 1}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('review.nextMove')} →
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <MoveDetail move={selectedMove} />
            <MoveList moves={review.moves} selected={selected} onSelect={setSelected} />
            <Summary review={review} whiteName={whiteName} blackName={blackName} />
          </div>
        </div>

        <EvalChart
          winPercentWhite={review.winPercentWhite}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">{t('review.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('review.description')}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {(['paste', 'fetch'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setInputTab(candidate)}
            aria-current={inputTab === candidate ? 'true' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              inputTab === candidate
                ? 'border-emerald-500 text-slate-50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(candidate === 'paste' ? 'import.tabPaste' : 'import.tabFetch')}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={depthFieldId}>
            {t('review.depthLabel')}
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

        {busy && (
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm"
          >
            {t('review.cancel')}
          </button>
        )}
      </div>

      {inputTab === 'fetch' ? (
        <GameImporter onPick={onPickImported} disabled={busy} />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300" htmlFor={pgnFieldId}>
              {t('review.pgnLabel')}
            </label>
            <textarea
              id={pgnFieldId}
              className="min-h-40 rounded-md border border-slate-700 bg-slate-900 p-2 font-mono text-sm"
              value={pgn}
              spellCheck={false}
              placeholder={t('review.pgnPlaceholder')}
              aria-invalid={parsed !== null && !parsed.ok}
              onChange={(event) => setPgn(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-rose-400">
                {parsed !== null && !parsed.ok ? t(`review.pgnError.${parsed.error}`) : ''}
              </span>
              <button
                type="button"
                className="text-xs text-slate-400 underline hover:text-slate-200"
                onClick={() => setPgn(EXAMPLE_PGN)}
              >
                {t('review.loadExample')}
              </button>
            </div>
            {parsed !== null && !parsed.ok && parsed.detail !== '' && (
              <p className="font-mono text-xs text-slate-500">{parsed.detail}</p>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={parsed?.ok !== true || busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {t('review.analyse')}
            </button>
          </div>
        </form>
      )}

      {busy && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm text-slate-300">
            {status === 'loading'
              ? t('review.status.loading')
              : `${t(`review.status.${progress?.phase ?? 'scan'}`)} — ${t('review.progress', {
                  completed: progress?.completed ?? 0,
                  total: progress?.total ?? 0,
                })}`}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-[width]"
              style={{
                width: `${
                  progress === null || progress.total === 0
                    ? 0
                    : Math.round((progress.completed / progress.total) * 100)
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {status === 'cancelled' && <p className="text-sm text-slate-400">{t('review.cancelled')}</p>}

      {status === 'error' && error !== null && (
        <p role="alert" className="rounded-md border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {t('review.error', { message: error })}
        </p>
      )}
    </section>
  )
}
