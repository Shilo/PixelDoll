import { expect, test } from 'vitest'
import { resolveAgentKey } from '../../agent-key.ts'

test('the explicit Windows environment reference resolves server-side', () => {
  const source = 'PIXELLAB_API_KEY_AGENT_DEV=PIXELLAB_SECRET\r\n'
  expect(resolveAgentKey(source, { PIXELLAB_SECRET: ' synthetic-key ' })).toBe('synthetic-key')
  for (const env of [{}, { PIXELLAB_SECRET: '' }, { PIXELLAB_SECRET: '  ' }]) {
    expect(resolveAgentKey(source, env)).toBe('')
  }
})

test('literal agent keys still work and missing entries never use the environment secret', () => {
  const env = { PIXELLAB_SECRET: 'synthetic-env-key' }
  expect(resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV= synthetic-literal \r\n', env)).toBe('synthetic-literal')
  for (const source of ['', 'OTHER=PIXELLAB_SECRET', 'PIXELLAB_API_KEY_AGENT_DEV=']) {
    expect(resolveAgentKey(source, env)).toBe('')
  }
})
