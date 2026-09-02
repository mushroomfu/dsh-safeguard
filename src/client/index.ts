/**
 * Browser-half entry for the safeguard plugin — runs inside the dsh web
 * GUI. It registers the locale dictionaries and mounts the chip into the
 * composer tool row (`conversation.input.left`), beside the resident
 * access-mode (permission) control below the input.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { GuardMode, GuardState } from '../core/types.ts'
import { createApi } from './api.ts'
import { CommandGuardChip } from './CommandGuardChip.tsx'
import { en, zh } from './locales.ts'
import './slots-augment.ts'

export type { CommandGuardKey } from './locales.ts'
export { CommandGuardChip } from './CommandGuardChip.tsx'

/** Injected business face of the chip: the host guard verbs over loopback. */
export interface CommandGuardInjected {
  state: () => Promise<GuardState>
  setMode: (mode: GuardMode) => Promise<GuardState>
  answer: (decisionId: string, approve: boolean) => Promise<void>
}

/** Required services: slots for the chip seat, conversation for its seam, locale for the copy. */
export const inject = ['slots', 'conversation', 'locale']

/** Dictionary namespace owned by this plugin. */
const NS = 'safeguard'

/** The chip entry shape (id, order, locale, inject face) for both register calls. */
const chipEntry = (api: ReturnType<typeof createApi>) => ({
  id: 'safeguard',
  order: 110,
  locale: NS,
  inject: (): CommandGuardInjected => ({
    state: () => api.state(),
    setMode: mode => api.setMode(mode),
    answer: (decisionId, approve) => api.answer(decisionId, approve),
  }),
} as const)

/**
 * Client plugin body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'safeguard: dictionaries')

  const api = createApi()

  // Mount the chip directly into the composer tool row. `conversation.input.left`
  // is declared by the conversation plugin, which is already composed here, so a
  // direct register is both simpler and safer than the declaration-aware
  // `slots.inject` wait (which can miss an already-declared slot and never fire).
  ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
    try {
      scope.slots.register(
        { name: 'conversation.input.left', ...chipEntry(api) },
        CommandGuardChip,
      )
    } catch (error) {
      console.warn('[safeguard] failed to register into conversation.input.left', error)
    }
  })
}