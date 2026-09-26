// OWNER: t1a (wave 1). The Twitter/X card is the OG card: same image, size and
// alt text (opengraph-image.alt.txt). twitter:card summary_large_image is the
// page metadata's job; this file only supplies twitter:image.
import OpengraphImage, { alt as ogAlt, contentType as ogContentType, size as ogSize } from './opengraph-image';

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default OpengraphImage;
