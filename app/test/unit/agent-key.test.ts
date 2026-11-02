import { expect, test } from 'vitest'
import { resolveAgentKey } from '../../agent-key.ts'

test.each(['PIXELLAB_SECRET', 'CUSTOM_TOKEN_2', 'lowercase_token'])('an explicit reference can use any valid environment name: %s', name => {
  const env = { [name]: ' synthetic-token ' };
  expect(resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV=${'+name+'}\r\n', env)).toBe('synthetic-token');
  expect(env[name]).toBe(' synthetic-token ');
});

test.each(['${CUSTOM_TOKEN}', '"${CUSTOM_TOKEN}"', "'${CUSTOM_TOKEN}'"])('Node dotenv parsing supports spacing, quotes and comments: %s', value => {
  expect(resolveAgentKey('export PIXELLAB_API_KEY_AGENT_DEV = '+value+' # agent only\n', { CUSTOM_TOKEN: 'synthetic-token' })).toBe('synthetic-token');
});

test.each([{}, { CUSTOM_TOKEN: '' }, { CUSTOM_TOKEN: '  ' }])('a missing or blank referenced variable fails without a literal fallback', env => {
  expect(() => resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV=${CUSTOM_TOKEN}', env)).toThrow('missing or blank');
});

test.each(['${}', '${1BAD}', '${BAD-NAME}', '${CUSTOM_TOKEN', '${CUSTOM_TOKEN}suffix', '${CUSTOM_TOKEN:-fallback}'])('malformed or unsupported references fail clearly: %s', value => {
  expect(() => resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV='+value, {})).toThrow('must use');
});

test.each(['synthetic-old-token', 'pixl_synthetic-new-token', 'PIXELLAB_SECRET', '$(untrusted-command)'])('literal token values do not trigger environment lookup: %s', token => {
  expect(resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV="'+token+'"', { PIXELLAB_SECRET: 'different-token' })).toBe(token);
});

test('missing entries never acquire a key, and references never load sibling dotenv values or inherited properties', () => {
  for(const source of ['', 'OTHER=${CUSTOM_TOKEN}', 'PIXELLAB_API_KEY_AGENT_DEV=']) expect(resolveAgentKey(source, { CUSTOM_TOKEN: 'synthetic-token' })).toBe('');
  expect(() => resolveAgentKey('CUSTOM_TOKEN=synthetic-token\nPIXELLAB_API_KEY_AGENT_DEV=${CUSTOM_TOKEN}', {})).toThrow('missing or blank');
  expect(() => resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV=${constructor}', {})).toThrow('missing or blank');
});

test.each(['0123456789abcdef0123456789abcdef', 'pixl_0123456789abcdef0123456789abcdef', 'CUSTOM_TOKEN', 'prefix${CUSTOM_TOKEN}'])('unquoted opaque literals are preserved, including a colliding environment name: %s', token => {
  expect(resolveAgentKey('PIXELLAB_API_KEY_AGENT_DEV='+token, { CUSTOM_TOKEN: 'different-synthetic-token' })).toBe(token);
});
