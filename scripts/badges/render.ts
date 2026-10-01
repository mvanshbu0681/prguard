// Renders every PR Guard badge to a 2x PNG with the local Chrome, plus a preview page.
// Run with `npm run badges`. Output: assets/badges/img/*.png, img/manifest.json, preview.png.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { items, sheet } from "./html.ts";
import { previewHtml, type Manifest } from "./preview.ts";

const OUT = join(import.meta.dirname, "..", "..", "assets", "badges");
const IMG = join(OUT, "img");
/** The API reads badge sizes and alt text from here to write `<img>` tags. */
const API_MANIFEST = join(import.meta.dirname, "..", "..", "apps", "api", "src", "review", "badges.json");

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await rm(IMG, { recursive: true, force: true });
await mkdir(IMG, { recursive: true });

const list = items();
await page.setContent(sheet(list), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

const manifest: Manifest = {};
for (const item of list) {
  const slot = page.locator(`[data-name="${item.name}"] > *`);
  const box = await slot.boundingBox();
  if (!box) throw new Error(`Badge ${item.name} did not render`);
  await slot.screenshot({ path: join(IMG, `${item.name}.png`), omitBackground: true });
  manifest[item.name] = { width: Math.round(box.width), height: Math.round(box.height), alt: item.alt };
}
await writeFile(join(IMG, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(API_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const previewFile = join(OUT, "preview.html");
await writeFile(previewFile, previewHtml(manifest));
await page.goto(pathToFileURL(previewFile).href, { waitUntil: "load" });
await page.screenshot({ path: join(OUT, "preview.png"), fullPage: true });
await rm(previewFile);
console.log(`${list.length} badges`);

await browser.close();
