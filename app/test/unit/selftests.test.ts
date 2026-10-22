import { expect, test, vi } from 'vitest'
import { selfTestsFor } from '../../src/lib/selftests.ts'
import { selfTest as agentKeyTest } from '../../agent-key.ts'

// Existing self-tests use console.assert in both Node and the dev-only browser harness.
// Scope the interception to one awaited case; every false assertion becomes a Vitest failure.
async function runSelfTest(check: () => unknown): Promise<void> {
  const assertion = vi.spyOn(console, 'assert').mockImplementation((condition, ...messages: unknown[]) => {
    expect(condition, messages.map(String).join(' ') || 'self-test assertion').toBeTruthy()
  })
  try {
    await check()
    expect(assertion, 'self-test must execute its assertions').toHaveBeenCalled()
  } finally {
    assertion.mockRestore()
  }
}

for (const [name, check] of [...selfTestsFor('node'), ['agent-key', agentKeyTest] as const]) {
  test.sequential(name, () => runSelfTest(check))
}

test.sequential('adapter rejects a false assertion and restores console.assert', async () => {
  const original = console.assert
  await expect(runSelfTest(() => console.assert(false, 'injected sync failure'))).rejects.toThrow('injected sync failure')
  expect(console.assert).toBe(original)
})

test.sequential('adapter awaits asynchronous assertions', async () => {
  const original = console.assert
  await expect(runSelfTest(async () => {
    await Promise.resolve()
    console.assert(false, 'injected async failure')
  })).rejects.toThrow('injected async failure')
  expect(console.assert).toBe(original)
})

test.sequential('adapter restores console.assert when the self-test throws', async () => {
  const original = console.assert
  await expect(runSelfTest(() => { throw new Error('injected exception') })).rejects.toThrow('injected exception')
  expect(console.assert).toBe(original)
})
