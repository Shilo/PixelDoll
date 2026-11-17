import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { runCase } from "../../../app/scripts/bench.ts";
import { encodePngBytes } from "../../../app/src/lib/image/pngraw.ts";

const output = new URL("./temp.local/", import.meta.url);
mkdirSync(output, { recursive: true });
const cases = JSON.parse(
  readFileSync(
    new URL("../../../app/test/fixtures/bench/cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = [
  "a-cape",
  "a-boots",
  "a-sword96",
  "b-tunic",
  "b-cloak",
  "n-cloak128",
];
const index = [];
for (const id of selected) {
  const fixture = cases.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing fixture: ${id}`);
  const result = await runCase(fixture);
  for (const cell of result.cells) {
    const filename = `${id}-${cell.key.replaceAll("/", "-")}.png`;
    writeFileSync(new URL(filename, output), await encodePngBytes(cell.layer));
    index.push({
      id,
      body: fixture.body,
      pad: fixture.pad,
      key: cell.key,
      filename,
    });
  }
}
writeFileSync(
  new URL("layers.json", output),
  JSON.stringify(index, null, 2) + "\n",
);
console.log(
  `Extracted ${index.length} stored item cells with the existing benchmark pipeline.`,
);
