/**
 * Host-side HTTP model judge: calls a configurable OpenAI-compatible
 * chat/completions endpoint to classify one command. This mirrors how the
 * family's describe-image tool drives a model from a host plugin (direct
 * fetch against a resolved endpoint, redirects refused, key from an env var,
 * body bounded) instead of assuming an unconfirmed `ctx.llm` completion face.
 *
 * The endpoint is optional and off by default: an empty `baseURL` disables the
 * model judge and the guard falls back to the deterministic rule layer plus
 * its fail-closed `risky` verdict.
 */

import type { CommandContext, Verdict } from './core/types.ts'
import { buildJudgePrompt, parseJudgeReply, type ModelJudge } from './judge.ts'

/** Resolved endpoint the judge posts to. */
export interface JudgeEndpointConfig {
  /** OpenAI-compatible base URL (without `/chat/completions`); empty disables the judge. */
  baseURL: string
  /** Model id to send. */
  model: string
  /** Env var holding the bearer key; empty means no Authorization header. */
  apiKeyEnv?: string
  /** Per-call timeout (defaults to 10s). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TEXT_BYTES = 4096

/** Narrow unknown JSON to a plain object. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Extract the single assistant text from a chat/completions payload. */
function extractChatText(payload: unknown): string | undefined {
  const root = asRecord(payload)
  const choices = root?.['choices']
  if (!Array.isArray(choices) || choices.length === 0) return undefined
  const message = asRecord(asRecord(choices[0])?.['message'])
  if (message === undefined) return undefined
  const content = message['content']
  if (typeof content === 'string' && content.trim() !== '') return content
  const reasoning = message['reasoning'] ?? message['reasoning_content']
  if (typeof reasoning === 'string' && reasoning.trim() !== '') return reasoning
  if (Array.isArray(reasoning)) {
    const parts = reasoning.filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    if (parts.length > 0) return parts.join('\n')
  }
  return undefined
}

/**
 * Post one judgment prompt and return the unparsed assistant text. Every
 * failure resolves to undefined so the caller falls back to fail-closed, never
 * to an automatic allowance.
 */
export async function judgeChatCompletions(
  ctx: CommandContext,
  cfg: JudgeEndpointConfig,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const base = cfg.baseURL.trim()
  if (base === '' || cfg.model.trim() === '') return undefined
  const keyEnv = (cfg.apiKeyEnv ?? '').trim()
  const apiKey = keyEnv === '' ? undefined : process.env[keyEnv]
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey !== undefined && apiKey !== '') headers.authorization = `Bearer ${apiKey}`

  const body = JSON.stringify({
    model: cfg.model.trim(),
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: buildJudgePrompt(ctx) }],
  })

  const url = `${base.replace(/\/+$/, '')}/chat/completions`
  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: signal ?? AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch {
    return undefined
  }
  if (!response.ok) return undefined

  const text = await response.text()
  const bounded = text.length > MAX_TEXT_BYTES ? text.slice(0, MAX_TEXT_BYTES) : text

  let content: string | undefined
  try {
    content = extractChatText(JSON.parse(bounded))
  } catch {
    content = undefined
  }
  // Envelope missing or non-standard: hand the raw body to parseJudgeReply (it
  // tolerates fenced JSON and finds the first {...}), so a bare verdict reply
  // still works.
  return content ?? bounded
}

/** Build a {@link ModelJudge} backed by the HTTP endpoint. */
export function createHttpModelJudge(cfg: JudgeEndpointConfig, fetchFn: typeof fetch = fetch): ModelJudge {
  return async (ctx) => {
    const text = await judgeChatCompletions(ctx, cfg, fetchFn)
    return text === undefined ? undefined : parseJudgeReply(text)
  }
}