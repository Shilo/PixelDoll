import { afterEach, expect, test, vi } from 'vitest'
import { get } from 'svelte/store'
import { api, ApiError, paidRequestRejected } from '../../src/lib/pixellab/client.ts'
import { apiActivity } from '../../src/lib/pixellab/activity.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('clear refusals remain distinguishable from uncertain or accepted paid outcomes',()=>{
  for(const status of [401,402,429]){
    expect(paidRequestRejected('/inpaint-v3',status,{detail:'refused'})).toBe(true);
    expect(paidRequestRejected('/inpaint-v3',status,undefined,false)).toBe(false);
    expect(paidRequestRejected('/inpaint-v3',status,{last_response:{background_job_ids:['accepted']}})).toBe(false);
  }
  expect(paidRequestRejected('/characters/animations',500,{detail:'Failed to start any animation jobs.'})).toBe(true);
  expect(paidRequestRejected('/inpaint-v3',500,{detail:'Failed to start any animation jobs.'})).toBe(false);
  expect(paidRequestRejected('/characters/animations',500,{detail:'Failed to start any animation jobs.',background_job_id:'accepted'})).toBe(false);
});

test.each([429, 503, 200])('REVIEW unread POST body after HTTP %i header: activity cost must stay unknown, not Free', async status => {
  const response = new Response('{}', { status })
  vi.spyOn(response, 'text').mockRejectedValue(new TypeError('synthetic body cut'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const error = await api<never>('synthetic-test-key', 'POST', '/inpaint-v3', { marker: `review-${status}` }).catch((e:ApiError) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(0)
  const call = get(apiActivity).find(c => JSON.stringify(c.body).includes(`review-${status}`))!
  console.log(status, JSON.stringify({ costSource: call.costSource, cost: call.cost, state: call.state, httpStatus: call.status }))
  expect(call.costSource).not.toBe('free')
})

test.each([423, 503, 529])('REVIEW fully read POST HTTP %i: queue treats as possibly charged; activity labels it', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"busy"}', { status })))
  const error = await api<never>('synthetic-test-key', 'POST', '/inpaint-v3', { marker: `full-${status}` }).catch((e:ApiError) => e)
  const call = get(apiActivity).find(c => JSON.stringify(c.body).includes(`full-${status}`))!
  console.log('full', status, error.kind, JSON.stringify({ costSource: call.costSource, cost: call.cost }))
  expect(call.costSource).not.toBe('free')
})

import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { accountBalance } from './account-fixture.ts'
test('REVIEW a non-ApiError raised after HTTP invocation is classified failed, not unknown', async () => {
  const records = new Map<string, JobRec>()
  let posts = 0
  const q = new Queue({ locks: null, online: () => true, now: () => 1000,
    put: async (id, r) => { records.set(id, structuredClone(r)) }, get: async id => records.get(id), all: async () => [...records.values()],
    api: async <T>(_k: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T
      posts++ // the provider accepted the job; local post-response bookkeeping then throws
      throw new Error('synthetic post-response bookkeeping failure')
    } })
  q.setKey('synthetic')
  const rec = await q.enqueue({ method: 'POST', path: '/inpaint-v3', body: { seed: 3 } }, { tag: 'm3', playerRequested: true })
  await q.tick()
  console.log('posts', posts, 'state', rec.state, 'requestStarted', rec.requestStarted, 'error', rec.error)
  expect(rec.state).toBe('lost')
})
test('REVIEW HTTP 402 carrying an accepted job id is labeled Free while the queue says it may have been charged', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"low credits","background_job_id":"accepted-1"}', { status: 402 })))
  await api('synthetic-test-key', 'POST', '/inpaint-v3', { marker: 'evidence-402' }).catch(e => e)
  const call = get(apiActivity).find(c => JSON.stringify(c.body).includes('evidence-402'))!
  console.log('402+job', JSON.stringify({ costSource: call.costSource, usagePending: call.usagePending }))
  expect(call.costSource).not.toBe('free')
})
