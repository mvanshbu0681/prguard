// OWNER: t6 (wave 2).
//
// /lab/t6 — <ChainRail> in isolation: the marketing variant (a six-event window around
// manifest ids.tamper_demo_seq = 1428, tamper control open) and the dashboard variant
// (the full 1,450-event corpus from getAuditChain(), windowed with @tanstack/react-virtual).
//
// Server-only: the raw text of audit/events.json (getAuditEventsText — a plain
// getAuditChain() has already been through JSON.parse, which is exactly the lossy path
// plan A8 exists to avoid) is read once here and handed to the client as a string.
// LosslessNumber instances cannot cross the server → client boundary; the text can, and
// the client component parses it itself with parseLosslessJson.
import type { Metadata } from "next";
import { getAuditEventsText, getManifest } from "@/lib/fixtures";
import { ChainRailLab } from "./lab-client";

export const metadata: Metadata = { title: "Audit chain (lab)" };

export default function Page() {
  const manifest = getManifest();
  const rawEventsText = getAuditEventsText();
  return <ChainRailLab rawEventsText={rawEventsText} tamperDemoSeq={manifest.ids.tamper_demo_seq} />;
}
