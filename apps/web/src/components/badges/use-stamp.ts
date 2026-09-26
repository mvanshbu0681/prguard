"use client";
// OWNER: t1c (wave 1). THE 0ms RULE, as a hook (docs/design/02-design-system.md §4.7,
// motion spec §2.5).
//
// A verdict or gate colour change has no `transition` at all. Instead, when a chip's value
// changes after mount, the chip re-mounts (its `key` is this count) with the class `stamp`:
// track t3's 180ms `scale(1.045) → 1`. Re-mounting restarts the keyframe even when the
// value flips twice inside 180ms. First paint never stamps: a page load is not a verdict
// arriving. A client module, so the badge barrel stays importable from server components.
import { useState } from "react";

/**
 * How many times `value` has changed since mount. React's "store information from previous
 * renders" pattern: the comparison runs during render, so there is no effect and no frame
 * painted in the old colour.
 */
export function useStamp<T>(value: T): number {
  const [seen, setSeen] = useState(value);
  const [count, setCount] = useState(0);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setCount(count + 1);
  }
  return count;
}
