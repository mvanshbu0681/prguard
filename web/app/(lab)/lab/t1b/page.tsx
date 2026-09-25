// OWNER: T1b (wave 1). /lab/t1b — the UI primitives and the hover language,
// every component in every state, on both data-surface values.
//
// Data: the binding demo ids (public/fixtures/manifest.json) and the API
// contract (openapi/openapi.json), read here on the server so neither ships to
// the client. ?open=dialog|sheet|palette|menu|listbox|toasts holds a real
// overlay open for a screenshot.
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildLabData } from "./lab-data";
import { LiveOverlays } from "./live";
import { Specimens } from "./specimens";

export const metadata: Metadata = { title: "UI primitives (lab)" };

export default function T1bLabPage() {
  const data = buildLabData();
  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        <header className="pb-10">
          <p className="type-label text-text-dim">/ lab — t1b · ui primitives</p>
          <h1 className="mt-3 type-display-h3 text-text-primary md:type-display-h2">UI primitives and the hover language</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            Every primitive in every state, on the app surface and the marketing surface. A forced state applies exactly the declarations of
            the real hover, focus or press rule, so a still image carries it. The mono readouts are measured in this browser, not typed.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <p className="type-label text-text-dim">Live overlays · portaled, modal</p>
            <LiveOverlays data={data} />
          </div>
        </header>
        <Specimens data={data} />
      </div>
    </TooltipProvider>
  );
}
