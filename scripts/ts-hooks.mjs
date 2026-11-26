// Node resolve hook for scripts that import the site's TypeScript modules (e.g. the
// infographic uses src/lib/data/normalize.ts, the same public-dataset code as the site):
// adds the ".ts" extension Node needs and maps the "@/" alias to src/.
const SRC = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : specifier;
    if (!base.startsWith('.') && !base.startsWith('file:')) throw err;
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(base + ext, context);
      } catch {
        /* try the next candidate */
      }
    }
    throw err;
  }
}
