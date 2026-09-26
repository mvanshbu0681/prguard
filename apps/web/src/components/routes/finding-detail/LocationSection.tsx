// OWNER: d3 (wave 3). §02 — LOCATION (dashboard-blueprint §2.7, brief
// override): file_path:start_line-end_line, side, language, symbol_path
// (mono). The blueprint's own sketch puts a <PRGuardDiff> here, but the brief
// is explicit and overrides it: "the API has no source text for the file, so
// do not invent a code excerpt; the code shown is the repro test
// (proof.test_code) in a <CodeBlockClient> with its file path." <PRGuardDiff>
// needs the file's actual before/after source, which no endpoint in
// web/openapi/openapi.json serves — rendering it here would mean fabricating
// source text, which the hard rules forbid outright.
//
// Wrapped in <Exhibit> (not <OrdinaryPanel>): this frame carries a real
// captured artifact (the executed repro test), the same register as "the
// diff" in chrome/index.ts's own list of evidence frames.
import { CodeBlockClient } from "@/components/code";
import { Exhibit } from "@/components/chrome";
import type { Finding } from "@/lib/api-types";
import { locationRangeLabel } from "./format";

const META_LABEL = "type-label text-text-dim";
const META_VALUE = "type-data break-words text-text-body";

export function LocationSection({ finding }: { finding: Finding }) {
  const { location, proof } = finding;
  const hasReproCode = Boolean(proof?.test_code);
  return (
    <Exhibit
      index="02"
      category="Location"
      identifier={locationRangeLabel(location.file_path, location.start_line, location.end_line)}
      provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → location`}
    >
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={META_LABEL}>File</span>
            <span className={META_VALUE}>{locationRangeLabel(location.file_path, location.start_line, location.end_line)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={META_LABEL}>Side</span>
            <span className={META_VALUE}>{location.side ?? "—"}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={META_LABEL}>Language</span>
            <span className={META_VALUE}>{location.language ?? "—"}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-1">
            <span className={META_LABEL}>Symbol</span>
            <span className={META_VALUE}>{location.symbol_path ?? "—"}</span>
          </div>
        </dl>
        {hasReproCode ? (
          <CodeBlockClient
            code={proof!.test_code!}
            filePath={proof!.test_file_path ?? location.file_path}
            label={proof!.test_file_path ?? location.file_path}
            lineNumbers
          />
        ) : (
          <p className="type-small text-text-dim">
            No repro test captured for this location {proof ? `(proof_status: ${proof.status})` : "(no proof was attempted)"}.
          </p>
        )}
      </div>
    </Exhibit>
  );
}
