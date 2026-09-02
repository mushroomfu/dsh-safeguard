/**
 * Client dictionary for the safeguard chip. `zh` is the key source, `en`
 * is the complete mirror. Registered through ctx.locale.register under the
 * safeguard namespace.
 */

export interface CommandGuardLocale {
  'chip.title': string
  'chip.mode.off': string
  'chip.mode.observe': string
  'chip.mode.assist': string
  'chip.mode.auto': string
  'chip.open': string
  'chip.refresh': string
  'chip.feedTitle': string
  'chip.feedEmpty': string
  'chip.pendingTitle': string
  'chip.approve': string
  'chip.decline': string
  'chip.allow': string
  'chip.skip': string
  'chip.ask': string
  'chip.deny': string
  'chip.safe': string
  'chip.risky': string
  'chip.dangerous': string
}

export type CommandGuardKey = keyof CommandGuardLocale

export const zh: Record<CommandGuardKey, string> = {
  'chip.title': '命令守卫',
  'chip.mode.off': '关',
  'chip.mode.observe': '观察',
  'chip.mode.assist': '辅助',
  'chip.mode.auto': '自动',
  'chip.open': '切换或查看判定',
  'chip.refresh': '刷新',
  'chip.feedTitle': '最近判定',
  'chip.feedEmpty': '尚无判定记录',
  'chip.pendingTitle': '待确认',
  'chip.approve': '允许',
  'chip.decline': '拒绝',
  'chip.allow': '放行',
  'chip.skip': '跳过',
  'chip.ask': '询问',
  'chip.deny': '拒绝',
  'chip.safe': '安全',
  'chip.risky': '有风险',
  'chip.dangerous': '危险',
}

export const en: Record<CommandGuardKey, string> = {
  'chip.title': 'Command guard',
  'chip.mode.off': 'Off',
  'chip.mode.observe': 'Observe',
  'chip.mode.assist': 'Assist',
  'chip.mode.auto': 'Auto',
  'chip.open': 'Switch or inspect verdicts',
  'chip.refresh': 'Refresh',
  'chip.feedTitle': 'Recent verdicts',
  'chip.feedEmpty': 'No verdicts yet',
  'chip.pendingTitle': 'Awaiting approval',
  'chip.approve': 'Allow',
  'chip.decline': 'Deny',
  'chip.allow': 'allow',
  'chip.skip': 'skip',
  'chip.ask': 'ask',
  'chip.deny': 'deny',
  'chip.safe': 'safe',
  'chip.risky': 'risky',
  'chip.dangerous': 'dangerous',
}