// OWNER: t1a (wave 1).
//
// Renders every committed brand asset from the mark's single geometry source
// (src/components/brand/geometry.ts), so the tab icon, the touch icon and the
// bot avatar can never disagree with <Mark>. Outputs are committed; nothing
// runs at build time. Re-run after changing geometry.ts or palette.ts:
//
//   bash scripts/slot.sh browser npx tsx scripts/brand/build-assets.mts [--check <dir>]
//
// (Playwright's Chromium rasterises the two anti-aliased PNGs, so it takes a
// browser slot, plan A12.) tests/unit/chrome/assets.test.ts rebuilds the
// browser-free outputs and fails if the committed files are stale.
//
//   app/icon.svg                            ≤19px form, --signal on transparent,
//                                           prefers-color-scheme: light → --ink-0 (brand-gaps §C)
//   app/favicon.ico                         16 + 32, --signal on --ink-0, never transparent;
//                                           exact whole-pixel RGBA frames (scripts/brand/png.ts)
//   app/apple-icon.png                      180, solid --ink-0, no radius; the avatar
//                                           composition (iOS masks it, so no ticks, no seam)
//   public/brand/icon-mask.svg              Safari pinned tab: one path, solid black
//   public/brand/prguard-app-avatar-512.png GitHub App avatar: mark only, bars at 56% width,
//                                           solid --ink-0, legible at 20px
//   public/brand/prguard-mark.svg           the full mark (Lockup D) for docs and the README
//
// --check <dir> also writes verification renders (not committed): the avatar
// downscaled to 20px on GitHub's light and dark canvases at 1x and 2x, and
// both favicon frames, each enlarged with nearest-neighbour sampling. It also
// renders the avatar with the spec's literal "3px stroke on the base bar"
// (3px of 512) at 20px — the evidence for brand-gaps §C's own fallback: that
// stroke is 0.12px at 20px, the hollow/solid distinction dies, so the shipped
// avatar thickens it to 2px-at-20px (51.2px of 512; ./geometry.ts, circle crop).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { markGeometry, scaleGeometry } from '../../src/components/brand/geometry';
import { BRAND_HEX } from '../../src/components/brand/palette';
import { docMarkSvg, faviconIco, faviconPng, iconSvg, maskSvg, solidMarkSvg, TAB_GEOMETRY } from './assets';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const out = (...p: string[]) => path.join(WEB, ...p);

/**
 * Rasterise `markup` (an SVG drawn at `size` CSS px) at 1x: exactly size × size
 * device pixels, opaque RGB. Used where the geometry has radii and needs
 * Chromium's anti-aliasing (the touch icon, the avatar).
 */
async function png(page: Page, markup: string, size: number): Promise<Uint8Array> {
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${BRAND_HEX.ink0}}body>*{display:block}</style></head><body>${markup}</body></html>`,
  );
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
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

  const browser = await chromium.launch();
  const written: [string, number][] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const apple = await png(page, solidMarkSvg(markGeometry(180, { crop: 'circle' })), 180);
    const avatar = await png(page, solidMarkSvg(markGeometry(512, { crop: 'circle' })), 512);

    const files: [string, string | Uint8Array][] = [
      ['app/icon.svg', iconSvg()],
      ['app/favicon.ico', faviconIco()],
      ['app/apple-icon.png', apple],
      ['public/brand/icon-mask.svg', maskSvg()],
      ['public/brand/prguard-app-avatar-512.png', avatar],
      ['public/brand/prguard-mark.svg', docMarkSvg()],
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
      }
      await writeFile(path.join(checkDir, 'favicon-16-x8.png'), await inspect(browser, faviconPng(TAB_GEOMETRY), 16, BRAND_HEX.ink0, 1, false));
      await writeFile(path.join(checkDir, 'favicon-32-x8.png'), await inspect(browser, faviconPng(scaleGeometry(TAB_GEOMETRY, 2)), 32, BRAND_HEX.ink0, 1, false));
      // The literal reading, for comparison only: a 3px base stroke at 512.
      const literal = markGeometry(512, { crop: 'circle' });
      literal.base = { ...literal.base, stroke: 3 };
      const literalPng = await png(page, solidMarkSvg(literal), 512);
      for (const theme of ['light', 'dark'] as const) {
        const canvas = theme === 'light' ? '#FFFFFF' : '#0D1117';
        await writeFile(path.join(checkDir, `avatar-literal-3px-20px-${theme}@1x.png`), await inspect(browser, literalPng, 20, canvas, 1, true));
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
