/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PLAY_MODES, isCheck, needsPromotion, turnOf } from '../analysis/index.ts'
import type { Color, PlayMode } from '../analysis/index.ts'
import { Board } from './Board.tsx'
import { PromotionPicker, type PromotionPiece } from './PromotionPicker.tsx'
import { classificationStyle } from './classificationStyle.ts'
import { ELO_LEVELS, usePlayGame } from './usePlayGame.ts'
import { useOpening } from './useOpening.ts'
import type { MoveReview } from './usePlayGame.ts'

function ReviewLine({ review, refused }: { review: MoveReview; refused: boolean }) {
  const { t } = useTranslation()
  const style = classificationStyle(review.classification)

  return (
    <div
      role={refused ? 'alert' : undefined}
      className={`flex flex-col gap-1 rounded-md border p-3 ${
        refused ? 'border-rose-800 bg-rose-950/60' : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
        <span className="font-mono text-sm">{review.san}</span>
        <span className={`text-sm font-medium ${style.text}`}>
          {t(`classification.${review.classification}`)}
        </span>
      </div>

      {review.motif !== null && (
        <p className="text-sm text-slate-200">{t(`commentary.motif.${review.motif.id}.theme`)}</p>
      )}

      {refused ? (
        <p className="text-sm text-rose-200">{t('play.refusedHint')}</p>
      ) : (
        review.bestMoveSan !== null && (
          <p className="text-sm text-slate-300">
            {t('commentary.solution', { move: review.bestMoveSan })}
          </p>
        )
      )}
    </div>
  )
}

export function PlayPage() {
  const { t } = useTranslation()
  const game = usePlayGame()

  const [mode, setMode] = useState<PlayMode>('coach')
  const [playerColor, setPlayerColor] = useState<Color>('w')
  const [elo, setElo] = useState<number | null>(1600)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)

  const modeFieldId = useId()
  const colourFieldId = useId()
  const strengthFieldId = useId()

  const positions = useMemo(
    () => [...game.moves.map((move) => move.fenBefore), game.fen],
    [game.moves, game.fen],
  )
  const opening = useOpening(positions)

  const started = game.phase !== 'idle'
  const playerToMove = game.phase === 'player' && turnOf(game.fen) === game.settings.playerColor

  function onBoardMove(from: string, to: string) {
    if (needsPromotion(game.fen, from, to)) {
      setPending({ from, to })
      return
    }
    game.play(from, to)
  }

  function onPromote(piece: PromotionPiece) {
    if (pending === null) return
    game.play(pending.from, pending.to, piece)
    setPending(null)
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">{t('play.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('play.description')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={modeFieldId}>
            {t('play.mode')}
          </label>
          <select
            id={modeFieldId}
            value={mode}
            onChange={(event) => setMode(event.target.value as PlayMode)}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
          >
            {PLAY_MODES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`play.modes.${candidate}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={colourFieldId}>
            {t('play.color')}
          </label>
          <select
            id={colourFieldId}
            value={playerColor}
            onChange={(event) => setPlayerColor(event.target.value as Color)}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
          >
            <option value="w">{t('color.white')}</option>
            <option value="b">{t('color.black')}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={strengthFieldId}>
            {t('play.strength')}
          </label>
          <select
            id={strengthFieldId}
            value={elo === null ? 'max' : String(elo)}
            onChange={(event) =>
              setElo(event.target.value === 'max' ? null : Number(event.target.value))
            }
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
          >
            {ELO_LEVELS.map((level) => (
              <option key={level ?? 'max'} value={level === null ? 'max' : String(level)}>
                {level === null ? t('play.strengthMax') : t('play.strengthElo', { elo: level })}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setPending(null)
            game.start({ mode, playerColor, elo })
          }}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t('play.newGame')}
        </button>

        {started && game.phase !== 'over' && (
          <button
            type="button"
            onClick={game.resign}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm"
          >
            {t('play.resign')}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">{t(`play.modeHelp.${mode}`)}</p>

      {!started ? (
        <p className="text-sm text-slate-500">{t('play.notStarted')}</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex w-full max-w-[28rem] shrink-0 flex-col gap-3">
            <Board
              fen={game.fen}
              orientation={game.settings.playerColor === 'w' ? 'white' : 'black'}
              lastMove={game.moves[game.moves.length - 1]?.uci}
              check={isCheck(game.fen)}
              label={t('play.title')}
              movable={
                playerToMove && pending === null
                  ? {
                      color: game.settings.playerColor,
                      dests: game.dests,
                      onMove: onBoardMove,
                    }
                  : undefined
              }
            />

            {pending !== null && (
              <PromotionPicker onChoose={onPromote} onCancel={() => setPending(null)} />
            )}

            <p aria-live="polite" className="text-sm text-slate-400">
              {game.phase === 'loading'
                ? t('play.loading')
                : game.phase === 'engine'
                  ? t('play.thinking')
                  : game.phase === 'over'
                    ? t(`play.outcome.${game.outcome === 'playing' ? 'resigned' : game.outcome}`)
                    : t('play.yourTurn')}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {game.error !== null && (
              <p role="alert" className="rounded-md border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
                {t('play.error', { message: game.error })}
              </p>
            )}

            {game.refused !== null && <ReviewLine review={game.refused} refused />}

            {game.refused === null && game.lastReview !== null && game.settings.mode === 'coach' && (
              <ReviewLine review={game.lastReview} refused={false} />
            )}

            {opening?.opening != null && (
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">{t('play.opening')}: </span>
                <span className="font-mono text-xs text-slate-500">{opening.opening.eco}</span>{' '}
                {opening.opening.name}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-slate-300">{t('play.moves')}</h3>
              <ol className="max-h-80 overflow-y-auto rounded-md border border-slate-800 p-2 font-mono text-sm">
                {game.moves.map((move) => (
                  <li key={move.ply} className="inline-block pr-2">
                    {move.color === 'w' && (
                      <span className="text-slate-500">{move.moveNumber}. </span>
                    )}
                    <span className={move.review === null ? '' : classificationStyle(move.review.classification).text}>
                      {move.san}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
