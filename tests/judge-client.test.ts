import { describe, expect, it } from 'vitest'
import { createHttpModelJudge, judgeChatCompletions } from '../src/judge-client.ts'

function fakeFetch(body: string, ok = true): typeof fetch {
  return (async () => ({ ok, text: async () => body }) as unknown as Response) as typeof fetch
}

const CONFIG = { baseURL: 'http://judge.local/v1', model: 'judge-mini' }

describe('judgeChatCompletions', () => {
  it('extracts the assistant text from a chat/completions envelope', async () => {
    const body = JSON.stringify({ choices: [{ message: { content: '{"danger":"risky","necessary":true,"reason":"writes"}' } }] })
    const text = await judgeChatCompletions({ command: 'rm -rf out' }, CONFIG, fakeFetch(body))
    expect(text).toContain('"danger":"risky"')
  })

  it('falls back to a bare verdict reply', async () => {
    const body = '{"danger":"safe","necessary":false,"reason":"no-op"}'
    const text = await judgeChatCompletions({ command: 'echo hi' }, CONFIG, fakeFetch(body))
    expect(text).toBe(body)
  })

  it('returns undefined on a non-OK response', async () => {
    await expect(judgeChatCompletions({ command: 'ls' }, CONFIG, fakeFetch('', false))).resolves.toBeUndefined()
  })

  it('returns undefined when the endpoint is disabled', async () => {
    await expect(judgeChatCompletions({ command: 'ls' }, { baseURL: '', model: '' }, fakeFetch('x'))).resolves.toBeUndefined()
  })
})

describe('createHttpModelJudge', () => {
  it('parses the endpoint reply into a model verdict', async () => {
    const judge = createHttpModelJudge(CONFIG, fakeFetch('{"danger":"safe","necessary":true,"reason":"read-only"}'))
    const verdict = await judge({ command: 'ls -la' })
    expect(verdict).toMatchObject({ danger: 'safe', necessary: true, source: 'model' })
  })

  it('resolves undefined on a transport failure', async () => {
    const failing = (async () => { throw new Error('boom') }) as unknown as typeof fetch
    const judge = createHttpModelJudge(CONFIG, failing)
    await expect(judge({ command: 'ls' })).resolves.toBeUndefined()
  })
})