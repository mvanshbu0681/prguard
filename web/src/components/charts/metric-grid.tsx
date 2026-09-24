// OWNER: t10 (wave 2).
//
// <MetricGrid> — the six A6 accuracy metrics, in the plan's binding order
// (plan §13 A6, superseding dashboard blueprint §2.10 and landing blueprint
// §10's older six, which counted `disproven_rate` a second time — brand-gaps
// §2 ruling 15):
//
//   01 execution_verified_precision   02 self_caught_false_positive_rate
//   03 human_dismissal_rate           04 addressed_rate
//   05 proven_rate                    06 inconclusive_rate (derived client-side)
//
// Four come straight from `report.precision_proxies`. The other two are built
// here from `report.proof`, which is where the API actually puts them:
// `proven_rate` has no `definition`/`n` of its own in `AccuracyProof`, and
// `inconclusive_rate` does not exist in the payload at all — A6 derives it as
// `proof.inconclusive / proof.attempted` and requires that formula printed in
// its provenance line, which is what happens below. Nothing is hard-coded:
// every value, every `n` and the footnote's own numbers all read from `report`.
import type { AccuracyReport } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { formatScore } from "@/components/badges";
import { MetricCard } from "./metric-card";
import type { AccuracyMetricLike } from "./types";

export interface MetricGridProps {
  report: AccuracyReport;
  /** Fixture-only report (plan A11): appends the fixture-only note to every card's provenance. Default false — `GET /v1/accuracy` is a real endpoint. */
  ext?: boolean;
  className?: string;
}

interface MetricSpec {
  index: string;
  name: string;
  metric: AccuracyMetricLike;
  provenance: string;
  derivation?: string;
}

function buildMetrics(report: AccuracyReport): MetricSpec[] {
  const { precision_proxies: proxies, proof } = report;
  const attempted = proof.attempted ?? 0;
  const inconclusive = proof.inconclusive ?? 0;
  const inconclusiveRate = attempted > 0 ? inconclusive / attempted : null;

  return [
    {
      index: "01",
      name: "execution_verified_precision",
      metric: proxies.execution_verified_precision,
      provenance: "GET /v1/accuracy → precision_proxies.execution_verified_precision",
    },
    {
      index: "02",
      name: "self_caught_false_positive_rate",
      metric: proxies.self_caught_false_positive_rate,
      provenance: "GET /v1/accuracy → precision_proxies.self_caught_false_positive_rate",
    },
    {
      index: "03",
      name: "human_dismissal_rate",
      metric: proxies.human_dismissal_rate,
      provenance: "GET /v1/accuracy → precision_proxies.human_dismissal_rate",
    },
    {
      index: "04",
      name: "addressed_rate",
      metric: proxies.addressed_rate,
      provenance: "GET /v1/accuracy → precision_proxies.addressed_rate",
    },
    {
      index: "05",
      name: "proven_rate",
      metric: {
        value: proof.proven_rate ?? null,
        n: attempted,
        definition: "share of proof-attempted findings whose repro test passed at base and failed at head",
      },
      provenance: "GET /v1/accuracy → proof.proven_rate",
    },
    {
      index: "06",
      name: "inconclusive_rate",
      metric: {
        value: inconclusiveRate,
        n: attempted,
        definition: "share of proof-attempted findings whose repro test did not resolve the claim at base or head",
      },
      provenance: "GET /v1/accuracy → proof.inconclusive / proof.attempted",
      derivation: "derived client-side — not a field the API returns",
    },
  ];
}

export function MetricGrid({ report, ext = false, className }: MetricGridProps) {
  const metrics = buildMetrics(report);
  const disprovenN = report.proof.attempted ?? 0;
  const disprovenValue = report.proof.disproven_rate;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((spec) => (
          <MetricCard key={spec.name} index={spec.index} name={spec.name} metric={spec.metric} provenance={spec.provenance} derivation={spec.derivation} ext={ext} />
        ))}
      </div>
      <p className="type-small text-text-dim">
        {`proof.disproven_rate (${disprovenValue == null ? "no data" : formatScore(disprovenValue)}, n = ${disprovenN}) is the same quantity as self_caught_false_positive_rate and is not shown twice.`}
      </p>
      {report.caveats.length > 0 ? (
        <ul className="flex flex-col gap-2 border-t border-rule-1 pt-4">
          {report.caveats.map((caveat) => (
            <li key={caveat} className="type-small text-text-body">
              {caveat}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
