// Render the existing vector identity; keep all icon sizes reproducible.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const sharp = require("sharp");
const svg = await readFile(resolve(root, "apps/web/public/icon.svg"));
const out = resolve(root, "apps/web/public/icons");
await mkdir(out, { recursive: true });
for (const size of [192, 512])
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(out, `icon-${size}.png`));
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: "#076849" })
  .png()
  .toFile(resolve(out, "apple-touch-icon.png"));
// Preserve a full opaque background and put the existing mark inside the mask safe zone.
const inset = await sharp(svg).resize(320, 320).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#076849" } })
  .composite([{ input: inset, gravity: "centre" }])
  .png()
  .toFile(resolve(out, "icon-maskable-512.png"));
console.log("Prepared app icons from the existing SVG.");
