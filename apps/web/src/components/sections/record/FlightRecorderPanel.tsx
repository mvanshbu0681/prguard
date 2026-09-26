"use client";
// OWNER: m5 (wave 3). Section 07's RIGHT panel — the flight recorder (landing-blueprint
// §07 "RIGHT PANEL"; plan M4). A window of the real audit chain around
// manifest ids.tamper_demo_seq, loaded LOSSLESSLY exactly as app/(lab)/lab/t6 does it
// (app/(lab)/lab/t6/lab-client.tsx): the server reads the raw text of audit/events.json
// with getAuditEventsText() (never getAuditChain() — that has already been through
// JSON.parse, which is exactly the lossy path plan A8 exists to avoid) and hands it to
// this client component as a string; LosslessNumber instances cannot cross the
// server → client boundary, the text can, so it is parsed here with parseLosslessJson.
//
// <ChainRail> owns every guard, the 120ms-debounced tamper recompute and the broken-
// state rendering (src/components/evidence/ChainRail/ChainRail.tsx) — this component
// only windows the real chain and passes it through.
import { useMemo } from "react";
import { parseLosslessJson } from "@/api/lossless";
import { ChainRail, type LosslessAuditEvent } from "@/components/evidence/ChainRail";
import { windowAroundSeq } from "./build-view";

interface AuditEventsFile {
  items: LosslessAuditEvent[];
  chain: { verified: boolean; checked?: number; first_seq?: number | null; last_seq?: number | null; broken_at_seq?: number | null };
}

export interface FlightRecorderPanelProps {
  /** getAuditEventsText() — the raw text of audit/events.json, number lexemes intact. */
  rawEventsText: string;
  /** manifest.ids.tamper_demo_seq — the window centres on this seq. */
  tamperDemoSeq: number;
  /** How many events before/after tamperDemoSeq to include. Default 3/2, six events
   *  total (landing-blueprint §07: "Six real events"). */
  before?: number;
  after?: number;
}

export function FlightRecorderPanel({ rawEventsText, tamperDemoSeq, before = 3, after = 2 }: FlightRecorderPanelProps) {
  const file = useMemo(() => parseLosslessJson(rawEventsText) as unknown as AuditEventsFile, [rawEventsText]);

  const windowEvents = useMemo(() => windowAroundSeq(file.items, tamperDemoSeq, before, after), [file, tamperDemoSeq, before, after]);

  return (
    <ChainRail
      events={windowEvents as never}
      losslessEvents={windowEvents}
      verified={file.chain.verified}
      brokenAtSeq={file.chain.broken_at_seq ?? null}
      tamperable
      checked={windowEvents.length}
      firstSeq={windowEvents[0]?.seq ?? null}
      lastSeq={windowEvents.at(-1)?.seq ?? null}
      surface="marketing"
      index="07"
      provenance="GET /v1/audit → chain.verified · broken_at_seq"
    />
  );
}
