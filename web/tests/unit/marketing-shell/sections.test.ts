// OWNER: t8a (wave 3). Guards the one thing that must never silently drift:
// MARKETING_SECTIONS' ids/index/category against the frozen section stubs
// under app/(marketing)/_sections/** and the frozen app/(marketing)/page.tsx
// that mounts them, plus the nav's brief-mandated CTA target and link set.
import { describe, expect, it } from "vitest";
import { readWebFile } from "../ui/css-tree";
import { ACCURACY_SECTION_ID, MARKETING_SECTIONS, MARKETING_SECTION_IDS, NAV_LINKS, RUN_SECTION_ID } from "@/components/marketing-shell/sections";

const PAGE_SOURCE = readWebFile("app/(marketing)/page.tsx");

describe("MARKETING_SECTIONS", () => {
  it("has exactly the nine sections, in order", () => {
    expect(MARKETING_SECTIONS).toHaveLength(9);
    expect(MARKETING_SECTIONS.map((s) => s.index)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
  });

  it("page.tsx imports the nine section files in this exact order", () => {
    // A renamed/reordered import breaks this before it breaks the nav silently.
    const importLines = [...PAGE_SOURCE.matchAll(/from\s+"\.\/_sections\/(\d\d)-[\w-]+"/g)].map((m) => m[1]);
    expect(importLines).toEqual(MARKETING_SECTIONS.map((s) => s.index));
  });

  it("every section id and its index-label category exist verbatim in its stub file", () => {
    const files: Record<string, string> = {
      "01": "01-hero",
      "02": "02-negation",
      "03": "03-we-were-wrong",
      "04": "04-what-lands",
      "05": "05-instrument",
      "06": "06-pipeline",
      "07": "07-record",
      "08": "08-accuracy",
      "09": "09-close",
    };
    for (const section of MARKETING_SECTIONS) {
      const source = readWebFile(`app/(marketing)/_sections/${files[section.index]}.tsx`);
      expect(source, `${section.id}: id="${section.id}"`).toContain(`id="${section.id}"`);
      expect(source, `${section.id}: index-label text`).toContain(`/ ${section.index} — ${section.category}`);
    }
  });

  it("MARKETING_SECTION_IDS mirrors MARKETING_SECTIONS", () => {
    expect(MARKETING_SECTION_IDS).toEqual(MARKETING_SECTIONS.map((s) => s.id));
  });
});

describe("NAV_LINKS", () => {
  it("brief step 2's five anchors, every id a real section", () => {
    expect(NAV_LINKS.map((l) => l.id)).toEqual(["proof", "severity", "pipeline", "record", "accuracy"]);
    for (const link of NAV_LINKS) expect(MARKETING_SECTION_IDS).toContain(link.id);
  });
});

describe("RUN_SECTION_ID / ACCURACY_SECTION_ID", () => {
  it("point at real sections (A5 / brand-gaps §G: the CTA scrolls to #run, never routes)", () => {
    expect(RUN_SECTION_ID).toBe("run");
    expect(MARKETING_SECTION_IDS).toContain(RUN_SECTION_ID);
    expect(ACCURACY_SECTION_ID).toBe("accuracy");
    expect(MARKETING_SECTION_IDS).toContain(ACCURACY_SECTION_ID);
  });
});
