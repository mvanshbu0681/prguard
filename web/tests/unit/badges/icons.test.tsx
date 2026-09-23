// OWNER: t1c (wave 1). Every icon PRGuard draws, against docs/design/02-design-system.md §6:
// one stroke language (1.25px on 16, 1.5px on 24, the 1px hinted 12), butt caps, miter joins,
// fill none + currentColor, integer coordinates with strokes on the half pixel, aria-hidden
// by default — and §6.5's banned icons refused, both at runtime and anywhere in the repo.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import * as Lucide from "lucide-react";
import { Copy, Search } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  ARTBOARD_STROKE,
  BANNED_ICON_PATTERNS,
  Check,
  Cross,
  DoubleBar,
  Ellipsis,
  FingerprintMark,
  GATE_ART,
  GLYPH_DEFS,
  GovernanceMark,
  Icon,
  LEDGER_ART,
  LEVEL_ART,
  Play,
  ProofMark,
  RIDGE_ART,
  RUNG_ART,
  Restore,
  SEAL_ART,
  STAGE_ART,
  SeverityMark,
  Sigma,
  StageGlyph,
  VIAL_ART,
  Warn,
  bannedIconReason,
  type Art,
  type Artboard,
} from "@/components/icons";
import { MarkSvg } from "@/components/icons/svg";
import { STAGES, type ProofStatus } from "@/lib/contracts";

const WEB = path.resolve(import.meta.dirname, "../../..");

/** Every hand-drawn artboard, by name. */
const ART: Record<string, Art> = {
  ...Object.fromEntries(Object.entries(VIAL_ART).map(([k, v]) => [`vial-${k}`, v])),
  level: LEVEL_ART,
  ridges: RIDGE_ART,
  seal: SEAL_ART,
  ledger: LEDGER_ART,
  ...Object.fromEntries(Object.entries(GATE_ART).map(([k, v]) => [`gate-${k}`, v])),
  ...Object.fromEntries(Object.entries(RUNG_ART).map(([k, v]) => [`rung-${k}`, v])),
  ...Object.fromEntries(Object.entries(STAGE_ART).map(([k, v]) => [`stage-${k}`, v])),
};

function boards(art: Art): Artboard[] {
  return ([12, 16, 24] as const).filter((b) => art[b] !== undefined);
}

function drawn(art: Art, board: Artboard) {
  const { container, unmount } = render(<MarkSvg art={art} glyph="t" size={board === 12 ? 12 : board} />);
  const svg = container.querySelector("svg")!;
  return { svg, unmount };
}

