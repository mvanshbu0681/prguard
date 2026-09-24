// OWNER: t8a (wave 3). Footer: no banned words (voice guidelines,
// brand-gaps §D), the binding link set (brief step 5), no competitor names,
// no social icon row, the MOTION/CONTRAST toggle row and proof-state legend
// (landing-blueprint §15 Left/Centre, design-system §7.3, motion-spec §5),
// and the JS-disabled noscript line (brand-gaps §F).
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MOTION_ATTR } from "@/motion/reduced";
import { Footer } from "@/components/marketing-shell/Footer";
import { MARKETING_SECTIONS } from "@/components/marketing-shell/sections";

afterEach(() => {
  document.documentElement.removeAttribute(MOTION_ATTR);
  document.documentElement.removeAttribute("data-contrast");
});

// brand-gaps §D "Banned words and constructions" — a representative sample
// plausible in footer copy specifically (the full list also bans claims and
// headline shapes that do not apply to a link list).
const BANNED_WORDS = [
  "intelligent",
  "smart",
  "context-aware",
  "best-in-class",
  "enterprise-grade",
  "powerful",
  "seamless",
  "effortless",
  "cutting-edge",
  "frontier",
  "world-class",
  "revolutionary",
  "game-changing",
  "robust",
  "blazing",
  "supercharge",
  "unlock",
  "empower",
  "leverage",
  "streamline",
  "elevate",
  "transform",
  "democratise",
  "democratize",
  "reimagine",
  "ai-powered",
  "trusted by developers everywhere",
];

// brand-gaps §D "Never name a competitor on the marketing site."
const COMPETITOR_NAMES = ["CodeRabbit", "Copilot", "Codacy", "SonarQube", "DeepSource", "Greptile"];

describe("Footer", () => {
  it("carries the close's line and a provenance-style build line", () => {
    render(<Footer />);
    expect(screen.getByText("Proven, or it doesn't block.")).toBeInTheDocument();
    expect(screen.getByText(/build .+ · \d{4}/)).toBeInTheDocument();
  });

  it("links only to things that exist: the nine sections, /accuracy, /audit, /findings, and a GitHub placeholder", () => {
    render(<Footer />);
    for (const section of MARKETING_SECTIONS) {
      const anchors = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === `#${section.id}`);
      expect(anchors.length, `#${section.id}`).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: /accuracy report/i })).toHaveAttribute("href", "/accuracy");
    expect(screen.getByRole("link", { name: /audit chain/i })).toHaveAttribute("href", "/audit");
    expect(screen.getByRole("link", { name: /findings/i })).toHaveAttribute("href", "/findings");
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "#");
  });

  it("has no social icon row: every link is text, none is an <img> or a bare icon-only anchor", () => {
    render(<Footer />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(link.querySelector("img, svg")).toBeNull();
    }
  });

  it("contains no banned word or construction", () => {
    const { container } = render(<Footer />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of BANNED_WORDS) expect(text, `banned word "${word}"`).not.toContain(word.toLowerCase());
  });

  it("contains no exclamation marks and at most one em-dash per paragraph", () => {
    const { container } = render(<Footer />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("!");
    for (const p of Array.from(container.querySelectorAll("p"))) {
      expect((p.textContent?.match(/—/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("never names a competitor", () => {
    const { container } = render(<Footer />);
    const text = container.textContent ?? "";
    for (const name of COMPETITOR_NAMES) expect(text, `competitor name "${name}"`).not.toContain(name);
  });

  it("carries the MOTION toggle, writing data-motion on <html> through the one shared code path", async () => {
    const user = userEvent.setup();
    render(<Footer />);
    const motion = screen.getByRole("button", { name: /motion: full/i });
    expect(document.documentElement.hasAttribute(MOTION_ATTR)).toBe(false);
    await user.click(motion);
    expect(document.documentElement.getAttribute(MOTION_ATTR)).toBe("reduced");
    expect(await screen.findByRole("button", { name: /motion: reduced/i })).toBeInTheDocument();
  });

  it("carries the CONTRAST toggle, writing data-contrast=\"high\" on <html>", async () => {
    const user = userEvent.setup();
    render(<Footer />);
    const contrast = screen.getByRole("button", { name: /contrast: standard/i });
    await user.click(contrast);
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    expect(await screen.findByRole("button", { name: /contrast: high/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /contrast: high/i }));
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
  });

  it("carries the four-glyph proof-state legend", () => {
    render(<Footer />);
    expect(screen.getByText(/◆ proven/)).toBeInTheDocument();
    expect(screen.getByText(/◇ disproven/)).toBeInTheDocument();
    expect(screen.getByText(/◈ inconclusive/)).toBeInTheDocument();
    expect(screen.getByText(/◌ not_attempted/)).toBeInTheDocument();
  });

  it("carries the JS-disabled noscript line inside a <noscript>", () => {
    const { container } = render(<Footer />);
    const noscript = container.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent ?? "").toContain(
      "Replay, the audit chain tamper control and the live run view need JavaScript. Everything above is static.",
    );
  });
});
