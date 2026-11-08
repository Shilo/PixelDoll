// Review-only transport guard. Mocked test responses do not reach these native transports.
const blocked = input => {
  try { const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); return /(^|\.)pixellab\.ai$/i.test(u.hostname); }
  catch { return false; }
};
const deny = () => { throw new Error('Counter-review forbids real PixelLab transport, including balance.'); };
const original = globalThis.fetch;
globalThis.fetch = function(input, ...rest) { if (blocked(input)) return Promise.reject(new Error('Counter-review forbids real PixelLab transport, including balance.')); return original.call(this, input, ...rest); };
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  for (const key of ['request', 'get']) {
    const fn = mod[key];
    mod[key] = function(input, ...rest) {
      const host = typeof input === 'object' && !(input instanceof URL) ? input.hostname ?? input.host : undefined;
      if (blocked(input) || (host && /(^|\.)pixellab\.ai(?::\d+)?$/i.test(host))) deny();
      return fn.call(this, input, ...rest);
    };
  }
}
