/** Public artwork must keep its build identity when another tab activates a newer worker. */
export function assetUrl(path: string): string {
  const base = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
  const url = new URL(`${import.meta.env.BASE_URL}${path}`, base)
  if (import.meta.env.PROD) url.searchParams.set('pd-build', __APP_BUILD__)
  return url.href
}
