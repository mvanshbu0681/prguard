"use client";
// OWNER: t6 (wave 2). The client half of /lab/t6: parses the raw audit-events text
// losslessly (once, client-side — see page.tsx) and renders both <ChainRail> variants.
import { useMemo } from "react";
import { parseLosslessJson } from "@/api/lossless";
import { GraphPaper, SectionIndex, Surface } from "@/components/chrome";
import { ChainRail, type LosslessAuditEvent } from "@/components/evidence/ChainRail";

interface AuditEventsFile {
  items: LosslessAuditEvent[];
  chain: { verified: boolean; checked?: number; first_seq?: number | null; last_seq?: number | null; broken_at_seq?: number | null };
}

function LabSection({ index, title, note, marketing, children }: { index: string; title: string; note?: string; marketing?: boolean; children: React.ReactNode }) {
  return (
    <section className="relative isolate py-12" aria-labelledby={`lab-${index}`} data-surface={marketing ? "marketing" : "app"}>
      {marketing ? <GraphPaper className="absolute inset-0 -z-10 bg-ink-0" /> : null}
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <SectionIndex index={index} category={title} labelId={`lab-${index}`} labelAs="h2" />
        {note ? <p className="mt-3 max-w-(--measure-body) type-small text-text-body">{note}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function ChainRailLab({ rawEventsText, tamperDemoSeq }: { rawEventsText: string; tamperDemoSeq: number }) {
  const file = useMemo(() => parseLosslessJson(rawEventsText) as unknown as AuditEventsFile, [rawEventsText]);

  const marketingWindow = useMemo(() => {
    const lo = tamperDemoSeq - 3;
    const hi = tamperDemoSeq + 2;
    return file.items.filter((e) => e.seq >= lo && e.seq <= hi);
  }, [file, tamperDemoSeq]);

  return (
    <div className="min-h-dvh bg-ink-0">
      <div className="mx-auto max-w-[1200px] px-4 pt-10 md:px-8">
        <p className="type-label text-text-dim">/lab/t6</p>
        <h1 className="mt-2 type-display-h3 text-text-primary">ChainRail — the audit chain rail</h1>
        <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
          A hash-chained audit trail you can break by typing. The verified state, then the marketing variant&rsquo;s tamper control (edit any row&rsquo;s
          canonical_json and watch the chain physically break), then the dashboard variant windowing the full corpus.
        </p>
      </div>

      <LabSection
        index="01"
        title="Marketing — the flight recorder"
        note="Six events around the demo finding (seq 1428). The canonical_json field is contenteditable — type in it to break the chain, then restore it."
        marketing
      >
        <ChainRail
          events={marketingWindow as never}
          losslessEvents={marketingWindow}
          verified={file.chain.verified}
          brokenAtSeq={file.chain.broken_at_seq ?? null}
          tamperable
          checked={marketingWindow.length}
          firstSeq={marketingWindow[0]?.seq ?? null}
          lastSeq={marketingWindow.at(-1)?.seq ?? null}
          surface="marketing"
          index="07"
          provenance="GET /v1/audit → chain.verified · broken_at_seq"
        />
      </LabSection>

      <LabSection index="02" title="Dashboard — the full chain" note="All 1,450 events, windowed with @tanstack/react-virtual past 200 rows. No tamper button on this surface.">
        <ChainRail
          events={file.items as never}
          losslessEvents={file.items}
          verified={file.chain.verified}
          brokenAtSeq={file.chain.broken_at_seq ?? null}
          checked={file.chain.checked}
          firstSeq={file.chain.first_seq ?? null}
          lastSeq={file.chain.last_seq ?? null}
          surface="dashboard"
          index="09"
        />
      </LabSection>

      <LabSection index="03" title="Guards" note="Read-only fallbacks the same component renders when a guard trips.">
        <div className="grid gap-6 md:grid-cols-3">
          <Surface elevation={2} variant="card" as="div">
            <p className="type-label text-text-dim">missing tenant_id (plan A9)</p>
            <div className="mt-4">
              <ChainRail
                events={marketingWindow.slice(0, 3) as never}
                verified={file.chain.verified}
                brokenAtSeq={null}
                checked={3}
                firstSeq={marketingWindow[0]?.seq ?? null}
                lastSeq={marketingWindow[2]?.seq ?? null}
                surface="marketing"
                missingTenantId
                index="—"
                provenance="GET /v1/audit"
              />
            </div>
          </Surface>
        </div>
      </LabSection>
    </div>
  );
}
