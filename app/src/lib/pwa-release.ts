export interface Release { build: string; version: string; commit: string }

export function readRelease(value: unknown): Release {
  const r = value as Partial<Release> | null
  if (!r || typeof r.build !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(r.build)
    || typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)
    || typeof r.commit !== 'string' || !/^[a-f0-9]{7,40}$/.test(r.commit)) throw new Error('The update description is invalid.')
  return { build: r.build, version: r.version, commit: r.commit }
}

export function workerMessage(worker: ServiceWorker, type: string, build?: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const done = (error?: Error, value?: Record<string, unknown>) => {
      clearTimeout(timer); channel.port1.close()
      if (error) reject(error); else resolve(value!)
    }
    const timer = setTimeout(() => done(new Error('The update did not respond. Try again.')), 15_000)
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!data || typeof data !== 'object') return done(new Error('The update response is invalid.'))
      const reply = data as Record<string, unknown>
      done(typeof reply.error === 'string' ? new Error(reply.error) : undefined, reply)
    }
    try { worker.postMessage({ type, build, clientBuild: __APP_BUILD__ }, [channel.port2]) } catch (e) { done(e as Error) }
  })
}

export function bounded<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 15_000) })])
    .finally(() => clearTimeout(timer))
}

export async function fetchRelease(base: URL): Promise<Release> {
  const discovery = new URL('release.json', base)
  discovery.searchParams.set('check', String(Date.now()))
  const response = await fetch(discovery, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Update check failed (${response.status}).`)
  return readRelease(await response.json())
}

export function waitForWorker(worker: ServiceWorker, ready: () => boolean, timeout: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', changed)
      if (error) reject(error); else resolve()
    }
    const changed = () => {
      if (worker.state === 'redundant') finish(new Error('The update was replaced or could not be downloaded. Try again.'))
      else if (ready()) finish()
    }
    const timer = setTimeout(() => finish(new Error(timeout)), 15_000)
    worker.addEventListener('statechange', changed)
    changed()
  })
}
