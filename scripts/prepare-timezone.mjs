import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const source = resolve(import.meta.dirname, "../apps/web/node_modules/tzf-wasm");
const target = resolve(import.meta.dirname, "../apps/web/public/timezone");
await mkdir(target, { recursive: true });
await copyFile(resolve(source, "tzf_wasm.js"), resolve(target, "tzf.js"));
await copyFile(resolve(source, "tzf_wasm_bg.wasm"), resolve(target, "tzf_wasm_bg.wasm"));
await copyFile(resolve(source, "LICENSE"), resolve(target, "LICENSE.txt"));
await writeFile(
  resolve(target, "NOTICE.txt"),
  `Timezone lookup: tzf-wasm 1.2.4 (MIT)\nhttps://github.com/ringsaturn/tzf-wasm\n\nGeographic timezone boundary data: OpenStreetMap contributors, via timezone-boundary-builder and tzf-rel. ODbL 1.0.\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\nhttps://github.com/evansiroky/timezone-boundary-builder\nhttps://github.com/ringsaturn/tzf-rel\n\nThe simplified boundary data can differ from full boundaries by about 111 metres.\n`,
);
console.log("Prepared offline timezone boundary lookup.");
