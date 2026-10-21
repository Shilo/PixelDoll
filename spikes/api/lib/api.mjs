// Minimal PixelLab REST v2 client. Browser-portable except the optional disk logger (pass `log` = null in browser).
// ponytail: plain fetch + polling loop; no retries beyond 429 backoff — add when we see flaky 5xx.
const BASE = 'https://api.pixellab.ai/v2';

export function client({ key, log = null, base = BASE }) {
  if (!key) throw new Error('missing API key');
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  async function req(method, path, body) {
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
      if ((r.status === 429 || r.status === 529) && attempt < 6) {
        const wait = Number(r.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1);
        log?.event({ path, status: r.status, retry_in_ms: wait, body: json });
        await sleep(wait); continue;
      }
      const ms = Date.now() - t0;
      log?.call({ method, path, status: r.status, ms, request: body, response: json });
      if (!r.ok) { const e = new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(json).slice(0, 800)}`); e.status = r.status; e.body = json; throw e; }
      return json;
    }
  }

  // Poll a background job until done; returns { job, ms, polls }.
  async function waitJob(id, { timeoutMs = 15 * 60e3, intervalMs = 3000 } = {}) {
    const t0 = Date.now(); let polls = 0;
    while (true) {
      await sleep(polls < 3 ? intervalMs : Math.min(intervalMs * 2, 8000));
      polls++;
      let job;
      try { job = await req('GET', `/background-jobs/${id}`); }
      catch (e) { if ((e.status === 404 || e.status === 423) && Date.now() - t0 < timeoutMs) continue; throw e; }
      if (job.status === 'completed') return { job, ms: Date.now() - t0, polls };
      if (job.status === 'failed') { const e = new Error(`job ${id} failed: ${JSON.stringify(job.last_response).slice(0, 800)}`); e.job = job; throw e; }
      if (Date.now() - t0 > timeoutMs) throw new Error(`job ${id} timed out (last status ${job.status})`);
    }
  }

  // POST then wait if it returned a job. Returns { res, job, submitMs, totalMs }.
  async function run(path, body, opts) {
    const t0 = Date.now();
    const res = await req('POST', path, body);
    const submitMs = Date.now() - t0;
    const ids = res.background_job_ids || (res.background_job_id ? [res.background_job_id] : []);
    const jobs = await Promise.all(ids.map(id => waitJob(id, opts)));
    return { res, jobs: jobs.map(j => j.job), submitMs, totalMs: Date.now() - t0 };
  }

  return { req, waitJob, run, get: p => req('GET', p), post: (p, b) => req('POST', p, b), balance: () => req('GET', '/balance') };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pull every image out of a job/response payload: base64 objects {base64} or URL strings. Returns [{path, b64?|url?}].
export function findImages(obj, path = '$', out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\/.+\.(png|gif|webp)(\?|$)/i.test(obj)) out.push({ path, url: obj });
    else if (obj.length > 200 && /^iVBOR/.test(obj)) out.push({ path, b64: obj });
    return out;
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => findImages(v, `${path}[${i}]`, out)); return out; }
  if (typeof obj === 'object') {
    if (typeof obj.base64 === 'string') { out.push({ path, b64: obj.base64, type: obj.type }); return out; }
    for (const [k, v] of Object.entries(obj)) findImages(v, `${path}.${k}`, out);
  }
  return out;
}

export async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export const b64img = b64 => ({ type: 'base64', base64: b64, format: 'png' });
