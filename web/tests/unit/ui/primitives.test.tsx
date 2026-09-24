// OWNER: T1b (wave 1). The smaller primitives: tabs (design §5.12, motion §4.2.3),
// badge (§5.4 base), toggle (motion §4.1.4), skeleton (ruling 5), kbd, separator,
// tooltip (§5.9) and the chart layer's number format (dashboard §7).
import "./dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants, resolveBadgeVariant } from "@/components/ui/badge";
import { formatChartValue } from "@/components/ui/chart";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger, indicatorTransform } from "@/components/ui/tabs";
import { Toggle, toggleVariants } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TOOLTIP_OPEN_DELAY_MS, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { declValue, parseCss, readWebFile } from "./css-tree";

const CSS = parseCss(readWebFile("src/styles/ui.css"));
const rect = (left: number, width: number) => ({ left, width, top: 0, height: 32, right: left + width, bottom: 32, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

describe("Tabs", () => {
  it("places the indicator in the list's own coordinates, scroll included", () => {
    expect(indicatorTransform(rect(10, 400), rect(50, 80), 0)).toBe("translateX(40px) scaleX(80)");
    expect(indicatorTransform(rect(10, 400), rect(50, 80.456), 24)).toBe("translateX(64px) scaleX(80.46)");
  });

  it("is a tablist with one selected tab, a decorative indicator and a panel that swaps", async () => {
    render(
      <Tabs defaultValue="weekly">
        <TabsList aria-label="Accuracy charts">
          <TabsTrigger value="weekly">WEEKLY</TabsTrigger>
          <TabsTrigger value="category">BY CATEGORY</TabsTrigger>
        </TabsList>
        <TabsContent value="weekly">Proof-state composition by week.</TabsContent>
        <TabsContent value="category">Human dismissal rate per category.</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole("tablist", { name: "Accuracy charts" });
    expect(list.querySelector('[data-slot="tabs-indicator"]')).toHaveAttribute("aria-hidden", "true");
    const [weekly, category] = screen.getAllByRole("tab");
    expect(weekly).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Proof-state composition by week.");
    await userEvent.click(category);
    expect(category).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Human dismissal rate per category.");
  });

  it("moves between tabs with the arrow keys (roving focus)", async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections">
          <TabsTrigger value="a">CLAIM</TabsTrigger>
          <TabsTrigger value="b">PROOF</TabsTrigger>
        </TabsList>
        <TabsContent value="a">a</TabsContent>
        <TabsContent value="b">b</TabsContent>
      </Tabs>,
    );
    await userEvent.tab();
    expect(screen.getByRole("tab", { name: "CLAIM" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "PROOF" })).toHaveFocus();
  });

  it("styles tabs per design §5.12: 32px, 11px mono caps, a solid 2px --signal bar sliding in 180ms", () => {
    expect(declValue(CSS, ".ui-tabs__trigger", "height")).toBe("32px");
    expect(declValue(CSS, ".ui-tabs__trigger", "color")).toBe("var(--text-dim)");
    expect(declValue(CSS, '.ui-tabs__trigger[data-state="active"]', "color")).toBe("var(--text-primary)");
    expect(declValue(CSS, ".ui-tabs__indicator", "height")).toBe("2px");
    expect(declValue(CSS, ".ui-tabs__indicator", "background-color")).toBe("var(--signal)");
    expect(declValue(CSS, '.ui-tabs__list[data-indicator="ready"] > .ui-tabs__indicator', "transition")).toBe("transform var(--ui-slide-dur) var(--ease-snap)");
    expect(readWebFile("src/styles/ui.css")).toMatch(/--ui-slide-dur: var\(--dur-2\);/);
  });

  it("scrolls an over-wide list instead of widening the page, with an inset focus ring", () => {
    expect(declValue(CSS, ".ui-tabs__list", "overflow-x")).toBe("auto");
    expect(declValue(CSS, ".ui-tabs", "min-width")).toBe("0");
    expect(declValue(CSS, '.ui-tabs__trigger:is(:focus-visible, [data-force~="focus"])', "outline-offset")).toBe("-2px");
  });
});

describe("Badge", () => {
  it("is a neutral rectangular chip; never a pill", () => {
    render(<Badge>CORRECTNESS</Badge>);
    const badge = screen.getByText("CORRECTNESS");
    expect(badge).toHaveClass("ui-badge");
    expect(badge.className).not.toMatch(/rounded|pill|shadow/);
    expect(declValue(CSS, ".ui-badge", "border-radius")).toBe("var(--radius-data)");
    expect(declValue(CSS, ".ui-badge", "padding")).toBe("0 6px");
  });

  it("maps the shadcn variants and keeps a value's case", () => {
    expect(resolveBadgeVariant("default")).toBe("neutral");
    expect(resolveBadgeVariant("secondary")).toBe("neutral");
    expect(resolveBadgeVariant("ghost")).toBe("outline");
    expect(badgeVariants({ variant: "outline", kind: "value" })).toBe("ui-badge ui-badge--outline ui-badge--value");
    expect(declValue(CSS, ".ui-badge--value", "text-transform")).toBe("none");
  });

  it("renders a link as the chip with asChild", () => {
    render(
      <Badge asChild kind="value">
        <a href="#sha">base 7c41a09</a>
      </Badge>,
    );
    expect(screen.getByRole("link", { name: "base 7c41a09" })).toHaveClass("ui-badge", "ui-badge--value");
  });
});

describe("Toggle and ToggleGroup", () => {
  it("presses into level 4 with a shape, not colour alone", async () => {
    render(<Toggle aria-label="Wrap lines">WRAP</Toggle>);
    const toggle = screen.getByRole("button", { name: "Wrap lines" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("data-state", "on");
    expect(declValue(CSS, '.ui-toggle[data-state="on"]', "background-color")).toBe("var(--ink-4)");
    expect(declValue(CSS, '.ui-toggle[data-state="on"]', "border-color")).toBe("var(--ink-7)");
    expect(declValue(CSS, '.ui-toggle[data-state="on"]::after', "height")).toBe("2px");
  });

  it("uses the quiet control hover and the design's sizes", () => {
    expect(toggleVariants()).toBe("ui-toggle hover-quiet");
    expect(toggleVariants({ variant: "outline", size: "sm" })).toBe("ui-toggle hover-quiet ui-toggle--outline ui-toggle--sm");
    expect(declValue(CSS, ".ui-toggle", "height")).toBe("32px");
    expect(declValue(CSS, ".ui-toggle--sm", "height")).toBe("26px");
  });

  it("joins a single-choice group as radios", async () => {
    render(
      <ToggleGroup type="single" defaultValue="default" aria-label="Row density">
        <ToggleGroupItem value="default">32PX</ToggleGroupItem>
        <ToggleGroupItem value="compact">26PX</ToggleGroupItem>
      </ToggleGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Row density" });
    expect(group).toHaveAttribute("data-spacing", "0");
    const compact = screen.getByRole("radio", { name: "26PX" });
    await userEvent.click(compact);
    expect(compact).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "32PX" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("Skeleton, Kbd, Separator", () => {
  it("renders a skeleton as a static, hidden block", () => {
    const { container } = render(<Skeleton className="h-3 w-40" />);
    const block = container.firstElementChild!;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.className).toBe("ui-skeleton h-3 w-40");
  });

  it("renders a key cap in 11px mono on a 1px rule-2 border", () => {
    render(
      <KbdGroup>
        <Kbd>g</Kbd>
        <Kbd>f</Kbd>
      </KbdGroup>,
    );
    expect(screen.getByText("g").tagName).toBe("KBD");
    expect(declValue(CSS, ".ui-kbd", "border")).toBe("1px solid var(--rule-2)");
    expect(declValue(CSS, ".ui-kbd", "font-size")).toBe("var(--fs-label)");
    expect(declValue(CSS, ".ui-kbd", "font-family")).toBe("var(--font-mono)");
  });

  it("draws a decorative --rule-hair separator by default", () => {
    const { container } = render(<Separator />);
    const sep = container.firstElementChild!;
    expect(sep).toHaveAttribute("role", "none");
    expect(sep).toHaveAttribute("data-orientation", "horizontal");
    expect(declValue(CSS, ".ui-separator", "background-color")).toBe("var(--rule-hair)");
  });
});

describe("Tooltip", () => {
  it("opens after the design's 400ms delay", () => {
    expect(TOOLTIP_OPEN_DELAY_MS).toBe(400);
  });

  it("renders ink-2 on rule-2, 13px Inter, no shadow — and names the trigger's description", async () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>copy</TooltipTrigger>
          <TooltipContent>Copy canonical URL</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy canonical URL");
    expect(declValue(CSS, ".ui-tooltip", "background-color")).toBe("var(--ink-2)");
    expect(declValue(CSS, ".ui-tooltip", "border")).toBe("1px solid var(--rule-2)");
    expect(declValue(CSS, ".ui-tooltip", "max-width")).toBe("260px");
    expect(declValue(CSS, ".ui-tooltip", "box-shadow")).toBeUndefined();
  });
});

describe("formatChartValue", () => {
  it("prints integers verbatim and every other number at 3 decimals", () => {
    expect(formatChartValue(312)).toBe("312");
    expect(formatChartValue(0.81)).toBe("0.810");
    expect(formatChartValue(0.55)).toBe("0.550");
    expect(formatChartValue([0.1, 0.25])).toBe("0.100 – 0.250");
    expect(formatChartValue("proven")).toBe("proven");
  });
});
