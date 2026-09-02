/**
 * Locale augmentation for the safeguard chip. Only the locale namespace is
 * registered here. The chip mounts into the official `conversation.input.left`
 * slot — the left end of the composer tool row, right after the resident
 * access-mode (permission) control — which @deepseek-ai/dsh-client-ui-
 * conversation already declares, so no slot augmentation is needed.
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { CommandGuardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The safeguard chip copy. */
    'safeguard': CommandGuardKey
  }
}