"use client";

// OWNER: T1b (wave 1). /lab/t1b — every primitive in every state, on both
// data-surface values. A forced state (data-force="hover" | "focus" | "active")
// applies exactly the declarations of the real pseudo-class (src/styles/ui.css),
// so a still image carries it. Mono readouts are measured in the browser.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CopyIcon, DownloadIcon, GitCommitHorizontalIcon } from "lucide-react";
import { SEVERITY_THRESHOLDS } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { Button, LoadingEllipsis } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Command } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastCard, formatEndpoint } from "@/components/ui/sonner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableSkeletonRows } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortHash, shortSha } from "./format";
import type { LabData } from "./lab-data";
import { FiltersSheetBody, PaletteRoot, SuppressDialogBody } from "./parts";
import { Readout } from "./readout";

type Surface = "app" | "marketing";
const SURFACES: Surface[] = ["app", "marketing"];

// The graph paper, re-derived per surface from --grid (0.018 app / 0.028 marketing).
const PAPER: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
};

// Lab-only: statically-open popper content flows inline in its specimen box,
// and a contained box is the containing block for a fixed dialog or sheet.
const LAB_CSS = `
.lab-inline [data-radix-popper-content-wrapper] { position: relative !important; transform: none !important; inset: auto !important; min-width: 0 !important; visibility: visible !important; order: 1; }
.lab-contain { position: relative; contain: layout paint; }
`;

