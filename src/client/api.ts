/**
 * Same-origin loopback client for the safeguard host routes. All calls go
 * over `/api/safeguard/*`; the host fences them to loopback requests.
 */

import type { GuardMode, GuardState } from '../core/types.ts'

const STATE = '/api/safeguard/state'
const MODE = '/api/safeguard/mode'
const DECIDE = '/api/safeguard/decide'

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`safeguard: ${response.status}`)
  return response.json() as Promise<T>
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Client face of the guard API (the chip's injected verbs). */
export interface CommandGuardApi {
  state: () => Promise<GuardState>
  setMode: (mode: GuardMode) => Promise<GuardState>
  answer: (decisionId: string, approve: boolean) => Promise<void>
}

/** Build the guard API against the ambient fetch. */
export function createApi(fetchFn: typeof fetch = fetch): CommandGuardApi {
  return {
    async state() {
      return asJson<GuardState>(await fetchFn(STATE, { cache: 'no-store' }))
    },
    async setMode(mode) {
      const response = await post(MODE, { mode })
      const body = await asJson<{ state: GuardState }>(response)
      return body.state
    },
    async answer(decisionId, approve) {
      await post(DECIDE, { decisionId, approve })
    },
  }
}