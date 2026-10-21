// Worker timers escape Chrome's intensive throttling of background tabs (main-thread timers drop to ~1/min after 5 min).
const timers = new Map<number, ReturnType<typeof setInterval>>()
self.onmessage = (e: MessageEvent<{ id: number; ms?: number }>) => {
  const { id, ms } = e.data
  clearInterval(timers.get(id))
  timers.delete(id)
  if (ms) timers.set(id, setInterval(() => self.postMessage(id), ms))
}
