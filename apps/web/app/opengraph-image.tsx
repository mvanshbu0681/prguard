// OWNER: t1a (wave 1).
//
// The site-wide OG card (brand-gaps §C): 1200 × 630 PNG, generated at build
// time. Composition and the Satori rules: app/og/card.tsx. The story (a real
// sandbox review) is read from the sandbox snapshot: app/og/data.ts. The alt
// text is written from the same story, so it says what the card shows;
// twitter-image.tsx reuses all of this.
import { ImageResponse } from 'next/og';
import { loadOgFonts, OgCard, OG_SIZE } from './og/card';
import { loadOgStory } from './og/data';

const story = loadOgStory();
export const alt = `PR Guard. We check before we comment. A real review from the public sandbox, ${story.pullRequest}: ${story.verdict}, ${story.findings} findings (${story.severities.replace(/ · /g, ', ')}), above the rail: ${story.modelReviewers} AI reviewers, ${story.codeChecks} code checks, verified, you approve.`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(<OgCard story={story} />, { ...OG_SIZE, fonts: await loadOgFonts() });
}
