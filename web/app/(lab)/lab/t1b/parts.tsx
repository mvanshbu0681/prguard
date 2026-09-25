"use client";

// OWNER: T1b (wave 1). Overlay bodies shared by the contained specimens (§10)
// and the live, portaled overlays, so both render exactly the same markup.
import type { ComponentProps } from "react";
import { ArchiveIcon, DownloadIcon, EyeOffIcon, LinkIcon, ListIcon, RowsIcon, ScaleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LabData } from "./lab-data";

/** The minimum suppression reason (dashboard §1.4: required, at least 8 characters, no default). */
export const MIN_REASON = 8;

export function SuppressDialogBody({ data, reason }: { data: LabData; reason?: string }) {
  const length = reason?.length ?? 0;
  const tooShort = reason !== undefined && length < MIN_REASON;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Suppress finding {data.ids.provenFindingId.slice(0, 8)}</DialogTitle>
        <DialogDescription>
          The finding stays in the list with <span className="type-data text-text-primary">status: suppressed</span>. The reason and your name go into the
          audit chain.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Reason"
        hint={`Required. At least ${MIN_REASON} characters.`}
        error={tooShort ? `${length} characters. A reason needs ${MIN_REASON}.` : undefined}
        required
      >
        <Textarea defaultValue={reason} placeholder="Why this finding does not apply here" />
      </Field>
      <Field label="Scope">
        <ScopeSelect data={data} />
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">CANCEL</Button>
        </DialogClose>
        <Button>SUPPRESS</Button>
      </DialogFooter>
    </>
  );
}

export function ScopeSelect({
  data,
  open,
  onOpenChange,
  size = "md",
  ...triggerProps
}: {
  data: LabData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** sm (26px) beside sm buttons; md (32px) in a form. */
  size?: "sm" | "md";
} & Omit<ComponentProps<typeof SelectTrigger>, "size" | "children">) {
  return (
    <Select defaultValue={data.suppressScopes[1] ?? data.suppressScopes[0]} open={open} onOpenChange={onOpenChange}>
      <SelectTrigger size={size} className="w-full" {...triggerProps}>
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
  );
}

export function FiltersSheetBody({ data }: { data: LabData }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription>Every filter lives in the URL, so a filtered view is a link.</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-6">
        <Field label="Severity floor">
          <Select defaultValue={data.filters.bands[1]}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.filters.bands.map((band) => (
                <SelectItem key={band} value={band}>
                  <span className="type-data">{band}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-col">
          <span className="ui-field__label" id="proof-filter-label">
            Proof status
          </span>
          <ToggleGroup type="multiple" orientation="vertical" defaultValue={[data.filters.proofStatuses[2]]} aria-labelledby="proof-filter-label" className="w-full">
            {data.filters.proofStatuses.map((status) => (
              <ToggleGroupItem key={status} value={status} className="justify-start">
                {status.replace(/_/g, " ")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button variant="quiet">CLEAR</Button>
        <Button>APPLY</Button>
      </SheetFooter>
    </>
  );
}

/** The palette's root page: GO TO and ACTIONS, with the dashboard's bindings (dashboard §1.5). */
export function PaletteRoot() {
  return (
    <>
      <CommandInput placeholder="Type a page, a finding id or an action" />
      <CommandList>
        <CommandEmpty>No page or action matches that.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem value="findings">
            <ListIcon strokeWidth={1.5} aria-hidden="true" />
            Findings
            <CommandShortcut>g f</CommandShortcut>
          </CommandItem>
          <CommandItem value="suppressions">
            <ArchiveIcon strokeWidth={1.5} aria-hidden="true" />
            Suppressions
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
          <CommandItem value="audit">
            <LinkIcon strokeWidth={1.5} aria-hidden="true" />
            Audit
            <CommandShortcut>g a</CommandShortcut>
          </CommandItem>
          <CommandItem value="accuracy">
            <ScaleIcon strokeWidth={1.5} aria-hidden="true" />
            Accuracy
            <CommandShortcut>g y</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="suppress finding" keywords={["dismiss", "ignore", "mute"]}>
            <EyeOffIcon strokeWidth={1.5} aria-hidden="true" />
            Suppress finding…
            <CommandShortcut>s</CommandShortcut>
          </CommandItem>
          <CommandItem value="export evidence">
            <DownloadIcon strokeWidth={1.5} aria-hidden="true" />
            Export evidence…
            <CommandShortcut>e</CommandShortcut>
          </CommandItem>
          <CommandItem value="toggle density" checked>
            <RowsIcon strokeWidth={1.5} aria-hidden="true" />
            Toggle density
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}
