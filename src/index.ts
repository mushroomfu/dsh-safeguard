/**
 * Host loader entry for the safeguard plugin — runs in the DSH host
 * process. It owns the guard store, the loopback routes, the model-judge
 * wiring, the settings section, and the `tools/pre-execute` auto-judgment gate.
 *
 * The decision engine (src/core/*) is framework-free; the gate
 * (src/pre-execute.ts) is the official pre-dispatch seam where the pending
 * command arrives with its parsed arguments. The model judge
 * (src/judge-client.ts) drives a configurable OpenAI-compatible endpoint. The
 * client half (src/client/*) renders the mode-switch chip in the composer tool
 * row.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { GUARD_MODES } from './core/policy.ts'
import type { GuardMode } from './core/types.ts'
import { createHttpModelJudge } from './judge-client.ts'
import type { ModelJudge } from './judge.ts'
import { installPreExecuteGuard } from './pre-execute.ts'
import { makeRoutes } from './routes.ts'
import { GuardStore } from './store.ts'

/** Required host services. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Settings namespace of the guard (the web settings surface edits it). */
export const SETTINGS_NAMESPACE = settingsNamespace('safeguard')

const SECTION_ORDER = 250

/** Model-facing announcement (kept short per issue #839); opt-in only. */
export const COMMAND_GUARD_GUIDANCE = '本机已安装 dsh-safeguard 插件：模型判定的命令权限守卫。它会在命令执行前判断该命令是否危险或多余，并按模式自动放行/拒绝/跳过/询问；在输入框下方工具行的模式开关控制。用户提到「命令守卫 / 自动审批 / 危险命令」时即指本插件。'

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Master switch. */
  enabled?: boolean
  /** Running mode: off | observe | assist | auto. */
  mode?: GuardMode
  /** OpenAI-compatible base URL for the model judge; empty = model judge off. */
  judgeApiBase?: string
  /** Model id the judge endpoint runs. */
  judgeModel?: string
  /** Env var holding the judge endpoint bearer key; empty = no auth header. */
  judgeApiKeyEnv?: string
  /** Inject the agent-facing announcement (defaults off to keep prompts clean). */
  announceToAgent?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  mode: z.union([
    z.const('off' as const),
    z.const('observe' as const),
    z.const('assist' as const),
    z.const('auto' as const),
  ]).default('observe'),
  judgeApiBase: z.string().default(''),
  judgeModel: z.string().default(''),
  judgeApiKeyEnv: z.string().default(''),
  announceToAgent: z.boolean().default(false),
})

function asMode(value: string | undefined, fallback: GuardMode = 'observe'): GuardMode {
  return value !== undefined && (GUARD_MODES as readonly string[]).includes(value)
    ? (value as GuardMode)
    : fallback
}

/**
 * Build the model judge from config. Empty endpoint or model disables it and
 * the guard stays deterministic (unclassified commands fail closed to risky).
 */
function buildModelJudge(config: Config): ModelJudge | undefined {
  const base = (config.judgeApiBase ?? '').trim()
  const model = (config.judgeModel ?? '').trim()
  if (base === '' || model === '') return undefined
  return createHttpModelJudge({
    baseURL: base,
    model,
    apiKeyEnv: (config.judgeApiKeyEnv ?? '').trim() || undefined,
    timeoutMs: 10_000,
  })
}

/**
 * Apply the host half.
 * @param ctx - plugin context carrying webServer/tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The composition entry (the profile-patch override lands here) is the
  // authoritative source for the judge endpoint — a deployment config, not a
  // live user setting.
  const composition: Config = config ?? {}

  const store = new GuardStore()
  // Boot default comes from the composition config (e.g. `mode: assist`); the
  // chip's /mode route then overrides it at runtime.
  store.setMode(asMode(composition.mode))

  // Live source: the settings section once the web settings surface is served,
  // the composition entry otherwise.
  let current: () => Config = () => composition
  let judge: ModelJudge | undefined

  // The effective mode is the store's runtime value: the chip's /mode route
  // updates it directly, and settings changes sync announcement/judge here.
  const modeOf = (): GuardMode => store.getMode()

  // Routes are always mounted; the loopback fence keeps them safe when the
  // web server is reachable beyond localhost.
  ctx.effect(() => {
    const disposers = makeRoutes(store).map(route => ctx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  }, 'safeguard: routes')

  // The pre-execute gate is registered once and reads live mode/judge on every
  // pending tool call, so a mode switch applies immediately.
  installPreExecuteGuard(ctx, {
    store,
    judge: () => judge,
    mode: modeOf,
  })

  // System-prompt announcement, opt-in (default off).
  let disposeSection: (() => void) | undefined
  const syncAnnounce = (): void => {
    disposeSection?.()
    disposeSection = undefined
    if (current().announceToAgent !== true) return
    disposeSection = ctx.systemPrompt.section({
      name: 'plugin:safeguard',
      order: SECTION_ORDER,
      text: COMMAND_GUARD_GUIDANCE,
    })
  }

  const sync = (): void => {
    // Judge endpoint is deployment config: read it from the composition entry,
    // not the settings source (which may not carry it). Mode is NOT reset here:
    // it is a boot-time composition default plus a live chip override.
    judge = buildModelJudge(composition)
    syncAnnounce()
  }

  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, composition, {
    setSource: (source) => { current = source },
    onChange: sync,
  })

  ctx.effect(() => () => { disposeSection?.() }, 'safeguard: lifecycle')

  sync()
}