/**
 * The safeguard chip, mounted in the composer tool row
 * (`conversation.input.left`) beside the resident access-mode (permission)
 * control below the input. It shows the active mode and opens a popover with
 * the mode switch and the recent verdict feed. The popover renders through a
 * portal into document.body at a fixed above-the-chip position, so it expands
 * upward and stays on the top layer instead of being clipped or covered by the
 * composer dock / tool-call info strip.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Danger, GuardMode, GuardState } from '../core/types.ts'
import type { CommandGuardInjected } from './index.ts'
import type { CommandGuardKey } from './locales.ts'
import css from './chip.module.css'

export type CommandGuardChipProps =
  PropsRuntime<'conversation.input.left'>
  & CommandGuardInjected
  & PropsLocale<'safeguard'>

const MODES: readonly GuardMode[] = ['off', 'observe', 'assist', 'auto']

const MODE_LABEL_KEY: Record<GuardMode, CommandGuardKey> = {
  off: 'chip.mode.off',
  observe: 'chip.mode.observe',
  assist: 'chip.mode.assist',
  auto: 'chip.mode.auto',
}

const DANGER_LABEL_KEY: Record<Danger, CommandGuardKey> = {
  safe: 'chip.safe',
  risky: 'chip.risky',
  dangerous: 'chip.dangerous',
}

/** Top-layer z-index for the portal popover. */
const POPOVER_Z = 2147483000
/** Estimated popover width used to clamp the fixed position inside the viewport. */
const POPOVER_WIDTH = 320
/** Poll interval while the popover is open. */
const POLL_MS = 1500

interface Placement {
  left: number
  bottom: number
}

export function CommandGuardChip(props: CommandGuardChipProps) {
  const t = props.t
  const [state, setState] = useState<GuardState | null>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setState(await props.state())
    } catch {
      // Host route unreachable (e.g. before the web server serves it): keep UI inert.
    }
  }, [props])

  useEffect(() => {
    // Fetch once on mount so the chip shows the host's current mode immediately
    // instead of the fallback, then poll while the popover is open.
    void refresh()
    if (!open) return undefined
    const timer = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(timer)
  }, [open, refresh])

  // Position the portal popover just above the chip, clamped into the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const anchor = anchorRef.current
    if (anchor === null) {
      setPlacement(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - POPOVER_WIDTH - 8))
    const bottom = window.innerHeight - rect.top + 8
    setPlacement({ left, bottom })
  }, [open])

  // Close the popover when the user clicks anywhere outside the chip or the
  // portal popover.
  useEffect(() => {
    if (!open) return undefined
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      const inside = (anchorRef.current?.contains(target) ?? false)
        || (popoverRef.current?.contains(target) ?? false)
      if (!inside) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const switchMode = useCallback(async (mode: GuardMode) => {
    if (busy.current) return
    busy.current = true
    try {
      setState(await props.setMode(mode))
      setOpen(false)
    } catch {
      // On failure keep the previous state and leave the popover open to retry.
    } finally {
      busy.current = false
    }
  }, [props])

  const mode = state?.mode ?? 'observe'

  const popover = open && placement !== null && (
    <div
      ref={popoverRef}
      className={css.popover}
      role="menu"
      style={{ position: 'fixed', left: placement.left, bottom: placement.bottom, zIndex: POPOVER_Z }}
    >
      <div className={css.modeRow}>
        {MODES.map(option => (
          <button
            key={option}
            type="button"
            className={option === mode ? `${css.modeButton} ${css.modeButtonActive}` : css.modeButton}
            onClick={() => { void switchMode(option) }}
          >
            {t(MODE_LABEL_KEY[option])}
          </button>
        ))}
      </div>

      <div className={css.sectionTitle}>{t('chip.feedTitle')}</div>
      {state === null || state.recent.length === 0 ? (
        <div className={css.empty}>{t('chip.feedEmpty')}</div>
      ) : (
        <div className={css.feedList}>
          {state.recent.slice(0, 12).map(item => (
            <div key={item.id} className={css.feedItem}>
              <span className={css.command}>{item.command}</span>
              <div className={css.tagRow}>
                <span className={`${css.tag} ${dangerClass(item.verdict.danger)}`}>{t(DANGER_LABEL_KEY[item.verdict.danger])}</span>
                <span className={css.reason}>{item.verdict.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={css.footer}>
        <button type="button" className={css.refresh} onClick={() => { void refresh() }}>{t('chip.refresh')}</button>
      </div>
    </div>
  )

  return (
    <div className={css.chipWrap} data-dsh-plugin="safeguard" data-dsh-part="chip">
      <button
        ref={anchorRef}
        type="button"
        className={css.chip}
        aria-label={t('chip.open')}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span>{t('chip.title')}</span>
        <span className={css.modeText}>{t(MODE_LABEL_KEY[mode])}</span>
      </button>

      {popover && createPortal(popover, document.body)}
    </div>
  )
}

function dangerClass(danger: Danger): string {
  if (danger === 'safe') return css.tagSafe
  if (danger === 'risky') return css.tagRisky
  return css.tagDangerous
}