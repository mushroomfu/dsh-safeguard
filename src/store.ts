/**
 * In-memory guard store: keeps the running mode, the recent-decision ring the
 * client chip polls, and the pending human-approval requests created by the
 * `ask` path. Host-process local; no persistence (decisions are ephemeral UI
 * surface, not a security audit log).
 *
 * Bounded: the recent-decision ring is capped so a long-running host cannot
 * grow unbounded memory from a chatty agent.
 */

import { randomUUID } from 'node:crypto'
import type { DecisionRecord, GuardMode, GuardState } from './core/types.ts'

/** Hard cap on retained recent decisions (newest first). */
const RECENT_LIMIT = 50

/** Default timeout before a pending `ask` auto-declines. */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

interface PendingApproval {
  decisionId: string
  command: string
  reason: string
  resolve: (approved: boolean) => void
}

export class GuardStore {
  private mode: GuardMode = 'observe'
  private recent: DecisionRecord[] = []
  private readonly pending = new Map<string, PendingApproval>()

  setMode(mode: GuardMode): void {
    this.mode = mode
  }

  getMode(): GuardMode {
    return this.mode
  }

  record(record: DecisionRecord): void {
    this.recent.unshift(record)
    if (this.recent.length > RECENT_LIMIT) this.recent.length = RECENT_LIMIT
  }

  /**
   * Register a pending approval for the `ask` path. Resolves true when the
   * user approves, false on decline or timeout (fail-closed: nothing runs
   * without an explicit human approval).
   */
  awaitApproval(decisionId: string, command: string, reason: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pending.set(decisionId, { decisionId, command, reason, resolve })
      setTimeout(() => this.answer(decisionId, false), APPROVAL_TIMEOUT_MS).unref?.()
    })
  }

  /** Resolve a pending approval (called by the client decide API). */
  answer(decisionId: string, approved: boolean): boolean {
    const entry = this.pending.get(decisionId)
    if (entry === undefined) return false
    this.pending.delete(decisionId)
    entry.resolve(approved)
    return true
  }

  /** Snapshot for the client chip: mode + recent feed + waiting approvals. */
  snapshot(): GuardState {
    return {
      mode: this.mode,
      recent: [...this.recent],
      pending: [...this.pending.values()].map(({ decisionId, command, reason }) => ({
        id: decisionId,
        command,
        verdict: { danger: 'risky' as const, necessary: true, reason, source: 'model' as const },
        action: 'ask' as const,
        mode: this.mode,
        time: 0,
      })),
    }
  }
}

/** Short stable id for a decision record. */
export function newDecisionId(): string {
  return randomUUID()
}