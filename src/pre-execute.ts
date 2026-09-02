/**
 * The auto-judgment gate: a `tools/pre-execute` waterfall listener that reads
 * the pending tool call (name + parsed arguments), extracts the shell command,
 * judges danger + necessity, and returns allow / deny / ask before dispatch.
 *
 * This is the correct DSH seam for "judge the command before it runs": it fires
 * before execution with the exact parsed arguments, and `{ kind: 'ask' }`
 * delegates to the official approval UI instead of inventing a private prompt.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { decide } from './core/policy.ts'
import type { CommandContext, DecisionRecord, GuardMode } from './core/types.ts'
import type { ModelJudge } from './judge.ts'
import { judgeCommand } from './judge.ts'
import { newDecisionId, type GuardStore } from './store.ts'

/** Argument fields a shell-like tool carries its command in. */
const COMMAND_FIELDS = ['command', 'cmd', 'line'] as const

/** Extract a non-empty command string from a tool call's parsed arguments. */
export function extractCommand(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const record = args as Record<string, unknown>
  for (const field of COMMAND_FIELDS) {
    const value = record[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/** Resolved guard dependencies for the pre-execute listener. */
export interface GuardDeps {
  store: GuardStore
  judge: () => ModelJudge | undefined
  mode: () => GuardMode
  permission?: () => string | undefined
}

/**
 * Register the `tools/pre-execute` listener once. It reads live mode/judge on
 * every pending tool call, so a mode switch applies without re-registration.
 */
export function installPreExecuteGuard(ctx: Context, deps: GuardDeps): void {
  // Param types arrive from ctx.on's event signature (`Events['tools/pre-execute']`).
  ctx.on('tools/pre-execute', async (exec, next) => {
    const mode = deps.mode()
    if (mode === 'off') return next()

    const command = extractCommand(exec.arguments)
    if (command === undefined) return next()

    const context: CommandContext = { command, permission: deps.permission?.() }
    const verdict = await judgeCommand(context, deps.judge())
    const action = decide(verdict, mode)

    const record: DecisionRecord = {
      id: newDecisionId(),
      command,
      verdict,
      action,
      mode,
      time: Date.now(),
    }
    deps.store.record(record)

    // observe: record only, never change the default behavior.
    if (mode === 'observe') return next()

    // skip / deny both refuse the call; the reason travels to the model.
    if (action === 'skip' || action === 'deny') return { kind: 'deny', reason: verdict.reason }

    // allow (safe, risky, or unclassified): defer to the default pipeline —
    // the guard never adds an approval prompt for ordinary work.
    return next()
  })
}