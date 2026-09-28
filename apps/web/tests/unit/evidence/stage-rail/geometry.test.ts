// OWNER: t7 (wave 2). pipeline-geometry.ts: the one constants file every breakpoint derives
// from (plan §13 A4, landing-blueprint §06, design-system §1.11).
import { describe, expect, it } from "vitest";
import { STAGES } from "@/lib/contracts";
import {
  breakpointFor,
  elbow,
  forkLane,
  geometryFor,
  PIPELINE_BREAKPOINTS,
  PIPELINE_GEOMETRY,
  type PipelineBreakpoint,
} from "@/lib/pipeline-geometry";

const BREAKPOINTS: PipelineBreakpoint[] = ["wide", "medium", "vertical"];

describe("PIPELINE_GEOMETRY — three sets, one constants file", () => {
  it("has exactly wide, medium and vertical, and nothing else", () => {
    expect(Object.keys(PIPELINE_GEOMETRY).sort()).toEqual([...BREAKPOINTS].sort());
  });

  it.each(BREAKPOINTS)("%s: a station for every STAGES entry, inside its own viewBox", (name) => {
    const g = PIPELINE_GEOMETRY[name];
    expect(g.name).toBe(name);
    expect(Object.keys(g.stations).sort()).toEqual([...STAGES].sort());
    for (const stage of STAGES) {
      const p = g.stations[stage];
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(g.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(g.height);
    }
  });

  it.each(BREAKPOINTS)("%s: all eight adjacent STAGES pairs, no duplicates", (name) => {
    const g = PIPELINE_GEOMETRY[name];
    expect(g.edges).toHaveLength(STAGES.length - 1); // 8 adjacent pairs
    const pairs = g.edges.map((e) => `${e.from}>${e.to}`);
    expect(new Set(pairs).size).toBe(pairs.length); // no duplicates
    for (const { from, to } of g.edges) {
      const i = STAGES.indexOf(from);
      expect(STAGES[i + 1]).toBe(to);
    }
  });

  it.each(BREAKPOINTS)("%s: specialists -> coordinator starts at the fork's exit, not the specialists station", (name) => {
    const g = PIPELINE_GEOMETRY[name];
    const closing = g.edges.find((e) => e.from === "specialists" && e.to === "coordinator")!;
    expect(closing).toBeDefined();
    expect(closing.d.startsWith(`M${g.fork.exit.x} ${g.fork.exit.y}`)).toBe(true);
    expect(closing.d.startsWith(`M${g.stations.specialists.x} ${g.stations.specialists.y}`)).toBe(false);
  });

  it.each(BREAKPOINTS)("%s: the fork is a genuine four-branch parallel fork", (name) => {
    const g = PIPELINE_GEOMETRY[name];
    expect(g.fork.lanes).toHaveLength(4);
    expect(new Set(g.fork.lanes.map((l) => l.key))).toEqual(new Set(["bugs", "security", "tests", "quality"]));
    // every lane starts at the SAME entry and ends at the SAME exit — genuinely parallel,
    // not four independent routes — and no two lanes draw an identical path.
    for (const lane of g.fork.lanes) {
      expect(lane.d.startsWith(`M${g.fork.entry.x} ${g.fork.entry.y}`)).toBe(true);
      expect(lane.d.endsWith(`${g.fork.exit.x} ${g.fork.exit.y}`)).toBe(true);
    }
    expect(new Set(g.fork.lanes.map((l) => l.d)).size).toBe(4);
    // the fork's entry point IS the specialists station (module contract).
    expect(g.fork.entry).toEqual(g.stations.specialists);
  });

  it("wide and medium are horizontal; vertical is vertical", () => {
    expect(PIPELINE_GEOMETRY.wide.orientation).toBe("horizontal");
    expect(PIPELINE_GEOMETRY.medium.orientation).toBe("horizontal");
    expect(PIPELINE_GEOMETRY.vertical.orientation).toBe("vertical");
  });

  it("every edge and every lane path is a real SVG path string", () => {
    for (const g of Object.values(PIPELINE_GEOMETRY)) {
      for (const d of [...g.edges.map((e) => e.d), ...g.fork.lanes.map((l) => l.d)]) {
        expect(d).toMatch(/^M[\d.\- ]+C/);
      }
    }
  });
});

describe("breakpointFor / geometryFor", () => {
  it("matches PIPELINE_BREAKPOINTS' thresholds", () => {
    expect(breakpointFor(0)).toBe("vertical");
    expect(breakpointFor(767)).toBe("vertical");
    expect(breakpointFor(768)).toBe("medium");
    expect(breakpointFor(1279)).toBe("medium");
    expect(breakpointFor(1280)).toBe("wide");
    expect(breakpointFor(2000)).toBe("wide");
  });

  it("geometryFor returns the matching PIPELINE_GEOMETRY entry", () => {
    expect(geometryFor(1440)).toBe(PIPELINE_GEOMETRY.wide);
    expect(geometryFor(900)).toBe(PIPELINE_GEOMETRY.medium);
    expect(geometryFor(375)).toBe(PIPELINE_GEOMETRY.vertical);
  });

  it("PIPELINE_BREAKPOINTS is ascending and vertical floors at 0", () => {
    const widths = PIPELINE_BREAKPOINTS.map((b) => b.minWidth);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(PIPELINE_BREAKPOINTS.find((b) => b.name === "vertical")?.minWidth).toBe(0);
  });
});

describe("elbow()", () => {
  it("two points level on the tangent axis render as a dead-straight line", () => {
    const d = elbow({ x: 0, y: 40 }, { x: 100, y: 40 }, { axis: "x" });
    expect(d).toBe("M0 40 C50 40 50 40 100 40");
    const v = elbow({ x: 40, y: 0 }, { x: 40, y: 100 }, { axis: "y" });
    expect(v).toBe("M40 0 C40 50 40 50 40 100");
  });

  it("bends toward the midpoint by `bend`", () => {
    const d = elbow({ x: 0, y: 0 }, { x: 100, y: 40 }, { axis: "x", bend: 0.25 });
    expect(d).toBe("M0 0 C25 0 75 40 100 40");
  });

  it("move: false omits the leading M, so it continues an open path", () => {
    const d = elbow({ x: 0, y: 0 }, { x: 10, y: 10 }, { move: false });
    expect(d.startsWith("M")).toBe(false);
    expect(d.startsWith("C")).toBe(true);
  });
});

describe("forkLane()", () => {
  it("starts at entry and ends at exit, with a flat run through the offset", () => {
    const d = forkLane({ x: 0, y: 80 }, { x: 200, y: 80 }, 20, "x");
    expect(d.startsWith("M0 80")).toBe(true);
    expect(d.endsWith("200 80")).toBe(true);
    expect(d).toContain(" 20"); // the flat run sits at the offset y
  });

  it("two lanes with different offsets never draw the same path", () => {
    const a = forkLane({ x: 0, y: 80 }, { x: 200, y: 80 }, 20, "x");
    const b = forkLane({ x: 0, y: 80 }, { x: 200, y: 80 }, 50, "x");
    expect(a).not.toBe(b);
  });
});
