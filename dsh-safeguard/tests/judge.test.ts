import { describe, expect, it } from 'vitest'
import { buildJudgePrompt, createModelJudge, parseJudgeReply } from '../src/judge.ts'

describe('parseJudgeReply', () => {
  it('parses strict JSON', () => {
    const verdict = parseJudgeReply('{"danger":"risky","necessary":true,"reason":"writes files"}')
    expect(verdict).toMatchObject({ danger: 'risky', necessary: true, reason: 'writes files' })
  })

  it('tolerates a fenced JSON block', () => {
    const verdict = parseJudgeReply('```json\n{"danger":"safe","necessary":false,"reason":"no-op"}\n```')
    expect(verdict).toMatchObject({ danger: 'safe', necessary: false })
  })

  it('rejects malformed output', () => {
    expect(parseJudgeReply('not json')).toBeUndefined()
    expect(parseJudgeReply('{"danger":"extreme","necessary":true,"reason":"x"}')).toBeUndefined()
    expect(parseJudgeReply('{"danger":"safe","necessary":"yes","reason":"x"}')).toBeUndefined()
  })
})

describe('buildJudgePrompt', () => {
  it('embeds the command, cwd and permission', () => {
    const prompt = buildJudgePrompt({ command: 'rm -rf out', cwd: '/repo', permission: 'workspace-write' })
    expect(prompt).toContain('rm -rf out')
    expect(prompt).toContain('/repo')
    expect(prompt).toContain('workspace-write')
  })
})

describe('createModelJudge', () => {
  it('runs the completion through parseJudgeReply', async () => {
    const judge = createModelJudge(async () => '{"danger":"safe","necessary":true,"reason":"read-only"}')
    const verdict = await judge({ command: 'ls' })
    expect(verdict).toMatchObject({ danger: 'safe', necessary: true, source: 'model' })
    expect(verdict?.source).toBe('model')
  })

  it('returns undefined on a completion failure', async () => {
    const judge = createModelJudge(async () => { throw new Error('boom') })
    await expect(judge({ command: 'ls' })).resolves.toBeUndefined()
  })
})