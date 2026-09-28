// OWNER: t1a (wave 1).
//
// The site-wide OG card (brand-gaps §C): 1200 × 630 PNG, generated at build
// time. Composition and the Satori rules: app/og/card.tsx. The story (SHAs and
// pytest results) is read from the fixture corpus: app/og/data.ts. The alt text
// lives in opengraph-image.alt.txt, the one place to edit it; twitter-image.tsx
// reuses all of this.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { loadOgFonts, OgCard, OG_SIZE } from './og/card';
import { loadOgStory } from './og/data';

export const alt = readFileSync(path.join(process.cwd(), 'app', 'opengraph-image.alt.txt'), 'utf8').trim();
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(<OgCard story={loadOgStory()} />, { ...OG_SIZE, fonts: await loadOgFonts() });
}