function Section({ id, index, title, note, children }: { id: string; index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-t border-rule-1 py-10">
      <h2 id={`${id}-title`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <p className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SurfacePair({ children }: { children: (surface: Surface) => ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {SURFACES.map((surface) => (
        <div key={surface} data-surface={surface} className="min-w-0 rounded-panel border border-rule-1 bg-ink-0 p-4 md:p-5" style={PAPER}>
          <p className="type-data text-text-dim">data-surface=&quot;{surface}&quot;</p>
          <div className="mt-4 flex flex-col gap-6">{children(surface)}</div>
        </div>
      ))}
    </div>
  );
}

function State({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ""}`}>
      <span className="type-label text-text-dim">{label}</span>
      <div className="flex min-h-8 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="type-data text-text-body">{label}</span>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4">{children}</div>
    </div>
  );
}

function Measured({ label, target, metric }: { label: string; target: string; metric: "height" | "transition" }) {
  return (
    <p className="type-data text-text-dim">
      {label} <Readout target={target} metric={metric} className="type-data text-text-primary" />
    </p>
  );
}

/* ---------- 01 · the hover language ------------------------------------ */

function HoverSection({ data }: { data: LabData }) {
  return (
    <Section
      id="hover"
      index="01"
      title="Hover language"
      note="Six classes, one duration. Rows and ghost controls step exactly one ink rung, primary gains one lightness step, links draw a 1px rule. Nothing lifts, scales, glows or gains a shadow."
    >
      <SurfacePair>
        {(s) => (
          <>
            <StateRow label="A · hover-frame — evidence frames (the marks are <Exhibit>'s)">
              {(["rest", "hover"] as const).map((f) => (
                <State key={f} label={f}>
                  <div data-force={f === "hover" ? "hover" : undefined} data-measure={f === "rest" ? `frame-${s}` : undefined} className="hover-frame flex h-12 w-40 items-center rounded-panel border border-rule-1 bg-ink-2 px-3">
                    <span className="type-data text-text-body">rule-1 → rule-2</span>
                  </div>
                </State>
              ))}
            </StateRow>
            <StateRow label="B · hover-surface — cards · hover-row — rows on an ink-2 panel">
              {(["rest", "hover"] as const).map((f) => (
                <State key={f} label={f}>
                  <div data-force={f === "hover" ? "hover" : undefined} className="hover-surface flex h-12 w-40 items-center rounded-panel border border-rule-1 bg-ink-2 px-3">
                    <span className="type-data text-text-body">ink-2 → ink-3</span>
                  </div>
                </State>
              ))}
              <State label="rows">
                <div className="w-44 rounded-panel border border-rule-1 bg-ink-2 py-1">
                  {["rest", "hover", "rest"].map((f, i) => (
                    <div key={i} data-force={f === "hover" ? "hover" : undefined} data-measure={i === 1 ? `row-${s}` : undefined} className="hover-row flex h-8 items-center px-3">
                      <span className="type-data text-text-body">{f}</span>
                    </div>
                  ))}
                </div>
              </State>
            </StateRow>
            <StateRow label="C · hover-ghost · hover-quiet · hover-primary — controls (press 0.5px)">
              {(["rest", "hover", "active"] as const).map((f) => (
                <State key={f} label={f}>
                  <button type="button" data-force={f === "rest" ? undefined : f} data-measure={f === "active" ? `press-${s}` : undefined} className="hover-ghost inline-flex h-8 items-center rounded-data border border-rule-2 px-4 type-label text-text-body">
                    Ghost
                  </button>
                  <button type="button" data-force={f === "rest" ? undefined : f} className="hover-quiet inline-flex h-8 items-center rounded-data px-4 type-label text-text-dim">
                    Quiet
                  </button>
                  <button type="button" data-force={f === "rest" ? undefined : f} data-measure={f === "rest" ? `primary-${s}` : undefined} className="hover-primary inline-flex h-8 items-center rounded-data bg-signal px-4 type-label text-ink-0">
                    Primary
                  </button>
                </State>
              ))}
            </StateRow>
            <StateRow label="D · link-draw — single line · link-prose — inside a sentence">
              {(["rest", "hover"] as const).map((f) => (
                <State key={f} label={f}>
                  <a href="#hover" data-force={f === "hover" ? "hover" : undefined} data-measure={f === "rest" ? `link-${s}` : undefined} className="link-draw type-data">
                    {data.ids.reproTestPath}
                  </a>
                </State>
              ))}
              <State label="prose" className="max-w-72">
                <p className="type-small text-text-body">
                  The sandbox ran{" "}
                  <a href="#hover" className="link-prose">
                    {data.ids.failingTest}
                  </a>{" "}
                  at {shortSha(data.ids.headSha)}.
                </p>
              </State>
            </StateRow>
            <StateRow label="E · hover-atom — hashes, SHAs, file:line (a copy cursor)">
              {(["rest", "hover"] as const).map((f) => (
                <State key={f} label={f}>
                  <span data-force={f === "hover" ? "hover" : undefined} title={data.ids.provenFindingId} className="hover-atom px-1 type-data text-text-body">
                    {shortHash(data.ids.provenFindingId)}
                  </span>
                </State>
              ))}
              <State label="F · inert">
                <span className="type-label text-text-dim">no hover</span>
              </State>
            </StateRow>
            <div className="flex flex-col gap-1">
              <Measured label="frame" target={`frame-${s}`} metric="transition" />
              <Measured label="row" target={`row-${s}`} metric="transition" />
              <Measured label="primary" target={`primary-${s}`} metric="transition" />
              <Measured label="ghost :active" target={`press-${s}`} metric="transition" />
              <Measured label="link colour" target={`link-${s}`} metric="transition" />
            </div>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 02 · button -------------------------------------------------- */

const BUTTON_VARIANTS = [
  { variant: "primary", label: "Run →" },
  { variant: "ghost", label: "Docs" },
  { variant: "quiet", label: "Clear" },
  { variant: "link", label: "Report →" },
  { variant: "destructive", label: "Revoke" },
] as const;

const BUTTON_STATES = ["rest", "hover", "focus", "active", "disabled", "loading"] as const;

function ButtonSection() {
  return (
    <Section
      id="button"
      index="02"
      title="Button"
      note="Labels are 11px mono caps. A destructive action is a ghost with alarm text, never a red fill. Loading holds the label's width and types a stepped ellipsis; there is no spinner."
    >
      <SurfacePair>
        {(s) => (
          <>
            {BUTTON_VARIANTS.map(({ variant, label }) => (
              <StateRow key={variant} label={variant}>
                {BUTTON_STATES.map((state) => (
                  <State key={state} label={state}>
                    <Button
                      variant={variant}
                      size="sm"
                      data-force={state === "hover" || state === "focus" || state === "active" ? state : undefined}
                      disabled={state === "disabled"}
                      loading={state === "loading"}
                    >
                      {label}
                    </Button>
                  </State>
                ))}
              </StateRow>
            ))}
            <StateRow label="sizes">
              <State label="sm 26">
                <Button size="sm" data-measure={`btn-sm-${s}`}>
                  Run →
                </Button>
              </State>
              <State label="md 32">
                <Button data-measure={`btn-md-${s}`}>Run a review →</Button>
              </State>
              <State label="lg 40">
                <Button size="lg" data-measure={`btn-lg-${s}`}>
                  Run a review →
                </Button>
              </State>
              <State label="icon-sm · icon">
                <Button variant="ghost" size="icon-sm" aria-label="Copy the head SHA">
                  <CopyIcon strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Download the raw output">
                  <DownloadIcon strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </State>
              <State label="with glyph">
                <Button variant="ghost" size="sm">
                  <DownloadIcon strokeWidth={1.5} aria-hidden="true" />
                  Raw output
                </Button>
              </State>
            </StateRow>
            <div className="flex flex-col gap-1">
              <Measured label="height sm" target={`btn-sm-${s}`} metric="height" />
              <Measured label="height md" target={`btn-md-${s}`} metric="height" />
              <Measured label="height lg" target={`btn-lg-${s}`} metric="height" />
            </div>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 03 · input, textarea, select ------------------------------- */

function InputSection({ data }: { data: LabData }) {
  return (
    <Section
      id="input"
      index="03"
      title="Input, textarea, select"
      note="A meaning-bearing 1px ink-7 outline (3.03:1). Focus adds the 2px signal-hi ring; an error flips the border in 0ms and carries a glyph and text, wired through aria-describedby."
    >
      <SurfacePair>
        {() => (
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Pull request">
              <Input placeholder="owner/repo#42 or a pull request URL" />
            </Field>
            <Field label="Pull request · hover">
              <Input data-force="hover" placeholder="owner/repo#42 or a pull request URL" />
            </Field>
            <Field label="Head SHA · focus · mono" hint="The full 40 characters; copy it from the run.">
              <Input data-force="focus" mono defaultValue={data.ids.headSha} />
            </Field>
            <Field label="Base SHA · disabled">
              <Input mono disabled defaultValue={data.ids.baseSha} />
            </Field>
            <Field label="Reason" hint="Required. At least 8 characters." error="3 characters. A reason needs 8." required>
              <Textarea defaultValue="dup" />
            </Field>
            <Field label="Scope">
              <Select defaultValue={data.suppressScopes[1]}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.suppressScopes.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      <span className="type-data">{scope}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap items-end gap-4 md:col-span-2">
              <State label="select · hover">
                <Select defaultValue={data.suppressScopes[0]}>
                  <SelectTrigger data-force="hover">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.suppressScopes.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </State>
              <State label="select · focus">
                <Select>
                  <SelectTrigger data-force="focus">
                    <SelectValue placeholder="Scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.suppressScopes.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </State>
              <State label="select · sm · disabled">
                <Select disabled defaultValue={data.suppressScopes[2]}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.suppressScopes.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </State>
            </div>
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 04 · badge and kbd ------------------------------------------ */

function BadgeSection({ data }: { data: LabData }) {
  return (
    <Section
      id="badge"
      index="04"
      title="Badge and kbd"
      note="A neutral rectangular chip: 20px, 2px radius, 11px mono caps. A value keeps its case and zero tracking. Proof, severity and gate chips carry state and belong to the semantic badge track."
    >
      <SurfacePair>
        {() => (
          <>
            <StateRow label="badge · label (Finding.category)">
              <State label="neutral">
                <Badge>{data.categories[0].replace(/_/g, " ")}</Badge>
              </State>
              <State label="outline">
                <Badge variant="outline">{data.categories[2].replace(/_/g, " ")}</Badge>
              </State>
              <State label="neutral · pr">
                <Badge>PR #{data.ids.prNumber}</Badge>
              </State>
            </StateRow>
            <StateRow label="badge · value (case kept, tracking 0)">
              <State label="glyph">
                <Badge kind="value" title={data.ids.headSha}>
                  <GitCommitHorizontalIcon strokeWidth={1.5} aria-hidden="true" />
                  {shortSha(data.ids.headSha)}
                </Badge>
              </State>
              <State label="outline">
                <Badge kind="value" variant="outline">
                  {data.ids.repository}
                </Badge>
              </State>
              <State label="link · hover">
                <Badge asChild kind="value" data-force="hover">
                  <a href="#badge">base {shortSha(data.ids.baseSha)}</a>
                </Badge>
              </State>
              <State label="link · focus">
                <Badge asChild kind="value" variant="outline" data-force="focus">
                  <a href="#badge">head {shortSha(data.ids.headSha)}</a>
                </Badge>
              </State>
            </StateRow>
            <StateRow label="kbd">
              <State label="palette">
                <Kbd>⌘K</Kbd>
              </State>
              <State label="sequence">
                <KbdGroup>
                  <Kbd>g</Kbd>
                  <Kbd>o</Kbd>
                </KbdGroup>
              </State>
              <State label="rows">
                <KbdGroup>
                  <Kbd>j</Kbd>
                  <Kbd>k</Kbd>
                </KbdGroup>
              </State>
              <State label="filter · density">
                <Kbd>/</Kbd>
                <Kbd>.</Kbd>
              </State>
              <State label="close · confirm">
                <Kbd>Esc</Kbd>
                <Kbd>⌘Enter</Kbd>
              </State>
            </StateRow>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 05 · tabs ----------------------------------------------------- */

const ACCURACY_CHARTS = [
  { value: "weekly", label: "Weekly", text: "Proof-state composition by week, as a 100% stacked area with four bands." },
  { value: "category", label: "By category", text: "Human dismissal rate per category, sorted descending, with n printed on every bar." },
  { value: "calibration", label: "Calibration", text: "Predicted band against the observed addressed rate, with a Wilson interval per point." },
] as const;

function TabsSection() {
  return (
    <Section
      id="tabs"
      index="05"
      title="Tabs"
      note="One 2px signal bar slides between tabs with transform only; panels swap in 0ms. The first paint draws the bar on the selected tab itself."
    >
      <SurfacePair>
        {() => (
          <>
            <Tabs defaultValue="weekly">
              <TabsList aria-label="Accuracy charts">
                {ACCURACY_CHARTS.map((c) => (
                  <TabsTrigger key={c.value} value={c.value}>
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ACCURACY_CHARTS.map((c) => (
                <TabsContent key={c.value} value={c.value}>
                  <p className="type-small text-text-body">{c.text}</p>
                </TabsContent>
              ))}
            </Tabs>
            <StateRow label="forced states">
              <Tabs defaultValue="selected">
                <TabsList aria-label="Tab states">
                  <TabsTrigger value="rest">Rest</TabsTrigger>
                  <TabsTrigger value="hover" data-force="hover">
                    Hover
                  </TabsTrigger>
                  <TabsTrigger value="focus" data-force="focus">
                    Focus
                  </TabsTrigger>
                  <TabsTrigger value="selected">Selected</TabsTrigger>
                  <TabsTrigger value="disabled" disabled>
                    Disabled
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </StateRow>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 06 · toggle and toggle group -------------------------------- */

function ToggleSection() {
  return (
    <Section
      id="toggle"
      index="06"
      title="Toggle and toggle group"
      note="On is level 4 (ink-4, ink-7 border) plus the 2px signal bar a selected tab carries, so the state is a shape as well as a colour."
    >
      <SurfacePair>
        {() => (
          <>
            <StateRow label="toggle · outline">
              <State label="off">
                <Toggle variant="outline">Wrap</Toggle>
              </State>
              <State label="off · hover">
                <Toggle variant="outline" data-force="hover">
                  Wrap
                </Toggle>
              </State>
              <State label="on">
                <Toggle variant="outline" defaultPressed>
                  Wrap
                </Toggle>
              </State>
              <State label="on · focus">
                <Toggle variant="outline" defaultPressed data-force="focus">
                  Wrap
                </Toggle>
              </State>
              <State label="disabled">
                <Toggle variant="outline" disabled>
                  Wrap
                </Toggle>
              </State>
              <State label="default · sm">
                <Toggle size="sm">Raw</Toggle>
                <Toggle size="sm" defaultPressed>
                  Rich
                </Toggle>
              </State>
            </StateRow>
            <StateRow label="toggle group · single · joined">
              <State label="density">
                <ToggleGroup type="single" defaultValue="default" aria-label="Row density">
                  <ToggleGroupItem value="default">32px</ToggleGroupItem>
                  <ToggleGroupItem value="compact">26px</ToggleGroupItem>
                </ToggleGroup>
              </State>
              <State label="hover on the second">
                <ToggleGroup type="single" defaultValue="default" aria-label="Row density, hover forced">
                  <ToggleGroupItem value="default">32px</ToggleGroupItem>
                  <ToggleGroupItem value="compact" data-force="hover">
                    26px
                  </ToggleGroupItem>
                </ToggleGroup>
              </State>
              <State label="spacing 2 · sm">
                <ToggleGroup type="multiple" spacing={2} size="sm" defaultValue={["proof"]} aria-label="Sections">
                  <ToggleGroupItem value="claim">Claim</ToggleGroupItem>
                  <ToggleGroupItem value="proof">Proof</ToggleGroupItem>
                  <ToggleGroupItem value="audit">Audit</ToggleGroupItem>
                </ToggleGroup>
              </State>
            </StateRow>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 07 · table --------------------------------------------------- */

function IdsTable({ data, density, surface, forced }: { data: LabData; density: "default" | "compact"; surface: Surface; forced?: boolean }) {
  return (
    <Table density={density} containerClassName="rounded-panel border border-rule-1">
      <TableCaption>public/fixtures/manifest.json → ids · {density === "default" ? "32px" : "26px"} rows</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Form</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.slice(0, 6).map((row, i) => (
          <TableRow
            key={row.field}
            data-measure={i === 0 ? `tr-${density}-${surface}` : undefined}
            data-state={forced && i === 2 ? "selected" : undefined}
            data-force={forced && i === 1 ? "hover" : forced && i === 3 ? "focus" : undefined}
          >
            <TableCell className="text-text-dim">{row.field}</TableCell>
            <TableCell className="text-text-primary">{row.form}</TableCell>
            <TableCell>{row.value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ScrolledTable({ data }: { data: LabData }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = ref.current?.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (wrap) wrap.scrollTop = 44; // rows pass under the sticky header in the screenshot
  }, []);
  return (
    <div ref={ref}>
      <Table containerClassName="max-h-[168px] rounded-panel border border-rule-1">
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.field}>
              <TableCell kind="prose">{row.field.replace(/_/g, " ")}</TableCell>
              <TableCell>{row.form}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TableSection({ data }: { data: LabData }) {
  return (
    <Section
      id="table"
      index="07"
      title="Table"
      note="32px rows, 26px compact, hairline separators, never zebra. Row hover steps ink-2 to ink-3; selected is ink-4 with a 2px signal-lo rail; a roving-focus row gets an inset ring. The header is solid ink-2 and sticks."
    >
      <SurfacePair>
        {(s) => (
          <>
            <State label="default · hover (row 2) · selected (row 3) · focus (row 4)" className="w-full">
              <div className="w-full min-w-0">
                <IdsTable data={data} density="default" surface={s} forced />
              </div>
            </State>
            <State label="compact" className="w-full">
              <div className="w-full min-w-0">
                <IdsTable data={data} density="compact" surface={s} />
              </div>
            </State>
            <div className="flex flex-col gap-1">
              <Measured label="tr height · default" target={`tr-default-${s}`} metric="height" />
              <Measured label="tr height · compact" target={`tr-compact-${s}`} metric="height" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <State label="sticky header · scrolled 44px" className="w-full">
                <div className="w-full min-w-0">
                  <ScrolledTable data={data} />
                </div>
              </State>
              <State label="loading · 4 skeleton rows" className="w-full">
                <div className="w-full min-w-0">
                  <Table containerClassName="rounded-panel border border-rule-1">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Form</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableSkeletonRows rows={4} columns={3} />
                    </TableBody>
                  </Table>
                </div>
              </State>
            </div>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 08 · skeleton, separator, scroll area ----------------------- */

function BlocksSection({ data }: { data: LabData }) {
  return (
    <Section
      id="blocks"
      index="08"
      title="Skeleton, separator, scroll area"
      note="A skeleton is a static block one rung above its container, sized to what it stands in for. No shimmer, no pulse. Separators are rule-hair. The scroll thumb is a thin ink-6 bar."
    >
      <SurfacePair>
        {() => (
          <div className="grid gap-6 md:grid-cols-2">
            <State label="skeleton · on the page" className="w-full">
              <div className="flex w-full flex-col gap-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            </State>
            <State label="skeleton · on an ink-2 panel" className="w-full">
              <div className="flex w-full flex-col gap-2 rounded-panel border border-rule-1 bg-ink-2 p-3 [--ui-skeleton:var(--ink-3)]">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-8 w-full" />
              </div>
            </State>
            <State label="separator · vertical and horizontal" className="w-full md:col-span-2">
              <div className="flex w-full flex-col gap-3">
                <div className="flex h-5 items-center gap-3 whitespace-nowrap type-data text-text-body">
                  <span>base {shortSha(data.ids.baseSha)}</span>
                  <Separator orientation="vertical" />
                  <span>head {shortSha(data.ids.headSha)}</span>
                </div>
                <Separator />
                <span className="type-data text-text-dim">{data.ids.repository}</span>
              </div>
            </State>
            <State label="scroll area · the API's operations" className="w-full md:col-span-2">
              <ScrollArea type="always" className="h-40 w-full rounded-panel border border-rule-1 bg-ink-1">
                <ul className="p-3">
                  {data.operations.map((op) => (
                    <li key={op} className="type-data py-1 text-text-body">
                      {op}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </State>
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 09 · tooltip, popover, dropdown menu ------------------------ */

function useContainer() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  return [node, setNode] as const;
}

function InlineOverlays({ data }: { data: LabData }) {
  const [tipBox, setTipBox] = useContainer();
  const [valueBox, setValueBox] = useContainer();
  const [popBox, setPopBox] = useContainer();
  const [menuBox, setMenuBox] = useContainer();
  const [density, setDensity] = useState("default");
  const [dropped, setDropped] = useState(true);

  // A statically-open menu focuses itself on mount; hand focus back to the page.
  useEffect(() => {
    if (!menuBox) return;
    const id = requestAnimationFrame(() => {
      if (menuBox.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    });
    return () => cancelAnimationFrame(id);
  }, [menuBox]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <State label="tooltip · prose" className="w-full">
        <div ref={setTipBox} className="lab-inline flex flex-col items-start gap-2">
          {tipBox ? (
            <Tooltip open>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Copy canonical URL">
                  <CopyIcon strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent container={tipBox} side="bottom">
                Copy canonical URL <Kbd>y</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </State>
      <State label="tooltip · value" className="w-full">
        <div ref={setValueBox} className="lab-inline flex flex-col items-start gap-2">
          {valueBox ? (
            <Tooltip open>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="hover-atom px-1 type-data text-text-body">
                  {shortHash(data.ids.provenFindingId)}
                </span>
              </TooltipTrigger>
              <TooltipContent container={valueBox} side="bottom" variant="value">
                {data.ids.provenFindingId}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </State>
      <State label="popover" className="w-full">
        <div ref={setPopBox} className="lab-inline flex flex-col items-start gap-1">
          {popBox ? (
            <Popover open>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" aria-expanded>
                  Gate policy
                </Button>
              </PopoverTrigger>
              <PopoverContent container={popBox} align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <PopoverTitle>What can block a merge</PopoverTitle>
                <PopoverDescription>Only proven findings can block a merge. Everything else is a comment.</PopoverDescription>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </State>
      <State label="dropdown menu · hover (row 1) · focus (row 2)" className="w-full">
        <div ref={setMenuBox} className="lab-inline flex flex-col items-start gap-1">
          {menuBox ? (
            <DropdownMenu open modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent container={menuBox} className="w-64">
                <DropdownMenuLabel>
                  Finding <span className="normal-case tracking-normal">{data.ids.provenFindingId.slice(0, 8)}</span>
                </DropdownMenuLabel>
                <DropdownMenuItem data-force="hover">
                  Copy canonical URL<DropdownMenuShortcut>y</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem data-force="focus">
                  Export evidence…<DropdownMenuShortcut>e</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={dropped} onCheckedChange={(v) => setDropped(v === true)}>
                  Show dropped findings
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={false}>Show suppressed findings</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Density</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                  <DropdownMenuRadioItem value="default">32px rows</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">26px rows</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Revoke suppression</DropdownMenuItem>
                <DropdownMenuItem disabled>Re-run review</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </State>
    </div>
  );
}

function OverlaySection({ data }: { data: LabData }) {
  return (
    <Section
      id="overlays"
      index="09"
      title="Tooltip, popover, dropdown menu"
      note="Held open and set inline for the still image. Tooltip: ink-2 on rule-2, 13px Inter, 400ms open delay, 180ms enter. Popover and menu: ink-3 with the inset highlight, scaleY from the trigger edge, no shadow. Selection marks are squares, never checkmarks."
    >
      <SurfacePair>{() => <InlineOverlays data={data} />}</SurfacePair>
    </Section>
  );
}

/* ---------- 10 · dialog and sheet --------------------------------------- */

function ContainedDialog({ data }: { data: LabData }) {
  const [box, setBox] = useContainer();
  return (
    <div ref={setBox} className="lab-contain h-[560px] w-full overflow-hidden rounded-panel border border-rule-1 bg-ink-0 md:h-[480px]" style={PAPER}>
      <PageBehind />
      <div className="ui-scrim" />
      {box ? (
        <Dialog open modal={false}>
          <DialogContent container={box} onOpenAutoFocus={(e) => e.preventDefault()}>
            <SuppressDialogBody data={data} reason="dup" />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function ContainedSheet({ data }: { data: LabData }) {
  const [box, setBox] = useContainer();
  return (
    <div ref={setBox} className="lab-contain h-[560px] w-full overflow-hidden rounded-panel border border-rule-1 bg-ink-0 md:h-[480px]" style={PAPER}>
      <PageBehind />
      <div className="ui-scrim" />
      {box ? (
        <Sheet open modal={false}>
          <SheetContent container={box} onOpenAutoFocus={(e) => e.preventDefault()}>
            <FiltersSheetBody data={data} />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Stand-in page content behind the scrim, so the scrim has something to dim. */
function PageBehind() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 p-5">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-3 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-3 w-52" />
    </div>
  );
}

function ModalSection({ data }: { data: LabData }) {
  return (
    <Section
      id="modal"
      index="10"
      title="Dialog and sheet"
      note="Each is held open inside its frame. Dialog: ink-1, rule-2, 4px radius, the inset highlight, no shadow, 180ms. Sheet: right side only, for filter panels and the suppression form below 1024px, never finding detail. The live buttons at the top open the modal, portaled versions."
    >
      <SurfacePair>
        {() => (
          <div className="grid gap-4 md:grid-cols-2">
            <State label="dialog · error state" className="w-full">
              <ContainedDialog data={data} />
            </State>
            <State label="sheet · filters" className="w-full">
              <ContainedSheet data={data} />
            </State>
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 11 · command palette ---------------------------------------- */

/**
 * cmdk scrolls its selected item into view on mount (scrollIntoView, block
 * "nearest"). In the product the palette sits in a fixed, in-view dialog, so
 * nothing moves; an inline specimen below the fold would drag the window down.
 * cmdk runs that scroll in a synchronous follow-up render, so the window is put
 * back on the next frame, to where it stood when this specimen first rendered.
 */
function InlinePalette() {
  const scrollY = useRef(typeof window === "undefined" ? 0 : window.scrollY);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (window.scrollY !== scrollY.current) window.scrollTo({ top: scrollY.current, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="ui-palette" data-inline="">
      <Command>
        <PaletteRoot />
      </Command>
    </div>
  );
}

function PaletteSection() {
  return (
    <Section
      id="palette"
      index="11"
      title="Command palette"
      note="ink-1 at 92% behind a 16px blur: one of the two backdrop-filter surfaces in the product. The selected item is ink-3 with a 2px signal bar; a current choice is a filled square, never a checkmark."
    >
      <SurfacePair>
        {() => (
          <div className="max-w-[560px]">
            <InlinePalette />
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 12 · toast ---------------------------------------------------- */

function ToastSection({ data }: { data: LabData }) {
  const e = data.endpoints;
  return (
    <Section
      id="toast"
      index="12"
      title="Toast"
      note="Write outcomes only. The tone is a 2px bar and the title; the body is the endpoint and the status code it answered. An error stays until it is dismissed. The live T key sends three through the real toaster."
    >
      <SurfacePair>
        {() => (
          <div className="flex flex-col gap-3">
            <ToastCard tone="success" title="Suppression recorded" body={formatEndpoint(e.suppressCreated)} />
            <ToastCard tone="info" title="Re-run requested" body={formatEndpoint(e.rerunAccepted)} />
            <ToastCard tone="caution" title="Suppression revoked" body={formatEndpoint(e.revoke)} />
            <ToastCard tone="error" title="Suppress rejected" body={formatEndpoint(e.suppressRejected)} onDismiss={() => undefined} />
            <ToastCard tone="info" title="Suppressing" body={`${e.suppressCreated.method} ${e.suppressCreated.path}`} icon={<LoadingEllipsis />} />
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---------- 13 · chart ---------------------------------------------------- */

const BAND_CONFIG = { floor: { label: "Band floor", color: "var(--chart-series)" } } satisfies ChartConfig;
const BAND_FLOORS = Object.entries(SEVERITY_THRESHOLDS).map(([band, floor]) => ({ band, floor }));

function ChartSection() {
  return (
    <Section
      id="chart"
      index="13"
      title="Chart container"
      note="The chart layer charts build on: 11px mono axes, the graticule for grid lines, the tooltip spec, and a 180ms opacity fade as the only mount animation. Data: the four severity band floors from src/lib/contracts."
    >
      <SurfacePair>
        {() => (
          <ChartContainer config={BAND_CONFIG} className="h-56 w-full max-w-[560px]">
            <BarChart data={BAND_FLOORS} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="band" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis domain={[0, 1]} ticks={[0, ...Object.values(SEVERITY_THRESHOLDS), 1]} tickFormatter={(v: number) => v.toFixed(3)} tickLine={false} axisLine={false} width={48} />
              <ChartTooltip cursor={false} defaultIndex={2} active content={<ChartTooltipContent indicator="line" />} />
              <Bar dataKey="floor" fill="var(--color-floor)" isAnimationActive={false} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        )}
      </SurfacePair>
    </Section>
  );
}

export function Specimens({ data }: { data: LabData }) {
  return (
    <>
      <style>{LAB_CSS}</style>
      <HoverSection data={data} />
      <ButtonSection />
      <InputSection data={data} />
      <BadgeSection data={data} />
      <TabsSection />
      <ToggleSection />
      <TableSection data={data} />
      <BlocksSection data={data} />
      <OverlaySection data={data} />
      <ModalSection data={data} />
      <PaletteSection />
      <ToastSection data={data} />
      <ChartSection />
    </>
  );
}
