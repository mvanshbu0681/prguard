// OWNER: d3 (wave 3). <ClaimMarkdown> — Finding.body_markdown rendered with
// the restricted schema (dashboard-blueprint §2.7 §01 CLAIM): p, ul, ol, code,
// pre, strong, em, a, blockquote, no raw HTML.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaimMarkdown } from "@/components/routes/finding-detail/ClaimMarkdown";
import { splitTitleSegments } from "@/components/routes/finding-detail/TitleWithCode";

describe("ClaimMarkdown", () => {
  it("renders a paragraph and inline code as real elements", () => {
    const { container } = render(<ClaimMarkdown>{"Calls `session.currency` before the session is loaded."}</ClaimMarkdown>);
    expect(container.querySelector("p")).not.toBeNull();
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("session.currency");
  });

  it("renders lists, strong, em and blockquote from the restricted schema", () => {
    const markdown = ["- one", "- two", "", "**bold** and *em* and", "", "> quoted"].join("\n");
    const { container } = render(<ClaimMarkdown>{markdown}</ClaimMarkdown>);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("em");
    expect(container.querySelector("blockquote")).not.toBeNull();
  });

  it("renders a link with target=_blank and rel=noreferrer, never a bare href", () => {
    render(<ClaimMarkdown>{"See [the repro](https://example.com/repro)."}</ClaimMarkdown>);
    const link = screen.getByRole("link", { name: "the repro" });
    expect(link).toHaveAttribute("href", "https://example.com/repro");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("never renders raw HTML — a script tag becomes inert text, not a live element", () => {
    const { container } = render(<ClaimMarkdown>{'<script>window.__pwned = true</script>\n\nSafe paragraph.'}</ClaimMarkdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Safe paragraph.");
  });

  it("unwraps a disallowed element (e.g. a heading) to its text rather than dropping the sentence", () => {
    render(<ClaimMarkdown>{"# Not a real heading in this schema"}</ClaimMarkdown>);
    expect(screen.getByText("Not a real heading in this schema")).toBeInTheDocument();
  });

  it("sets inline code in the mono face on a themed well (dashboard tokens, not the legacy ink ramp)", () => {
    const { container } = render(<ClaimMarkdown>{"`create_session`"}</ClaimMarkdown>);
    const cls = container.querySelector("code")?.className ?? "";
    expect(cls).toContain("font-w-mono");
    expect(cls).toContain("bg-w-surface");
    expect(cls).not.toContain("bg-ink-2");
  });
});

describe("splitTitleSegments (header title backticks)", () => {
  it("splits backtick-delimited spans out of a plain title", () => {
    expect(splitTitleSegments("Calls `session.currency` before load")).toEqual([
      { text: "Calls ", code: false },
      { text: "session.currency", code: true },
      { text: " before load", code: false },
    ]);
  });

  it("returns the whole title as one plain segment when there are no backticks", () => {
    expect(splitTitleSegments("No code spans here")).toEqual([{ text: "No code spans here", code: false }]);
  });

  it("handles more than one code span", () => {
    expect(splitTitleSegments("`a` and `b`")).toEqual([
      { text: "a", code: true },
      { text: " and ", code: false },
      { text: "b", code: true },
    ]);
  });
});
