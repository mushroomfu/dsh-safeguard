/**
 * Loopback-only API the browser half polls/drives:
 *   GET  /api/safeguard/state   -> GuardState
 *   POST /api/safeguard/mode    -> { mode } set the run mode
 *   POST /api/safeguard/decide  -> { decisionId, approve } answer an ask
 *
 * Every route is fence-guarded to loopback requests: these endpoints change
 * how eagerly the guard lets commands run, so a LAN-exposed dsh web
 * deployment must not serve them to remote browsers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { GuardStore } from './store.ts'
import type { GuardMode, GuardState } from './core/types.ts'
import { GUARD_MODES } from './core/policy.ts'

export const COMMAND_GUARD_API = {
  state: '/api/safeguard/state',
  mode: '/api/safeguard/mode',
  decide: '/api/safeguard/decide',
} as const

/** Whether a request arrived from a loopback address. */
function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    return null
  }
}

function isGuardMode(value: unknown): value is GuardMode {
  return typeof value === 'string' && (GUARD_MODES as readonly string[]).includes(value)
}

/** One handler that guards loopback + method, then delegates. */
function route(
  path: string,
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      await handle(req, res)
    },
  }
}

/** Build the safeguard route family. */
export function makeRoutes(store: GuardStore): WebRoute[] {
  return [
    route(COMMAND_GUARD_API.state, async (_req, res) => {
      const state: GuardState = store.snapshot()
      writeJson(res, 200, state)
    }),

    route(COMMAND_GUARD_API.mode, async (req, res) => {
      const body = await readJson<{ mode?: unknown }>(req)
      if (body === null || !isGuardMode(body.mode)) {
        writeJson(res, 400, { error: 'mode must be one of off | observe | assist | auto' })
        return
      }
      store.setMode(body.mode)
      writeJson(res, 200, { ok: true, state: store.snapshot() })
    }),

    route(COMMAND_GUARD_API.decide, async (req, res) => {
      const body = await readJson<{ decisionId?: unknown; approve?: unknown }>(req)
      const decisionId = typeof body?.decisionId === 'string' ? body.decisionId : ''
      const approve = body?.approve === true
      if (decisionId === '') {
        writeJson(res, 400, { error: 'decisionId is required' })
        return
      }
      const found = store.answer(decisionId, approve)
      writeJson(res, found ? 200 : 404, { ok: found, state: store.snapshot() })
    }),
  ]
}