/** Absolute M/L/H/V coordinates of a path with no curves; null when it has curves. */
function straightCoords(d: string): number[] | null {
  if (/[AaCcQqSsTt]/.test(d)) return null;
  if (/[mlhvz]/.test(d.replace(/Z/g, ""))) throw new Error(`relative commands are not allowed on the icon grid: ${d}`);
  return (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

const onHalfGrid = (v: number) => Number.isInteger(v * 2);

describe("MarkSvg — the stroke language", () => {
  it("authors 16 and 24 for every drawing", () => {
    for (const [name, art] of Object.entries(ART)) {
      expect(art[16], name).toBeDefined();
      expect(art[24], name).toBeDefined();
    }
  });

  it("renders every artboard with butt caps, miter joins, fill none, currentColor and the grid's stroke", () => {
    for (const [name, art] of Object.entries(ART)) {
      for (const board of boards(art)) {
        const { svg, unmount } = drawn(art, board);
        expect(svg.getAttribute("viewBox"), name).toBe(`0 0 ${board} ${board}`);
        expect(svg.getAttribute("data-artboard"), name).toBe(String(board));
        expect(svg.getAttribute("fill"), name).toBe("none");
        expect(svg.getAttribute("stroke"), name).toBe("currentColor");
        expect(svg.getAttribute("stroke-linecap"), name).toBe("butt");
        expect(svg.getAttribute("stroke-linejoin"), name).toBe("miter");
        expect(Number(svg.getAttribute("stroke-width")), name).toBe(ARTBOARD_STROKE[board]);
        expect(ARTBOARD_STROKE).toEqual({ 12: 1, 16: 1.25, 24: 1.5 });
        // nothing overrides the language locally
        for (const el of svg.querySelectorAll("*")) {
          expect(el.getAttribute("stroke-linecap"), name).toBeNull();
          expect(el.getAttribute("stroke-linejoin"), name).toBeNull();
          expect(el.getAttribute("stroke-width"), name).toBeNull();
          const fill = el.getAttribute("fill");
          expect(fill === null || fill === "currentColor" || fill === "none", `${name} fill=${fill}`).toBe(true);
          const stroke = el.getAttribute("stroke");
          expect(stroke === null || stroke === "none" || stroke === "currentColor", `${name} stroke=${stroke}`).toBe(true);
        }
        unmount();
      }
    }
  });

  it("puts straight strokes on integer coordinates or the half pixel, and solid areas on whole pixels", () => {
    for (const [name, art] of Object.entries(ART)) {
      for (const board of boards(art)) {
        const { svg, unmount } = drawn(art, board);
        for (const p of svg.querySelectorAll("path")) {
          const coords = straightCoords(p.getAttribute("d")!);
          if (coords === null) continue; // arcs: the ridges and the chain link are curves by nature
          for (const v of coords) expect(onHalfGrid(v), `${name}@${board} ${p.getAttribute("d")}`).toBe(true);
          for (const v of coords) expect(v >= 0 && v <= board, `${name}@${board} out of the artboard`).toBe(true);
        }
        for (const r of svg.querySelectorAll("rect")) {
          for (const a of ["x", "y", "width", "height"]) expect(Number.isInteger(Number(r.getAttribute(a))), `${name}@${board} rect ${a}`).toBe(true);
        }
        for (const c of svg.querySelectorAll("circle, ellipse")) {
          for (const a of ["cx", "cy"]) expect(onHalfGrid(Number(c.getAttribute(a))), `${name}@${board} ${a}`).toBe(true);
        }
        unmount();
      }
    }
  });

  it("never rounds a terminal anywhere in the icon sources", () => {
    const dir = path.join(WEB, "src/components/icons");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/(strokeLinecap|stroke-linecap|strokeLinejoin|stroke-linejoin)\s*[=:]\s*["']round/);
    }
  });

  it("serves the hinted 12 when it exists, 16 up to 16px and 24 above", () => {
    const at = (art: Art, size: 12 | 14 | 16 | 20 | 24) => {
      const { container, unmount } = render(<MarkSvg art={art} glyph="t" size={size} />);
      const board = container.querySelector("svg")!.getAttribute("data-artboard");
      unmount();
      return board;
    };
    expect([12, 14, 16, 20, 24].map((s) => at(VIAL_ART.filled, s as 12))).toEqual(["12", "16", "16", "24", "24"]);
    expect([12, 14, 16, 20, 24].map((s) => at(LEVEL_ART, s as 12))).toEqual(["16", "16", "16", "24", "24"]);
  });

  it("scales only geometry: every shape keeps its stroke width (non-scaling-stroke)", () => {
    const { container } = render(<SeverityMark size={20} />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("[&_*]:[vector-effect:non-scaling-stroke]");
  });

  it("is aria-hidden unless it is the only label, then role=img with a <title>", () => {
    const quiet = render(<FingerprintMark />).container.querySelector("svg")!;
    expect(quiet.getAttribute("aria-hidden")).toBe("true");
    expect(quiet.getAttribute("role")).toBeNull();
    const named = render(<GovernanceMark title="audit chain sealed" />).container.querySelector("svg")!;
    expect(named.getAttribute("role")).toBe("img");
    expect(named.getAttribute("aria-hidden")).toBeNull();
    expect(named.querySelector("title")?.textContent).toBe("audit chain sealed");
  });
});

describe("the four mechanic marks and the nine stations", () => {
  it("draws six distinct vials for the six proof statuses", () => {
    const statuses: ProofStatus[] = ["proven", "disproven", "inconclusive", "not_attempted", "not_applicable", "skipped_no_env"];
    const html = statuses.map((s) => render(<ProofMark status={s} size={16} />).container.innerHTML.replace(/data-glyph="[^"]*"/, ""));
    expect(new Set(html).size).toBe(6);
  });

  it("M3 is a ridge pattern with exactly one break", () => {
    // the 16 grid: core + ridge 2 (split in two at the break) + the outer arch
    const { container } = render(<FingerprintMark size={16} />);
    expect(container.querySelectorAll("path")).toHaveLength(4);
  });

  it("has a station glyph for each of the nine STAGES, and they are all different", () => {
    expect(Object.keys(STAGE_ART)).toEqual([...STAGES]);
    const html = STAGES.map((stage) => {
      const { container } = render(<StageGlyph stage={stage} size={24} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("data-glyph")).toBe(`stage-${stage}`);
      return svg.innerHTML;
    });
    expect(new Set(html).size).toBe(9);
  });
});

describe("text glyphs — the characters Google Sans Code does not have", () => {
  const GLYPHS: [string, (p: { speak?: boolean }) => ReactNode][] = [
    ["▶", Play],
    ["↻", Restore],
    ["✓", Check],
    ["✗", Cross],
    ["⚠", Warn],
    ["⋯", Ellipsis],
    ["Σ", Sigma],
    ["‖", DoubleBar],
  ];

  it("covers exactly plan A15's list", () => {
    expect(Object.values(GLYPH_DEFS).map((d) => d.char).sort()).toEqual(["↻", "▶", "✓", "✗", "Σ", "⋯", "‖", "⚠"].sort());
  });

  it("sits in mono text: 1em tall, one 0.6em cell wide, vertical-align -0.125em, currentColor", () => {
    for (const [char, G] of GLYPHS) {
      const { container, unmount } = render(<>{G({})}</>);
      const svg = container.querySelector("svg")!;
      const cls = svg.getAttribute("class")!;
      expect(cls, char).toContain("h-[1em]");
      expect(cls, char).toContain("w-[0.6em]");
      expect(cls, char).toContain("align-[-0.125em]");
      expect(svg.getAttribute("viewBox"), char).toBe("0 0 12 20");
      expect(svg.getAttribute("aria-hidden"), char).toBe("true");
      unmount();
    }
  });

  it("keeps the real character for copy-paste where it is data (⋯ Σ ‖), not where it decorates a label", () => {
    const spoken = (G: (p: { speak?: boolean }) => ReactNode, speak?: boolean) => {
      const { container, unmount } = render(<>{G(speak === undefined ? {} : { speak })}</>);
      const text = container.querySelector(".sr-only")?.textContent ?? null;
      // the hidden character is contained by its own inline wrapper, never by a far ancestor
      if (text) expect(container.querySelector('[data-slot="glyph"]')?.className).toContain("relative");
      unmount();
      return text;
    };
    expect(spoken(Ellipsis)).toBe("⋯");
    expect(spoken(Sigma)).toBe("Σ");
    expect(spoken(DoubleBar)).toBe("‖");
    expect(spoken(Play)).toBeNull();
    expect(spoken(Check)).toBeNull();
    expect(spoken(Check, true)).toBe("✓");
    expect(spoken(Sigma, false)).toBeNull();
  });
});

describe("Icon — lucide-react at PRGuard's weight", () => {
  it("renders stroke 1.5 at a size from the 12/14/16/20/24 scale", () => {
    const { container } = render(<Icon icon={Search} size="sm" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
    expect(svg.getAttribute("width")).toBe("14");
    expect(svg.getAttribute("height")).toBe("14");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(render(<Icon icon={Copy} size={24} />).container.querySelector("svg")!.getAttribute("width")).toBe("24");
  });

  it("names the icon when it is the only label", () => {
    const svg = render(<Icon icon={Copy} label="Copy hash" />).container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Copy hash");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("refuses every §6.5 banned icon, aliases included", () => {
    const banned = [
      Lucide.Sparkles,
      Lucide.Sparkle,
      Lucide.Stars,
      Lucide.Brain,
      Lucide.BrainCircuit,
      Lucide.Bot,
      Lucide.BotMessageSquare,
      Lucide.Shield,
      Lucide.ShieldCheck,
      Lucide.Hexagon,
      Lucide.Network,
      Lucide.Wand,
      Lucide.WandSparkles,
      Lucide.MessageSquare,
      Lucide.MessagesSquare,
      Lucide.Speech,
      Lucide.Globe,
      Lucide.Earth,
      Lucide.Orbit,
      Lucide.Smile,
      Lucide.Frown,
      Lucide.Laugh,
      Lucide.LoaderCircle,
      Lucide.Loader,
      Lucide.CircleCheck,
      Lucide.CheckCircle,
      Lucide.BadgeCheck,
      Lucide.SquareCheck,
    ];
    for (const icon of banned) {
      expect(icon, "a banned name that lucide no longer exports").toBeDefined();
      expect(bannedIconReason(icon.displayName ?? ""), icon.displayName).not.toBeNull();
      expect(() => render(<Icon icon={icon} />), icon.displayName).toThrow(/banned/);
    }
  });

  it("lets ordinary utility chrome through", () => {
    for (const icon of [Lucide.Search, Lucide.Copy, Lucide.Check, Lucide.X, Lucide.Download, Lucide.ExternalLink, Lucide.Shell, Lucide.BottleWine]) {
      expect(bannedIconReason(icon.displayName ?? ""), icon.displayName).toBeNull();
    }
  });

  // The T0-vendored shadcn toaster ships lucide's CircleCheck (a "pass" tick) and Loader2 (a
  // spinner). T1b owns that file and rewrites it in wave 1 (agent/fe-t1b drops both). The two
  // names are tolerated ONLY while the file is still the untouched T0 stub; the moment it is
  // edited, the scan applies to it in full. Raised to the integrator.
  const T0_STUB = { file: "src/components/ui/sonner.tsx", marker: "T0 reconciliation: PRGuard is dark-only", names: ["CircleCheckIcon", "Loader2Icon"] };

  it("is never reached around: no file in app/ or src/ imports a banned lucide icon", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mts|jsx?|mjs)$/.test(f)) files.push(p);
      }
    };
    walk(path.join(WEB, "app"));
    walk(path.join(WEB, "src"));
    const offences: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(WEB, file);
      const tolerated = rel === T0_STUB.file && src.includes(T0_STUB.marker) ? T0_STUB.names : [];
      for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']lucide-react(?:\/[^"']*)?["']/g)) {
        for (const spec of m[1].split(",")) {
          const imported = spec.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "");
          if (!imported || tolerated.includes(imported)) continue;
          const component = (Lucide as Record<string, unknown>)[imported] as { displayName?: string } | undefined;
          const reason = bannedIconReason(component?.displayName ?? imported);
          if (reason) offences.push(`${rel}: ${imported} — ${reason}`);
        }
      }
      for (const m of src.matchAll(/from\s*["']lucide-react\/(?:dist\/[^"']*\/)?icons\/([a-z0-9-]+)["']/g)) {
        const pascal = m[1].replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
        const reason = bannedIconReason(pascal);
        if (reason) offences.push(`${path.relative(WEB, file)}: lucide-react/icons/${m[1]} — ${reason}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("documents every ban with its reason", () => {
    for (const b of BANNED_ICON_PATTERNS) expect(b.reason.length).toBeGreaterThan(5);
  });
});
