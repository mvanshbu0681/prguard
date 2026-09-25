// OWNER: T1b (wave 1). The house rules of src/styles/ui.css, asserted structurally:
// motion spec §2 (token-only timing), §6.1 (compositor contract), §7 (the hover
// language); design §3.4 (no drop shadow), §8.3 (focus), brand-gaps ruling 5
// (skeletons never shimmer).
import { describe, expect, it } from "vitest";
import { allBlocks, ancestry, declValue, findBlocks, parseCss, readWebFile, stripComments, type CssBlock } from "./css-tree";

const SOURCE = readWebFile("src/styles/ui.css");
const CSS = stripComments(SOURCE);
const TREE = parseCss(SOURCE);
const BLOCKS = allBlocks(TREE);

const inHoverMedia = (b: CssBlock) => ancestry(b).some((p) => /^@media\s*\(hover:\s*hover\)/.test(p));
const selectorChain = (b: CssBlock) => ancestry(b).filter((p) => !p.startsWith("@")).join(" ");

describe("ui.css — timing comes from tokens only (motion §2.1, §2.2)", () => {
  it("has no millisecond or second literals", () => {
    expect(CSS.match(/(?<![\w-])\d+(\.\d+)?m?s\b(?![\w-])/g) ?? []).toEqual([]);
  });

  it("has no inline cubic-bezier() curves", () => {
    expect(CSS).not.toMatch(/cubic-bezier\(/);
  });

  it("names every transition and animation duration as a --dur-* or --ui-*-dur variable", () => {
    const offenders: string[] = [];
    for (const b of BLOCKS) {
      for (const d of b.decls) {
        if (d.prop === "transition-duration") {
          for (const part of d.value.split(",")) if (!/^var\(--(dur-[\w-]+|ui-[\w-]+-dur)\)$/.test(part.trim())) offenders.push(`${b.prelude} → ${d.value}`);
        }
        if (d.prop === "transition" || d.prop === "animation") {
          if (!/var\(--(dur-[\w-]+|ui-[\w-]+-dur|heartbeat-period)\)/.test(d.value)) offenders.push(`${b.prelude} → ${d.prop}: ${d.value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never transitions `all`", () => {
    expect(CSS).not.toMatch(/transition(-property)?\s*:\s*all\b/);
  });

  it("keeps will-change out of the stylesheet (motion §6.1)", () => {
    expect(CSS).not.toMatch(/will-change/);
  });
});

describe("ui.css — no drop shadow, no glow (design §3.4, §3.6)", () => {
  it("only ever declares blur-free inset box-shadows", () => {
    const shadows = BLOCKS.flatMap((b) => b.decls.filter((d) => d.prop === "box-shadow").map((d) => ({ at: b.prelude, value: d.value })));
    expect(shadows.length).toBeGreaterThan(0);
    for (const { at, value } of shadows) {
      for (const layer of value.split(/,(?![^(]*\))/)) {
        const parts = layer.trim().split(/\s+/);
        expect(parts[0], `${at}: ${value}`).toBe("inset");
        // inset <x> <y> [<blur>] <colour>: a blur, when present, is 0
        const lengths = parts.slice(1).filter((p) => /^-?\d/.test(p));
        expect(lengths.length, `${at}: ${value}`).toBeLessThanOrEqual(3);
        if (lengths.length === 3) expect(parseFloat(lengths[2]), `${at}: blur in ${value}`).toBe(0);
      }
    }
  });

  it("uses no drop-shadow filter, text-shadow or --shadow-* token", () => {
    expect(CSS).not.toMatch(/drop-shadow|text-shadow|var\(--shadow-/);
  });
});

describe("ui.css — backdrop-filter lives on the ⌘K palette only (design §5.13, motion §6.2)", () => {
  it("declares backdrop-filter in exactly one rule, .ui-palette", () => {
    const hosts = BLOCKS.filter((b) => b.decls.some((d) => d.prop === "backdrop-filter" || d.prop === "-webkit-backdrop-filter"));
    expect(hosts.map((b) => b.prelude)).toEqual([".ui-palette"]);
  });
});

describe("ui.css — focus is never removed (design §8.3)", () => {
  it("never sets outline to none or zero", () => {
    expect(CSS).not.toMatch(/outline(-style)?\s*:\s*(none|0)\b/);
  });

  it("forces the same ring the global :focus-visible rule draws", () => {
    expect(declValue(TREE, '[data-force~="focus"]', "outline")).toBe("2px solid var(--signal-hi)");
    expect(declValue(TREE, '[data-force~="focus"]', "outline-offset")).toBe("2px");
  });
});

describe("ui.css — every hover rule is gated by @media (hover: hover) (motion §6.5, §7)", () => {
  it("has no :hover selector outside that media query", () => {
    const loose = BLOCKS.filter((b) => /:hover\b/.test(b.prelude) && !inHoverMedia(b)).map((b) => selectorChain(b));
    expect(loose).toEqual([]);
  });

  it("never moves, scales, glows or shadows anything on hover", () => {
    const hoverBlocks = BLOCKS.filter((b) => /:hover\b|\[data-force~="hover"\]/.test(selectorChain(b)));
    expect(hoverBlocks.length).toBeGreaterThan(10);
    for (const b of hoverBlocks) {
      for (const d of b.decls) {
        const scaleX = d.prop === "transform" && /^scaleX\((0|1)\)$/.test(d.value); // the link rule drawing itself
        if (scaleX) continue;
        expect(["transform", "translate", "scale", "rotate", "box-shadow", "filter", "text-shadow"], `${selectorChain(b)} { ${d.prop}: ${d.value} }`).not.toContain(d.prop);
      }
    }
  });
});

describe("ui.css — keyframes move only transform and opacity (motion §6.1)", () => {
  it("animates nothing else", () => {
    const frames = BLOCKS.filter((b) => b.parent && b.parent.prelude.startsWith("@keyframes"));
    expect(frames.length).toBeGreaterThan(5);
    for (const f of frames) for (const d of f.decls) expect(["transform", "opacity"], `${f.parent!.prelude} ${f.prelude}`).toContain(d.prop);
  });

  it("ships no pulse, shimmer, sweep, spin or bounce keyframes", () => {
    const names = BLOCKS.filter((b) => b.prelude.startsWith("@keyframes")).map((b) => b.prelude.slice("@keyframes ".length));
    for (const n of names) expect(n).not.toMatch(/pulse|shimmer|sweep|spin|bounce|ping|rotate/);
  });

  it("draws the loading ellipsis static: no loop, no rotation (the heartbeat dot is the only loop)", () => {
    const ellipsis = BLOCKS.filter((b) => b.prelude.includes("ui-ellipsis"));
    expect(ellipsis.length).toBeGreaterThan(0);
    for (const b of ellipsis) for (const d of b.decls) expect(d.prop, b.prelude).not.toMatch(/^animation/);
    expect(CSS).not.toMatch(/infinite/);
    expect(CSS).not.toMatch(/rotate\(/);
  });
});

describe("ui.css — the hover language (motion §7)", () => {
  const utility = (name: string) => findBlocks(TREE, `@utility ${name}`)[0];

  it.each(["hover-row", "hover-surface", "hover-frame", "hover-ghost", "hover-quiet", "hover-primary", "hover-atom", "link-draw", "link-prose", "press"])(
    "defines @utility %s",
    (name) => {
      expect(utility(name)).toBeDefined();
    },
  );

  it.each(["hover-row", "hover-surface", "hover-frame", "hover-atom", "link-prose"])("%s transitions in 120ms on --ease-snap", (name) => {
    const u = utility(name);
    expect(u.decls.find((d) => d.prop === "transition-duration")?.value).toBe("var(--dur-1)");
    expect(u.decls.find((d) => d.prop === "transition-timing-function")?.value).toBe("var(--ease-snap)");
  });

  it.each(["hover-ghost", "hover-quiet", "hover-primary"])("%s: colour in 120ms, press in 90ms, release in 180ms", (name) => {
    const u = utility(name);
    expect(u.decls.find((d) => d.prop === "transition-duration")?.value).toBe("var(--dur-1), var(--dur-1), var(--dur-1), var(--dur-2)");
    const active = u.children.find((c) => c.prelude.includes(":active"));
    expect(active?.decls.find((d) => d.prop === "transform")?.value).toBe("translateY(var(--ui-press-y))");
    expect(active?.decls.find((d) => d.prop === "transition-duration")?.value).toMatch(/var\(--dur-active\)$/);
    expect(SOURCE).toMatch(/--ui-press-y: 0\.5px;/);
  });

  it("rows and ghost controls step exactly one ink rung; primary gains one lightness step", () => {
    expect(SOURCE).toMatch(/--ui-hover-row: var\(--ink-3\);/);
    expect(SOURCE).toMatch(/--ui-hover-ghost: var\(--ink-2\);/);
    const hoverFill = (name: string) =>
      allBlocks(utility(name))
        .filter((b) => inHoverMedia(b) || b.prelude.includes('[data-force~="hover"]'))
        .flatMap((b) => b.decls)
        .find((d) => d.prop === "background-color")?.value;
    expect(hoverFill("hover-row")).toBe("var(--ui-hover-row)");
    expect(hoverFill("hover-ghost")).toBe("var(--ui-hover-ghost)");
    expect(hoverFill("hover-primary")).toBe("var(--signal-hi)");
  });

  it("link-draw draws a 1px rule left-to-right over 240ms and retracts to the right", () => {
    const u = utility("link-draw");
    const after = u.children.find((c) => c.prelude === "&::after")!;
    expect(after.decls.find((d) => d.prop === "height")?.value).toBe("1px");
    expect(after.decls.find((d) => d.prop === "transform")?.value).toBe("scaleX(0)");
    expect(after.decls.find((d) => d.prop === "transform-origin")?.value).toBe("right");
    expect(after.decls.find((d) => d.prop === "transition")?.value).toBe("transform var(--ui-draw-dur) var(--ease-instrument)");
    expect(SOURCE).toMatch(/--ui-draw-dur: var\(--dur-3\);/); // 240ms
    const drawn = allBlocks(u).filter((b) => b.prelude.includes("::after") && b.decls.some((d) => d.value === "scaleX(1)"));
    expect(drawn.length).toBeGreaterThan(0);
    for (const b of drawn) expect(b.decls.find((d) => d.prop === "transform-origin")?.value).toBe("left");
  });
});

describe("ui.css — components", () => {
  it("rests every table row at 32px, 26px compact (design §5.5)", () => {
    expect(declValue(TREE, ".ui-table", "--ui-row-h")).toBe("32px");
    expect(declValue(TREE, '.ui-table[data-density="compact"]', "--ui-row-h")).toBe("26px");
    expect(declValue(TREE, ".ui-table tr", "height")).toBe("var(--ui-row-h)");
  });

  it("never zebra-stripes a table", () => {
    expect(CSS).not.toMatch(/nth-(child|of-type)\((odd|even|2n)/);
  });

  it("keeps skeletons static (brand-gaps ruling 5)", () => {
    const skeleton = findBlocks(TREE, ".ui-skeleton")[0];
    expect(skeleton.decls.map((d) => d.prop).sort()).toEqual(["background-color", "border-radius"]);
    expect(declValue(TREE, ":root", "--ui-skeleton")).toBe("var(--ink-2)");
    expect(allBlocks(TREE).some((b) => /skeleton/.test(b.prelude) && b.decls.some((d) => d.prop.startsWith("animation")))).toBe(false);
  });

  it("paints the badge as a 2px-radius chip, never a pill", () => {
    expect(declValue(TREE, ".ui-badge", "border-radius")).toBe("var(--radius-data)");
    expect(declValue(TREE, ".ui-badge", "height")).toBe("20px");
    expect(CSS).not.toMatch(/--radius-dot|9999px|border-radius:\s*(50%|999)/);
  });

  it("never paints text on a solid --alarm fill (R2)", () => {
    for (const b of BLOCKS) {
      const bg = b.decls.find((d) => d.prop === "background-color" || d.prop === "background")?.value;
      if (bg !== "var(--alarm)") continue;
      // only glyph-free bars may be solid alarm: a pseudo-element with empty content
      expect(b.prelude, `solid --alarm on ${b.prelude}`).toMatch(/::before|::after/);
    }
    expect(declValue(TREE, ".ui-btn--destructive", "--ui-btn-fg")).toBe("var(--alarm-text)");
    expect(declValue(TREE, ".ui-btn--destructive", "background-color")).toBeUndefined();
  });

  it("gives overlays the 180ms enter of ruling 6 and the 160ms exit", () => {
    expect(SOURCE).toMatch(/--ui-overlay-dur: var\(--dur-2\);/);
    for (const sel of ['.ui-dialog[data-state="open"]', '.ui-pop[data-state="open"]', '.ui-palette[data-state="open"]', '.ui-scrim[data-state="open"]']) {
      expect(declValue(TREE, sel, "animation"), sel).toMatch(/var\(--ui-overlay-dur\) var\(--ease-snap\)/);
    }
    expect(declValue(TREE, '.ui-dialog[data-state="closed"]', "animation")).toMatch(/var\(--dur-exit\) var\(--ease-exit\)/);
  });
});

describe("ui.css — reduced motion is a designed second state (motion §5)", () => {
  const reducedMedia = BLOCKS.find((b) => b.prelude === "@media (prefers-reduced-motion: reduce)")!;
  const mediaRoot = reducedMedia.children.find((c) => c.prelude === ":root")!;
  const toggleRoot = findBlocks(TREE, ':root[data-motion="reduced"]')[0];

  it("serves the OS preference and the footer toggle with the same declarations", () => {
    expect(mediaRoot.decls).toEqual(toggleRoot.decls);
  });

  it("drops every transform and keeps colour", () => {
    const get = (p: string) => mediaRoot.decls.find((d) => d.prop === p)?.value;
    expect(get("--ui-press-y")).toBe("0px");
    for (const p of ["--ui-pop-from", "--ui-dialog-from", "--ui-palette-from", "--ui-sheet-from"]) expect(get(p)).toBe("none");
    expect(get("--ui-overlay-dur")).toBe("var(--dur-1)");
  });

  it("is not the forbidden `* { animation: none }`", () => {
    expect(CSS).not.toMatch(/\*\s*\{[^}]*animation\s*:\s*none/);
    expect(CSS).not.toMatch(/!important/);
  });
});

describe("ui.css — colour", () => {
  it("names colours by token: no hex, rgb() or hsl() literals", () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
});
