import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routes, png } from "../../../app/src/lib/pixellab/routes.ts";

const cache = path.join(os.tmpdir(), "pixeldoll-free-tier-2026-11-17");
fs.mkdirSync(cache, { recursive: true });
const ledgerPath = path.join(cache, "ledger.json");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(cache, name), "utf8"));
const write = (name, value) =>
  fs.writeFileSync(path.join(cache, name), JSON.stringify(value, null, 2));
const ledger = fs.existsSync(ledgerPath) ? read("ledger.json") : { calls: [] };
const key = process.env.PIXELLAB_SECRET_FREE_TIER;
const api = async (endpoint, method = "GET", body) => {
  assert(key, "Free-tier key is unavailable");
  const response = await fetch(`https://api.pixellab.ai/v2${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  return { http: response.status, body: await response.json() };
};
const persist = () => write("ledger.json", ledger);
const balance = async () => {
  const response = await api("/balance");
  assert.equal(response.http, 200);
  assert.equal(response.body.subscription.status, "trial");
  assert.equal(response.body.credits.usd, 0);
  return response.body.subscription.generations;
};
async function once(name, request, maximumCost, transport = api) {
  let receipt = ledger.calls.find((call) => call.name === name);
  if (!receipt) {
    const current = await balance();
    ledger.initialBalance ??= current;
    assert(
      ledger.initialBalance - current + maximumCost <= 10,
      "Campaign budget would exceed 10 generations",
    );
    receipt = {
      name,
      endpoint: request.path,
      maximumCost,
      before: current,
      submittedAt: new Date().toISOString(),
    };
    ledger.calls.push(receipt);
    persist();
    const response = await transport(request.path, "POST", request.body);
    receipt.http = response.http;
    receipt.jobId = response.body.background_job_id;
    receipt.submissionError = response.http >= 400 ? response.body : undefined;
    persist();
    assert(
      receipt.jobId,
      "Submission has no job ID. Stop; never resubmit this attempt",
    );
  }
  assert(
    receipt.jobId,
    "Previous submission outcome is ambiguous. Stop; never resubmit",
  );
  for (let poll = 0; poll < 120; poll++) {
    const response = await transport(
      `/background-jobs/${encodeURIComponent(receipt.jobId)}`,
    );
    assert.equal(response.http, 200);
    const job = response.body;
    if (["completed", "failed", "canceled", "cancelled"].includes(job.status)) {
      write(`${name}-terminal.json`, job);
      Object.assign(receipt, {
        status: job.status,
        error: job.last_response?.error,
        code: job.last_response?.code,
        usage: job.usage ?? job.last_response?.usage ?? null,
        after: await balance(),
        finishedAt: new Date().toISOString(),
      });
      persist();
      console.log(JSON.stringify(receipt));
      return job;
    }
    if (poll % 6 === 0)
      console.log(JSON.stringify({ name, status: job.status, poll }));
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error("Polling limit reached. Keep the job ID; never resubmit");
}

const action = process.argv[2];
if (action === "--smoke") {
  const source = fs.readFileSync(path.join(cache, "source.png"));
  assert.equal(source.readUInt32BE(16), 64);
  assert.equal(source.readUInt32BE(20), 64);
  const req = routes.editAnimationV2({
    description: "Add a simple red cloth hat, preserve the body and pose",
    frames: Array.from({ length: 2 }, () => ({
      image: png(source.toString("base64")),
      size: { width: 64, height: 64 },
    })),
    image_size: { width: 64, height: 64 },
    no_background: true,
    seed: 171117,
  });
  const schemaPath = new URL(
    "../pixellab/pixellab-openapi-v2.json",
    import.meta.url,
  );
  const schema = JSON.parse(fs.readFileSync(schemaPath));
  for (const required of schema.components.schemas.EditAnimationV2Request
    .required)
    assert(required in req.body);
  assert(req.body.frames.length >= 2 && req.body.frames.length <= 16);
  write("edit-request.json", req);
  assert.equal(
    routes.createCharacterV3({
      description: "plain paperdoll character",
      image_size: { width: 48, height: 48 },
    }).path,
    "/create-character-v3",
  );
  console.log(
    JSON.stringify({
      smoke: "passed",
      sourceSize: "64x64",
      duplicateStandingFrames: req.body.frames.length,
      sends: 0,
    }),
  );
} else if (action === "edit") {
  await once("edit", read("edit-request.json"), 10);
} else if (action === "create") {
  await once(
    "create",
    routes.createCharacterV3({
      description:
        "plain bald pixel art paperdoll base character, gray shirt and shorts, barefoot, empty hands, neutral standing pose",
      image_size: { width: 48, height: 48 },
      n_directions: 8,
      no_background: true,
      view: "low top-down",
      seed: 171117,
    }),
    5,
  );
} else if (action === "skeleton") {
  const terminal = read("create-terminal.json");
  assert.equal(terminal.status, "completed");
  const id = terminal.last_response?.character_id;
  assert(id, "Creation response has no character ID");
  const { body: character, http } = await api(
    `/characters/${encodeURIComponent(id)}`,
  );
  assert.equal(http, 200);
  const raw = character.skeletons?.["2d_references"]?.south?.keypoints;
  assert(
    raw,
    `Standing skeleton unavailable. Containers: ${Object.keys(character.skeletons ?? {}).join(",")}`,
  );
  const rest = Object.entries(raw).map(([label, point]) => ({
    label,
    x: point.x,
    y: point.y,
  }));
  assert.equal(rest.length, 18);
  assert(
    rest.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  );
  const imageResponse = await fetch(character.rotation_urls.south);
  assert(imageResponse.ok);
  const source = Buffer.from(await imageResponse.arrayBuffer());
  fs.writeFileSync(path.join(cache, "created-south.png"), source);
  const poses = [0, -0.008, 0].map((shift) =>
    rest.map((point) => ({ ...point, y: point.y + shift })),
  );
  const job = await once(
    "skeleton",
    routes.animateWithSkeletonV3({
      description: character.prompt,
      action: "idle, standing still, empty hands",
      direction: "south",
      view: "low top-down",
      first_frame: png(source.toString("base64")),
      first_frame_keypoints: rest,
      keypoints: poses,
      seed: 171117,
      no_background: true,
    }),
    3,
  );
  for (const [index, image] of (job.last_response?.images ?? []).entries()) {
    if (image.type !== "rgba_bytes")
      fs.writeFileSync(
        path.join(cache, `skeleton-${index}.png`),
        Buffer.from(
          image.base64.replace(/^data:image\/\w+;base64,/, ""),
          "base64",
        ),
      );
  }
  console.log(
    JSON.stringify({
      frameCount: job.last_response?.images?.length ?? 0,
      cache,
    }),
  );
} else if (action === "report") {
  ledger.finalBalance = await balance();
  ledger.observedBalanceChange = ledger.initialBalance - ledger.finalBalance;
  persist();
  fs.writeFileSync(
    fileURLToPath(new URL("live-results.json", import.meta.url)),
    JSON.stringify(ledger, null, 2) + "\n",
  );
  console.log(JSON.stringify(ledger));
} else {
  throw new Error(
    "Use --smoke, edit, create, skeleton or report. Every live submission is one-shot.",
  );
}
