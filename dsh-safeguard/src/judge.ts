/**
 * The judgment seam: deterministic rule first, model judge second, fail-closed
 * fallback last. Kept small and separate so the LLM wiring can change without
 * touching the executor or the client.
 *
 * The model judge is intentionally an injected function. Wire it to the host's
 * official LLM service (ctx.llm / ctx.llmProvider) with a compact JSON prompt
 * that returns { danger, necessary, reason }. When no model is configured the
 * guard still works — it just treats every unclassified command as `risky`
 * (ask in assist, deny in auto), which is the safe direction.
 */

import { classifyCommand } from './core/classify.ts'
import type { CommandContext, Verdict } from './core/types.ts'

/** A model-backed judgment source; may return undefined when it cannot answer. */
export type ModelJudge = (ctx: CommandContext) => Promise<Verdict | undefined>

/**
 * Produce a verdict for one command. Deterministic rules short-circuit first;
 * ambiguous commands fall through to the optional model judge; a fully
 * unclassified command lands on a conservative `risky` verdict so the policy
 * machine never auto-allows something unknown.
 */
export async function judgeCommand(ctx: CommandContext, model?: ModelJudge): Promise<Verdict> {
  const rule = classifyCommand(ctx)
  if (rule !== undefined) return rule

  if (model !== undefined) {
    try {
      const verdict = await model(ctx)
      if (verdict !== undefined) {
        return { ...verdict, source: 'model' }
      }
    } catch {
      // Model judge failure is not an approval: fall through to fail-closed.
    }
  }

  return {
    danger: 'risky',
    necessary: true,
    reason: 'unclassified command (no model judge); fail-closed',
    source: 'rule',
  }
}

/**
 * Compact prompt the model judge answers. It must return strict JSON only:
 * `{ "danger": "safe"|"risky"|"dangerous", "necessary": true|false, "reason": "…" }`.
 */
export function buildJudgePrompt(ctx: CommandContext): string {
  const cwd = ctx.cwd ?? '(unknown)'
  const permission = ctx.permission ?? 'default'
  return [
    'You are a command permission guard. Classify the shell command below.',
    'Do NOT execute it. Answer with strict JSON only, no markdown, in this shape:',
    '{"danger":"safe|risky|dangerous","necessary":true|false,"reason":"short reason"}',
    '',
    `command: ${ctx.command}`,
    `cwd: ${cwd}`,
    `permission: ${permission}`,
    '',
    'Rules:',
    '- necessary=false means the command has no useful side effect or output (e.g. echo, true, clear, a redundant probe).',
    '- danger=safe means read-only/informational; risky means mutating/privileged/remote; dangerous means destructive or security-critical.',
  ].join('\n')
}

/** Parse a model judge reply into a verdict, or undefined on any malformed input. */
export function parseJudgeReply(text: string): Verdict | undefined {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as { danger?: unknown; necessary?: unknown; reason?: unknown }
  if (record.danger !== 'safe' && record.danger !== 'risky' && record.danger !== 'dangerous') return undefined
  if (typeof record.necessary !== 'boolean') return undefined
  if (typeof record.reason !== 'string' || record.reason.trim() === '') return undefined
  return { danger: record.danger, necessary: record.necessary, reason: record.reason, source: 'model' }
}

/**
 * Build a ModelJudge from a completion callback (e.g. the host LLM service).
 * Any completion failure resolves to undefined so judgeCommand falls back
 * to the fail-closed `risky` verdict.
 */
export function createModelJudge(
  complete: (prompt: string) => Promise<string>,
): ModelJudge {
  return async (ctx) => {
    let reply: string
    try {
      reply = await complete(buildJudgePrompt(ctx))
    } catch {
      // A completion failure is "cannot answer", not a crash: resolve undefined
      // so judgeCommand fails closed instead of propagating the transport error.
      return undefined
    }
    return parseJudgeReply(reply)
  }
}