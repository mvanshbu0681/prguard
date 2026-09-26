// OWNER: m5 (wave 3). <FlightRecorderPanel> — the RIGHT panel: windows the real audit
// chain around a seq and hands it, losslessly parsed, to <ChainRail surface="marketing"
// tamperable>. <ChainRail> itself owns the guards and the tamper interaction
// (src/components/evidence/ChainRail/**, not this track's file); this test only checks
// the window this component builds and that it mounts on the real corpus without
// throwing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlightRecorderPanel } from "@/components/sections/record/FlightRecorderPanel";

// fixtures.ts (@/lib/fixtures) refuses to run once `window` exists (it is
// server-only), and this test needs jsdom to render the component — so the manifest's
// tamper_demo_seq is read the same way the raw audit text is, straight off disk, never
// through the server-only loader. 1428 is plan A10's fixed demo identifier; the
// build-view.test.ts / lossless-window.test.ts node-environment tests already assert it
// against `getManifest()` directly.
const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "fixtures", "manifest.json"), "utf8")) as { ids: { tamper_demo_seq: number } };

describe("FlightRecorderPanel", () => {
  it("mounts on the real audit chain and renders the evidence frame for its window", async () => {
    const rawEventsText = readFileSync(join(process.cwd(), "public", "fixtures", "audit", "events.json"), "utf8");

    render(<FlightRecorderPanel rawEventsText={rawEventsText} tamperDemoSeq={manifest.ids.tamper_demo_seq} />);

    // The evidence frame's index strip (Exhibit) names its category and endpoint —
    // rendered synchronously, before any async verification resolves.
    expect(await screen.findByText(/Audit chain/)).toBeInTheDocument();
    expect(screen.getByText(/GET \/v1\/audit → chain\.verified · broken_at_seq/)).toBeInTheDocument();

    // Six rows (seq 1425…1430), one per event in the window.
    for (const seq of [1425, 1426, 1427, 1428, 1429, 1430]) {
      expect(screen.getByText(String(seq))).toBeInTheDocument();
    }
  });
});
