// OWNER: T1b (wave 1). "No ui component renders a shadow- class" (the t1b brief):
// elevation is one ink rung + a 1px hairline + the inset top highlight (design
// §3.6), never a drop shadow. Checked twice — on the rendered DOM of every
// primitive with its overlays held open, and on the component sources, together
// with the other banned patterns T0's generated files carried.
import "./dom-polyfills";
import fs from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchIcon } from "lucide-react";
import { Bar, BarChart } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastCard, Toaster, notifyWrite } from "@/components/ui/sonner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableSkeletonRows } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WEB_ROOT } from "./css-tree";

/** A class token that would draw a shadow: shadow, shadow-md, hover:shadow-lg, drop-shadow-*, inset-shadow-*, text-shadow-*. */
export const SHADOW_TOKEN = /^(?:[^:\s]+:)*!?-?(?:inset-|drop-|text-)?shadow(?:-\S*)?$/;

function classTokens(root: ParentNode): string[] {
  const tokens: string[] = [];
  for (const el of root.querySelectorAll("*")) {
    const cls = el.getAttribute("class");
    if (cls) tokens.push(...cls.split(/\s+/).filter(Boolean));
  }
  return tokens;
}

function Everything() {
  return (
    <TooltipProvider>
      <Button>RUN</Button>
      <Button variant="ghost" size="sm">
        DOCS
      </Button>
      <Button variant="quiet">CLEAR</Button>
      <Button variant="link">REPORT</Button>
      <Button variant="destructive">REVOKE</Button>
      <Button loading>RUN</Button>
      <Button disabled>RUN</Button>
      <Button variant="ghost" size="icon" aria-label="Search">
        <SearchIcon />
      </Button>
      <Badge>CORRECTNESS</Badge>
      <Badge variant="outline" kind="value">
        9c2d4b1
      </Badge>
      <Field label="Reason" hint="Required." error="Too short." required>
        <Textarea defaultValue="dup" />
      </Field>
      <Field label="Head SHA">
        <Input mono defaultValue="9c2d4b1" />
      </Field>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput placeholder="Filter" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>n=12</InputGroupText>
          <InputGroupButton aria-label="Clear">x</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <Select defaultValue="file" defaultOpen>
        <SelectTrigger aria-label="Scope">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="line">line</SelectItem>
          <SelectItem value="file">file</SelectItem>
        </SelectContent>
      </Select>
      <Tabs defaultValue="a">
        <TabsList aria-label="Charts">
          <TabsTrigger value="a">WEEKLY</TabsTrigger>
          <TabsTrigger value="b">CATEGORY</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel</TabsContent>
      </Tabs>
      <Toggle defaultPressed>WRAP</Toggle>
      <ToggleGroup type="single" defaultValue="d" aria-label="Density">
        <ToggleGroupItem value="d">32PX</ToggleGroupItem>
        <ToggleGroupItem value="c">26PX</ToggleGroupItem>
      </ToggleGroup>
      <KbdGroup>
        <Kbd>g</Kbd>
        <Kbd>f</Kbd>
      </KbdGroup>
      <Separator />
      <Skeleton className="h-3 w-10" />
      <ScrollArea className="h-10">
        <p>scroll</p>
      </ScrollArea>
      <Table density="compact">
        <TableCaption>ids</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>FIELD</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>tenant_id</TableCell>
          </TableRow>
          <TableSkeletonRows rows={2} columns={1} />
        </TableBody>
      </Table>
      <Tooltip open>
        <TooltipTrigger>tip</TooltipTrigger>
        <TooltipContent>Copy canonical URL</TooltipContent>
      </Tooltip>
      <Popover open>
        <PopoverTrigger>policy</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>What can block a merge</PopoverTitle>
          <PopoverDescription>Only proven findings can block a merge.</PopoverDescription>
        </PopoverContent>
      </Popover>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger>actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Finding</DropdownMenuLabel>
          <DropdownMenuItem>
            Copy<DropdownMenuShortcut>y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Show dropped</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="d">
            <DropdownMenuRadioItem value="d">32px rows</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem variant="destructive">Revoke</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress finding</DialogTitle>
            <DialogDescription>The reason goes into the audit chain.</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button>SUPPRESS</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Every filter lives in the URL.</SheetDescription>
          </SheetHeader>
          <SheetBody>body</SheetBody>
          <SheetFooter>
            <Button>APPLY</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Command>
        <CommandInput placeholder="Type a page" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem value="findings" checked>
              Findings<CommandShortcut>g f</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </Command>
      <CommandDialog open>
        <Command>
          <CommandInput placeholder="Type a page" />
          <CommandList>
            <CommandItem value="audit">Audit</CommandItem>
          </CommandList>
        </Command>
      </CommandDialog>
      <ToastCard tone="error" title="SUPPRESS REJECTED" body="POST /v1/findings/a/suppress · 422" onDismiss={() => undefined} />
      <ChartContainer config={{ floor: { label: "Band floor", color: "var(--chart-series)" } }} initialDimension={{ width: 320, height: 200 }}>
        <BarChart data={[{ band: "low", floor: 0.15 }]}>
          <Bar dataKey="floor" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <ChartContainer config={{ floor: { label: "Band floor" } }}>
        <ChartTooltipContent
          active
          payload={[{ name: "floor", dataKey: "floor", value: 0.55, color: "var(--chart-series)", graphicalItemId: "bar-floor", payload: { band: "high", floor: 0.55 } }]}
          label="high"
        />
      </ChartContainer>
      <Toaster />
    </TooltipProvider>
  );
}

