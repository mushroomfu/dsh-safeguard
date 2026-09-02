/**
 * Shared domain types for safeguard, importable from both the host half
 * (node) and the browser half (web). Pure contracts only — no cordis, no
 * runtime imports — so the classifier/policy stay trivially unit-testable and
 * the wire between host routes and the client chip keeps one shape.
 */

/** Risk band a command falls into. */
export type Danger = 'safe' | 'risky' | 'dangerous'

/** How a verdict was produced (deterministic rule vs. model judge). */
export type VerdictSource = 'rule' | 'model'

/** One command judgment. */
export interface Verdict {
  /** Risk band. */
  danger: Danger
  /** Whether the command should run at all (false = redundant/no-op). */
  necessary: boolean
  /** Short human-readable reason (localized on the client, not a raw i18n key). */
  reason: string
  /** Producer of this verdict. */
  source: VerdictSource
}

/** Guard running mode, settable from the selector chip or the settings card. */
export type GuardMode = 'off' | 'observe' | 'assist' | 'auto'

/** What the guard decides the executor should do with a command. */
export type GuardAction = 'allow' | 'skip' | 'ask' | 'deny'

/** Execution context supplied to the classifier / judge. */
export interface CommandContext {
  /** Raw command line as the tool received it. */
  command: string
  /** Working directory, when known. */
  cwd?: string
  /** Session permission preset id (read-only | workspace-write | danger-full-access). */
  permission?: string
}

/** Outcome of a guarded execution attempt. */
export type GuardedExecResult =
  | { outcome: 'ran'; exitCode: number | null; stdout: string; stderr: string; durationMs: number }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'denied'; reason: string }
  | { outcome: 'pending-approval'; decisionId: string; reason: string }

/** One recorded decision, served to the client for the chip feed. */
export interface DecisionRecord {
  id: string
  command: string
  cwd?: string
  verdict: Verdict
  action: GuardAction
  mode: GuardMode
  time: number
}

/** Guard state snapshot polled by the client chip. */
export interface GuardState {
  mode: GuardMode
  /** Most recent decisions, newest first. */
  recent: DecisionRecord[]
  /** Approval requests currently waiting for a human answer. */
  pending: DecisionRecord[]
}