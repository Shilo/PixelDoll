// Resolves the agent key the way the dev server does (a whole-value ${NAME} reference) before c25/lib.mts reads it.
// The key is never printed.
const value = process.env.PIXELLAB_API_KEY_AGENT_DEV;
const ref = value?.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
if (ref) {
  const target = process.env[ref[1]];
  if (!target?.trim())
    throw new Error(
      `PIXELLAB_API_KEY_AGENT_DEV references ${ref[1]}, which is not set.`,
    );
  process.env.PIXELLAB_API_KEY_AGENT_DEV = target;
}
process.env.C25_RUN ??= "mocap-salvage-2026-11-23";
process.env.C25_CAP ??= "1000";
