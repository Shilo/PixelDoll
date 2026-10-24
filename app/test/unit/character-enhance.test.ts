import { beforeEach, expect, test, vi } from 'vitest'
const { api } = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../../src/lib/pixellab/client.ts', () => ({ api }))
import { enhanceCharacter } from '../../src/studio/enhanceCharacter.ts'
const input = { description: 'freckled elf', image_size: { width: 96, height: 96 }, view: 'side' as const }
beforeEach(() => { api.mockReset() })
test('uses the V3 endpoint with exact size, view and description, once', async () => {
  api.mockResolvedValue({ enhanced_prompt: 'A freckled elf with pointed ears' })
  expect(await enhanceCharacter('fixture-key', input, new AbortController().signal, 'enhance:fixture')).toBe('A freckled elf with pointed ears')
  expect(api).toHaveBeenCalledExactlyOnceWith('fixture-key', 'POST', '/enhance-character-v3-prompt', input, expect.any(AbortSignal), { activityScope: 'enhance:fixture', label: 'Enhance character prompt' })
})
test('never retries a rejected or ambiguous paid response and leaves recovery to the user', async () => {
  api.mockRejectedValue(new Error('timeout'))
  await expect(enhanceCharacter('fixture-key', input, new AbortController().signal, 'test')).rejects.toThrow('timeout')
  expect(api).toHaveBeenCalledTimes(1)
})
test.each([{}, { enhanced_prompt: '' }, { enhanced_prompt: 'a'.repeat(2001) }])('rejects malformed output %j', async response => {
  api.mockResolvedValue(response)
  await expect(enhanceCharacter('fixture-key', input, new AbortController().signal, 'test')).rejects.toThrow('Your text was kept')
})
test('rejects invalid inputs before submitting', async () => {
  await expect(enhanceCharacter('fixture-key', { ...input, description: '' }, new AbortController().signal, 'test')).rejects.toThrow('Enter a prompt')
  await expect(enhanceCharacter('fixture-key', { ...input, image_size: { width: 31, height: 31 } }, new AbortController().signal, 'test')).rejects.toThrow('valid body size')
  expect(api).not.toHaveBeenCalled()
})
