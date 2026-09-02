/**
 * Policy machine: turns a verdict plus the active mode into a concrete action.
 * Pure and deterministic; the single source of truth for how dangerous /
 * redundant commands map to allow | skip | deny. The guard only intervenes for
 * the two cases the user asked for — dangerous and unnecessary — and defers
 * everything else to the sandbox, so it never adds approval prompts.
 */

import type { GuardAction, GuardMode, Verdict } from './types.ts'

/** Human labels for the mode, used by the chip (keys, not i18n). */
export const GUARD_MODES: readonly GuardMode[] = ['off', 'observe', 'assist', 'auto']

/**
 * Decide the executor action for a verdict under a mode.
 *
 * - off:        never intervene (the guard is not even consulted).
 * - observe:    run everything, only record the judgment.
 * - assist/auto: deny dangerous commands and skip redundant ones; everything
 *   else runs normally (the sandbox keeps bounding it), so the guard reduces
 *   prompts instead of adding them. auto is the same as assist for the
 *   deterministic layer — the model judge (when configured) is what would
 *   further split safe from risky.
 */
export function decide(verdict: Verdict, mode: GuardMode): GuardAction {
  if (mode === 'off' || mode === 'observe') return 'allow'
  if (!verdict.necessary) return 'skip'
  if (verdict.danger === 'dangerous') return 'deny'
  return 'allow'
}

/** Whether a mode actually mutates execution flow (off/observe do not). */
export function isEnforcing(mode: GuardMode): boolean {
  return mode === 'assist' || mode === 'auto'
}