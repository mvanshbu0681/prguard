// shadcn/ui's `cn` (clsx + tailwind-merge). T0 owns the merge configuration below.
//
// tailwind-merge only knows Tailwind's default scales. app/tokens/core.css
// replaces the radius / shadow / ease scales and adds the type-* bundles, so the
// merger is taught those names — otherwise cn("rounded-md", "rounded-data")
// keeps BOTH classes and CSS source order, not the caller, picks the winner.
// Colour names need nothing: tailwind-merge accepts any colour name.
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge<"prg-type">({
  extend: {
    theme: {
      radius: ["data", "panel", "container", "dot"],
      shadow: ["palette", "modal"],
      "inset-shadow": ["hi"],
      ease: ["instrument", "snap", "mass", "exit"],
    },
    classGroups: {
      // app/tokens/core.css §G — one type-* bundle per element; the last one wins.
      "prg-type": [
        {
          type: [
            "display-hero",
            "display-h2",
            "display-h3",
            "display-h4",
            "label",
            "lead",
            "body",
            "small",
            "micro",
            "readout-xl",
            "readout",
            "terminal",
            "data",
            "chip",
            "badge",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
