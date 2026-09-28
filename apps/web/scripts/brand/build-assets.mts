// Renders every committed brand asset from the mark's single geometry source
// (src/components/brand/geometry.ts), so the tab icon, the touch icon and the
// bot avatar can never disagree with <Mark>. Outputs are committed; nothing
// runs at build time. Re-run after changing geometry.ts or palette.ts:
//
//   bash scripts/slot.sh browser npx tsx scripts/brand/build-assets.mts [--check <dir>]
//
// Without Playwright's bundled Chromium, PW_CHANNEL=chrome uses the installed Google Chrome.
//
// Playwright's Chromium rasterises every PNG (the eye is curves and round caps,
// so it needs real anti-aliasing), which takes a browser slot, plan A12.
// tests/unit/chrome/assets.test.ts rebuilds the SVG outputs and fails if the
// committed files are stale, and checks the rasters' dimensions.
//
//   app/icon.svg                             the lime eye on a rounded --ink tile (holds in light and dark tab strips)
//   app/favicon.ico                          16 + 32, the same tile, transparent outside its corners
//   app/apple-icon.png                       180, full-bleed ink, eye at 66% (iOS applies its own mask)
//   public/brand/icon-mask.svg               Safari pinned tab: the eye alone, solid black
//   public/brand/witness-app-avatar-512.png  GitHub App avatar: full-bleed ink, eye at 58% so it clears
//                                            the circle crop, legible at 20px
//   public/brand/witness-mark.svg            the eye at 96 for docs and the README
//
// --check <dir> also writes verification renders (not committed): the avatar
// downscaled to 20px on GitHub's light and dark canvases at 1x and 2x, and
// both favicon frames, each enlarged with nearest-neighbour sampling.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { docMarkSvg, iconSvg, maskSvg, solidMarkSvg, tileSvg } from './assets';
import { encodeIco } from './ico';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const out = (...p: string[]) => path.join(WEB, ...p);

/**
 * Rasterise `markup` (an SVG drawn at `size` CSS px) at 1x: exactly size × size
 * device pixels, with alpha, so a rounded tile keeps transparent corners.
 */
async function png(page: Page, markup: string, size: number): Promise<Uint8Array> {
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}body>*{display:block}</style></head><body>${markup}</body></html>`,
  );
  const shot = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  return new Uint8Array(shot);
}

const dataUrl = (bytes: Uint8Array) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

/** Show `bytes` at `display` CSS px on `canvas`, screenshot at `dpr`, and enlarge that nearest-neighbour. */
async function inspect(browser: Browser, bytes: Uint8Array, display: number, canvas: string, dpr: number, clip: boolean): Promise<Buffer> {
  const pad = display / 2;
  const small = await browser.newPage({ viewport: { width: display + 2 * pad, height: display + 2 * pad }, deviceScaleFactor: dpr });
  await small.setContent(
    `<!doctype html><html><body style="margin:0;background:${canvas}"><img src="${dataUrl(bytes)}" width="${display}" height="${display}" style="display:block;margin:${pad}px;${clip ? 'clip-path:circle(50%)' : 'image-rendering:pixelated'}"></body></html>`,
  );
  await small.waitForLoadState('load');
  const shot = new Uint8Array(await small.screenshot({ type: 'png' }));
  await small.close();
  const size = 320;
  const big = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await big.setContent(`<!doctype html><html><body style="margin:0"><img src="${dataUrl(shot)}" style="display:block;width:${size}px;height:${size}px;image-rendering:pixelated"></body></html>`);
  await big.waitForLoadState('load');
  const enlarged = await big.screenshot({ type: 'png' });
  await big.close();
  return enlarged;
}

async function main() {
  const checkAt = process.argv.indexOf('--check');
  const checkDir = checkAt > -1 ? path.resolve(process.cwd(), process.argv[checkAt + 1] ?? '.') : null;

  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const written: [string, number][] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const tab16 = await png(page, tileSvg(16), 16);
    const tab32 = await png(page, tileSvg(32), 32);
    const apple = await png(page, solidMarkSvg(180, 'touch'), 180);
    const avatar = await png(page, solidMarkSvg(512, 'circle'), 512);

    const files: [string, string | Uint8Array][] = [
      ['app/icon.svg', iconSvg()],
      ['app/favicon.ico', encodeIco([tab16, tab32])],
      ['app/apple-icon.png', apple],
      ['public/brand/icon-mask.svg', maskSvg()],
      ['public/brand/witness-app-avatar-512.png', avatar],
      ['public/brand/witness-mark.svg', docMarkSvg()],
    ];
    for (const [rel, data] of files) {
      await mkdir(path.dirname(out(rel)), { recursive: true });
      await writeFile(out(rel), data);
      written.push([rel, typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength]);
    }

    if (checkDir) {
      await mkdir(checkDir, { recursive: true });
      // GitHub's canvases: light #FFFFFF, dark #0D1117. The avatar is circle-cropped at 20px.
      for (const [theme, canvas] of [['light', '#FFFFFF'], ['dark', '#0D1117']] as const) {
        for (const dpr of [1, 2]) {
          await writeFile(path.join(checkDir, `avatar-20px-${theme}@${dpr}x.png`), await inspect(browser, avatar, 20, canvas, dpr, true));
        }
        await writeFile(path.join(checkDir, `favicon-16-${theme}-x8.png`), await inspect(browser, tab16, 16, canvas, 1, false));
        await writeFile(path.join(checkDir, `favicon-32-${theme}-x8.png`), await inspect(browser, tab32, 32, canvas, 1, false));
      }
    }
  } finally {
    await browser.close();
  }
  for (const [rel, bytes] of written) console.log(`${rel.padEnd(42)} ${String(bytes).padStart(7)} B`);
  if (checkDir) console.log(`verification renders → ${checkDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