describe("no ui component renders a shadow class", () => {
  it("holds for every primitive, with its overlays open", async () => {
    render(<Everything />);
    await act(async () => {
      notifyWrite({ tone: "success", title: "SUPPRESSION RECORDED", method: "POST", path: "/v1/findings/a/suppress", status: 201 });
      notifyWrite({ tone: "error", title: "SUPPRESS REJECTED", method: "POST", path: "/v1/findings/a/suppress", status: 422 });
    });
    await screen.findByText("SUPPRESSION RECORDED");
    // The overlays really are in the document (portaled to <body>).
    for (const slot of ["dialog-content", "sheet-content", "popover-content", "dropdown-menu-content", "select-content", "tooltip-content", "command-dialog-content"]) {
      expect(document.body.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
    const tokens = classTokens(document.body);
    expect(tokens.length).toBeGreaterThan(100);
    expect(tokens.filter((t) => SHADOW_TOKEN.test(t))).toEqual([]);
  });

  it("recognises every shadow spelling it guards against", () => {
    for (const t of ["shadow", "shadow-md", "shadow-modal", "hover:shadow-lg", "data-[state=open]:shadow-xl", "drop-shadow-sm", "inset-shadow-hi", "text-shadow-sm", "!shadow-none"]) {
      expect(SHADOW_TOKEN.test(t), t).toBe(true);
    }
    for (const t of ["ui-shadowless", "no-shadow", "hover-row"]) expect(SHADOW_TOKEN.test(t), t).toBe(false);
  });
});

describe("the component sources carry none of the banned patterns", () => {
  const dir = path.join(WEB_ROOT, "src/components/ui");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));

  /** String and template literal contents, comments removed. */
  function literals(source: string): string[] {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    return [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  }

  it("covers all 22 generated primitives plus Field", () => {
    for (const f of ["badge", "button", "chart", "command", "dialog", "dropdown-menu", "field", "input-group", "input", "kbd", "popover", "scroll-area", "select", "separator", "sheet", "skeleton", "sonner", "table", "tabs", "textarea", "toggle-group", "toggle", "tooltip"]) {
      expect(files).toContain(`${f}.tsx`);
    }
  });

  it.each(files)("%s: no shadow, pill, pulse, spinner, scrim-black or off-grid duration class", (file) => {
    const tokens = literals(fs.readFileSync(path.join(dir, file), "utf8")).flatMap((s) => s.split(/\s+/)).filter(Boolean);
    const banned = tokens.filter(
      (t) =>
        SHADOW_TOKEN.test(t) ||
        /^(?:[^:\s]+:)*(bg-black|bg-white|text-white|text-black)(\/\d+)?$/.test(t) ||
        /^(?:[^:\s]+:)*rounded-(full|3xl|4xl)$/.test(t) ||
        /^(?:[^:\s]+:)*animate-(pulse|spin|bounce|ping|in|out)$/.test(t) ||
        /^(?:[^:\s]+:)*(duration|delay)-\d+$/.test(t) ||
        /^(?:[^:\s]+:)*ease-(in|out|in-out|linear)$/.test(t) ||
        /^(?:[^:\s]+:)*(outline-none|outline-hidden|transition-all|backdrop-blur(-\w+)?)$/.test(t) ||
        /^(?:[^:\s]+:)*(fade|zoom|slide)-(in|out)(-\S+)?$/.test(t),
    );
    expect(banned).toEqual([]);
  });

  it.each(files)("%s: imports no spinner or checkmark glyph", (file) => {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const icons = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
    for (const icon of icons) expect(icon).not.toMatch(/Loader|Spinner|RefreshCw|RotateCw|Check|Circle|Sparkle|Bot|Brain|Shield/);
  });
});
