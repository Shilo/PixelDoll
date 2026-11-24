import {
  mocapRender,
  authoredRender,
  describedMotion,
  type Action,
} from "./arms.mts";
const strip = (b: any) =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]: any) => [
      k,
      typeof v === "object" && v?.base64
        ? `<png ${v.base64.length}>`
        : Array.isArray(v)
          ? `[${v.length}]`
          : v,
    ]),
  );
for (const action of ["walk", "run", "attack", "hurt", "death"] as Action[])
  for (const dir of ["south", "east"] as const) {
    const m = await mocapRender("c27man", action, dir, 7, true),
      m0 = await mocapRender("c27man", action, dir, 7, false);
    const a = await authoredRender("c27man", action, dir, 7),
      p = describedMotion("c27man", action, dir, 7);
    console.log(
      action,
      dir,
      "M",
      m.frames,
      m.estimate,
      "pad",
      m.padding,
      "| M0 depth?",
      m0.req.body.keypoints[0].some((k: any) => "depth" in k),
      "| A",
      a?.frames,
      a?.estimate,
      "| P",
      p.req.path,
      JSON.stringify(strip(p.req.body)).slice(0, 400),
    );
    if (action === "attack" && dir === "east")
      console.log("  render body:", JSON.stringify(strip(m.req.body)));
  }
