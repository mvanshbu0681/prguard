"use client";
// OWNER: t2a (wave 1).
//
// /lab/t2a: the data layer, driven only through the hooks the product uses.
//   01 every route, with its last call as the transport recorded it;
//   02 the simulated live run (plan A5) as useReviewStatus polls it;
//   03 the suppress round trip: optimistic strike, ledger row, audit event,
//      and the rollback toast on failure.
// Keys (for people and for scripts/shoot.sh --press): R start a run, U re-run
// it, S suppress, E suppress with an empty reason (422), V revoke the newest.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { API_ROUTES, type ApiRoute } from "@/api/routes";
import { getApiCalls, setTransportBase, subscribeApiCalls, type ApiCall } from "@/api/transport";
import type { AuditItemWithTenant, Finding } from "@/lib/api-types";
import { HEARTBEAT_ALARM_SECONDS, HEARTBEAT_STALE_SECONDS, STAGES } from "@/lib/contracts";
import { DEMO_IDS, DEMO_SHORT } from "@/lib/demo-ids";
import { API_BASE, FIXTURES } from "@/lib/env";
import { createFixtureResolver, FixtureMissingError, PENDING_EVENT_HASH, type FixtureResolver } from "@/lib/fixture-resolver";
import { sampleFiles } from "@/lib/fixture-sample";
import {
  getReviewResultQueryKey,
  isPendingSuppression,
  isTerminalStatus,
  reviewPollInterval,
  useAccuracy,
  useAudit,
  useCreateReview,
  useFinding,
  useFindings,
  useHealthz,
  useReadyz,
  useRerunReview,
  useReviewList,
  useReviewResult,
  useReviewStatus,
  useRevokeSuppression,
  useSuppressFinding,
  useSuppressions,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Corpus = "disk" | "sample";

const ACTION_KEYS = ["r", "u", "s", "e", "v"] as const;
type ActionKey = (typeof ACTION_KEYS)[number];
const isActionKey = (key: string): key is ActionKey => (ACTION_KEYS as readonly string[]).includes(key);

const DEMO_REVIEW = DEMO_IDS.demo_review_id;
const LAB_ACTOR = "lab.t2a";
const NO_CALLS: readonly ApiCall[] = [];
const serverCalls = () => NO_CALLS;

const BTN =
  "inline-flex h-8 items-center gap-3 rounded-data border border-rule-2 bg-ink-2 px-3 type-data text-text-primary inset-shadow-hi hover:bg-ink-3 disabled:cursor-not-allowed disabled:text-text-dim";
const KBD = "rounded-data border border-rule-2 px-1 type-data text-text-dim";
const LINK = "type-data text-signal-text underline decoration-rule-3 underline-offset-4 hover:decoration-signal-text";

// ---------------------------------------------------------------------------
// ?corpus=sample: the resolver over src/lib/fixture-sample.ts, for this page only.
// ---------------------------------------------------------------------------

let sampleResolver: FixtureResolver | null = null;
function sampleCorpusResolver(): FixtureResolver {
  sampleResolver ??= createFixtureResolver({
    load: async (path) => {
      const files = sampleFiles();
      if (!(path in files)) throw new FixtureMissingError(path);
      return files[path]!;
    },
  });
  return sampleResolver;
}

function SampleCorpus({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Installed during the first client render, before any query below starts, and
  // again on every mount (StrictMode remounts); restored on unmount.
  useState(() => {
    if (typeof window !== "undefined") {
      setTransportBase(sampleCorpusResolver(), "fixture");
      queryClient.clear();
    }
    return null;
  });
  useEffect(() => {
    setTransportBase(sampleCorpusResolver(), "fixture");
    return () => {
      setTransportBase(null);
      queryClient.clear();
    };
  }, [queryClient]);
  return children;
}

export function DataLab({ corpus }: { corpus: Corpus }) {
  return corpus === "sample" ? (
    <SampleCorpus>
      <Lab corpus={corpus} />
    </SampleCorpus>
  ) : (
    <Lab corpus={corpus} />
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const shortId = (id: string | null | undefined, n = 8) => (id ? id.slice(0, n) : "null");
const shortHash = (h: string | null | undefined) => (!h ? "null" : h === PENDING_EVENT_HASH || h.length < 16 ? h : `${h.slice(0, 6)}…${h.slice(-4)}`);

/** A route path that may wrap after each slash at 375px. */
function breakable(path: string): ReactNode {
  const parts = path.split("/");
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </span>
  ));
}

function withFlags(corpus: Corpus, flags: Record<string, string>): string {
  const params = new URLSearchParams(corpus === "sample" ? { corpus: "sample", ...flags } : flags);
  return `/lab/t2a?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 py-10" aria-labelledby={`t2a-${index}`}>
      <h2 id={`t2a-${index}`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <p className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-panel border border-rule-1 bg-ink-1 p-4 inset-shadow-hi">
      <h3 className="type-label text-text-dim">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 type-data">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-dim">{k}</dt>
          <dd className="min-w-0 text-text-primary [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A route, file or identifier inside prose: mono, never broken at its own hyphens. */
function C({ children }: { children: ReactNode }) {
  return <code className="font-mono whitespace-nowrap text-text-primary">{children}</code>;
}

function Action({ keyName, onClick, disabled, children }: { keyName: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={BTN} onClick={onClick} disabled={disabled} aria-keyshortcuts={keyName.toLowerCase()}>
      <span>{children}</span>
      <kbd className={KBD}>{keyName}</kbd>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 01 — the endpoint table
// ---------------------------------------------------------------------------

interface RouteStats {
  count: number;
  last: ApiCall;
}

/** Completed calls per route (a cancelled read produced no answer, so it is not one). */
function statsByRoute(calls: readonly ApiCall[]): Map<string, RouteStats> {
  const out = new Map<string, RouteStats>();
  for (const call of calls) {
    if (call.aborted) continue;
    out.set(call.route, { count: (out.get(call.route)?.count ?? 0) + 1, last: call });
  }
  return out;
}

const UNCALLED: Record<string, string> = {
  "POST /v1/reviews": "not called yet · press R",
  "POST /v1/reviews/{review_id}/rerun": "not called yet · press U",
  "POST /v1/findings/{finding_id}/suppress": "not called yet · press S or E",
  "DELETE /v1/suppressions/{suppression_id}": "not called yet · press V",
  "POST /webhooks/github": "called by GitHub, not by the UI · no hook",
};

function EndpointRow({ route, stats }: { route: ApiRoute; stats: RouteStats | undefined }) {
  const label = `${route.method} ${route.path}`;
  const last = stats?.last ?? null;
  const detail = last ? [`${stats!.count} call${stats!.count === 1 ? "" : "s"}`, last.code, last.search || null].filter(Boolean).join(" · ") : (UNCALLED[label] ?? "not called yet");
  return (
    <tr className="border-b border-rule-hair align-top">
      <td className="py-2 pr-3">
        <div className="text-text-primary">
          <span className="text-text-dim">{route.method}</span> {breakable(route.path)}
          {route.ext ? <span className="text-text-dim"> · ext</span> : null}
        </div>
        <div className="text-text-dim [overflow-wrap:anywhere]">{detail}</div>
      </td>
      <td className={cn("py-2 pr-3 text-right", !last ? "text-text-dim" : last.ok ? "text-text-body" : "text-marker-text")}>{last ? (last.status || "no response") : "—"}</td>
      <td className="py-2 pr-3 text-right text-text-body">{last ? last.ms : "—"}</td>
      <td className="py-2 text-right text-text-body">{last?.items ?? "—"}</td>
    </tr>
  );
}

function EndpointTable({ calls }: { calls: readonly ApiCall[] }) {
  const stats = statsByRoute(calls);
  const cancelled = calls.filter((c) => c.aborted).length;
  return (
    <>
      <table className="w-full border-collapse type-data">
      <caption className="sr-only">Every API route with the last call the hooks made to it</caption>
      <thead>
        <tr className="border-b border-rule-1">
          <th scope="col" className="py-2 pr-3 text-left type-label text-text-dim">
            Endpoint
          </th>
          <th scope="col" className="py-2 pr-3 text-right type-label text-text-dim">
            Status
          </th>
          <th scope="col" className="py-2 pr-3 text-right type-label text-text-dim">
            ms
          </th>
          <th scope="col" className="py-2 text-right type-label text-text-dim">
            Items
          </th>
        </tr>
      </thead>
      <tbody>
        {API_ROUTES.map((route) => (
          <EndpointRow key={`${route.method} ${route.path}`} route={route} stats={stats.get(`${route.method} ${route.path}`)} />
        ))}
      </tbody>
      </table>
      {cancelled > 0 ? (
        <p className="mt-3 max-w-(--measure-body) type-small text-text-dim">
          {cancelled} read{cancelled === 1 ? "" : "s"} cancelled by TanStack Query on unmount or a new key, not counted above. Under <C>next dev</C>, StrictMode mounts
          every component twice, so each first read is cancelled once.
        </p>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// 02 — the simulated run
// ---------------------------------------------------------------------------

type StageCell = "done" | "running" | "pending";

function StageStrip({ current, finished }: { current: number; finished: boolean }) {
  return (
    <ol className="grid grid-cols-9 gap-1" aria-label="Pipeline stages">
      {STAGES.map((key, i) => {
        const n = i + 1;
        const state: StageCell = n < current || (n === current && finished) ? "done" : n === current ? "running" : "pending";
        return (
          <li key={key} className="min-w-0">
            <span
              aria-hidden
              className={cn(
                "block h-1 rounded-data",
                state === "done" && "bg-stage-done-node",
                state === "running" && "bg-stage-running-node",
                state === "pending" && "border border-stage-pending-node",
              )}
            />
            <span className={cn("mt-1 block type-data", state === "running" ? "text-text-primary" : "text-text-dim")}>{n}</span>
            <span className="sr-only">
              {key}: {state}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function heartbeatState(age: number): { word: string; dot: string } {
  if (age > HEARTBEAT_ALARM_SECONDS) return { word: "silent", dot: "bg-alarm" };
  if (age > HEARTBEAT_STALE_SECONDS) return { word: "stale", dot: "bg-heartbeat-stale" };
  return { word: "live", dot: "bg-heartbeat-live" };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function Lab({ corpus }: { corpus: Corpus }) {
  const queryClient = useQueryClient();
  const calls = useSyncExternalStore(subscribeApiCalls, getApiCalls, serverCalls);

  // Reads: every query hook, so every read route appears in the table.
  const health = useHealthz();
  useReadyz();
  useReviewList();
  useAccuracy();
  const status = useReviewStatus(DEMO_REVIEW);
  const result = useReviewResult(DEMO_REVIEW);
  const findings = useFindings({ limit: 5 });
  const ledger = useSuppressions();
  const trail = useAudit({ event_type: "suppression.created" });
  const chain = useAudit();

  // Writes.
  const create = useCreateReview({ notify: true });
  const rerun = useRerunReview();
  const suppress = useSuppressFinding();
  const revoke = useRevokeSuppression();

  // The suppress target: the first published finding, pinned once a suppression is sent.
  const [pinned, setPinned] = useState<string | null>(null);
  const candidate = findings.data?.items?.find((f) => f.status === "published")?.id ?? null;
  const targetId = pinned ?? candidate ?? DEMO_IDS.proven_finding_id;
  const target = useFinding(targetId);

  // The 1Hz heartbeat ticker (dashboard §5.1): the poll's age, advanced locally.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  // When the run finishes, its result stops answering 409.
  const run = status.data;
  const finished = isTerminalStatus(run?.status);
  useEffect(() => {
    if (finished) void queryClient.invalidateQueries({ queryKey: getReviewResultQueryKey({ path: { review_id: DEMO_REVIEW } }) });
  }, [finished, queryClient]);

  const newestCreated = suppress.data?.suppression_id ?? null;
  const actions: Record<ActionKey, () => void> = {
    r: () => create.mutate({ pr_url: DEMO_SHORT.pullRequest }),
    u: () => rerun.mutate({ reviewId: DEMO_REVIEW }),
    s: () => {
      setPinned(targetId);
      suppress.mutate({ findingId: targetId, request: { scope: "line", reason: "lab round trip: accepted risk" }, actorId: LAB_ACTOR });
    },
    e: () => {
      setPinned(targetId);
      suppress.mutate({ findingId: targetId, request: { scope: "line", reason: "" }, actorId: LAB_ACTOR });
    },
    v: () => {
      const id = newestCreated ?? ledger.data?.items?.[0]?.suppression_id;
      if (id) revoke.mutate({ suppressionId: id, actorId: LAB_ACTOR });
    },
  };
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const key = event.key.toLowerCase();
      if (isActionKey(key)) {
        event.preventDefault();
        actionsRef.current[key]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- derived readouts ----------------------------------------------------

  const version = health.data?.version;
  const corpusLine =
    corpus === "sample"
      ? "sample · src/lib/fixture-sample.ts, lab only; placeholder values"
      : !FIXTURES
        ? `none · live backend at ${API_BASE}`
        : version === undefined
          ? "web/public/fixtures"
          : version.startsWith("fixtures@")
            ? `web/public/fixtures · generated at backend ${version.slice("fixtures@".length)}`
            : "web/public/fixtures · stub: t2b's generator has not run";

  const live = !!run && !finished;
  const age = live && now !== null && run.seconds_since_heartbeat != null ? Math.max(0, Math.floor(run.seconds_since_heartbeat + (now - status.dataUpdatedAt) / 1000)) : null;
  const beat = age === null ? null : heartbeatState(age);
  const stageIndex = run?.stage_index ?? 0;
  const stageTotal = run?.stage_total ?? STAGES.length;
  const sentence = run
    ? live
      ? `Stage ${stageIndex}/${stageTotal} — ${run.stage ?? "?"} · ${age ?? 0}s since last output`
      : `status: ${run.status} · stage ${stageIndex}/${stageTotal} ${run.stage ?? ""}`.trim()
    : status.error
      ? `No run to show · ${status.error.status} ${status.error.code}`
      : "Reading GET /v1/reviews/{id}";
  const polls = calls.filter((c) => c.route === "GET /v1/reviews/{review_id}" && !c.aborted).length;
  const interval = reviewPollInterval(run?.status, status.error, run?.seconds_since_heartbeat);
  const resultLine = result.data
    ? `200 · ${result.data.findings?.length ?? 0} findings`
    : result.error
      ? `${result.error.status} ${result.error.code}`
      : result.isFetching
        ? "reading"
        : "not requested";

  const list = findings.data?.items ?? [];
  const finding = target.data;
  const events = trail.data?.items ?? [];
  const lastEvent: AuditItemWithTenant | undefined = events[events.length - 1];
  const newestRow = ledger.data?.items?.[0];

  return (
    <div data-surface="app" className="min-h-dvh bg-ink-0 text-text-body">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <header className="pb-10">
          <p className="type-label text-text-dim">/ lab — t2a · data layer</p>
          <h1 className="mt-3 type-display-h3 text-text-primary">Data layer</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            Every route the dashboard calls, through the hooks it calls them with. In fixture mode the generated client sends through the fixture resolver, so
            nothing on this page reaches a network.
          </p>
          <div className="mt-6 max-w-[760px]">
            <Facts
              rows={[
                ["mode", FIXTURES ? "fixtures, the default · NEXT_PUBLIC_FIXTURES=0 turns it off" : `live · ${API_BASE}`],
                ["corpus", corpusLine],
                ["latency", "40–160ms per path, deterministic · ?latency=0 removes it"],
                ["routes", `${API_ROUTES.filter((r) => !("ext" in r)).length} from openapi.json + 1 extension, GET /v1/reviews (plan A11)`],
              ]}
            />
          </div>
        </header>

        <Section
          index="01"
          title="Endpoints"
          note={
            <>
              Status, latency and item count are the last call&apos;s, as the transport recorded it. Items read <C>items.length</C> for a list and{" "}
              <C>findings.length</C> for a result.
            </>
          }
        >
          <EndpointTable calls={calls} />
        </Section>

        <Section
          index="02"
          title="Simulated run"
          note={
            <>
              <C>GET /v1/reviews/{DEMO_SHORT.review}</C>, polled by <C>useReviewStatus</C> every 1200ms while it runs. <C>POST /v1/reviews</C> or{" "}
              <C>?replay=1</C> starts it. Stage durations are <C>live/demo-run.json</C>&apos;s, times its <C>time_scale</C>; 2s each while that file is a stub.
            </>
          }
        >
          <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel title="GET /v1/reviews/{id}">
              <p className="type-data text-text-primary">{sentence}</p>
              <div className="mt-4">
                <StageStrip current={stageIndex} finished={finished} />
              </div>
              <div className="mt-4">
                <Facts
                  rows={[
                    ["status", run?.status ?? (status.error ? `${status.error.status} ${status.error.code}` : "reading")],
                    ["stage_label", run ? (run.stage_label ?? "null") : "—"],
                    [
                      "heartbeat",
                      beat && age !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden className={cn("inline-block size-2 rounded-dot", beat.dot)} />
                          {age}s · {beat.word}
                        </span>
                      ) : run ? (
                        "run finished"
                      ) : (
                        "—"
                      ),
                    ],
                    ["poll", `${interval === false ? "stopped" : `every ${interval}ms`} · ${polls} poll${polls === 1 ? "" : "s"} · ${status.failureCount} missed`],
                    ["result", resultLine],
                  ]}
                />
              </div>
            </Panel>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Action keyName="R" onClick={actions.r} disabled={create.isPending}>
                  POST /v1/reviews
                </Action>
                <Action keyName="U" onClick={actions.u} disabled={rerun.isPending}>
                  POST …/{DEMO_SHORT.review}/rerun
                </Action>
              </div>
              <div>
                <p className="type-label text-text-dim">Page flags</p>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  <li>
                    <a className={LINK} href={withFlags(corpus, { replay: "1" })}>
                      ?replay=1
                    </a>
                  </li>
                  <li>
                    <a className={LINK} href={withFlags(corpus, { replay: "1", stall: "1" })}>
                      ?replay=1&amp;stall=1
                    </a>
                  </li>
                  <li>
                    <a className={LINK} href={withFlags(corpus, { latency: "0" })}>
                      ?latency=0
                    </a>
                  </li>
                </ul>
                <p className="mt-2 type-small text-text-body">
                  <C>?stall=1</C> stops the heartbeat at stage 3, so the 20s stale state and the 45s silent state can be seen.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section
          index="03"
          title="Suppress round trip"
          note={
            <>
              <C>useSuppressFinding</C> strikes the finding before the response (one reducer, shared with the resolver). The ledger row and a{" "}
              <C>suppression.created</C> audit event follow; a failure rolls every cache back and raises a toast.
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Finding">
              {list.length === 0 ? (
                <div className="space-y-2 type-small text-text-body">
                  <p>
                    <C>GET /v1/findings</C> returned {findings.data ? "0 findings" : "nothing yet"}. Suppress targets the manifest&apos;s <C>proven_finding_id</C> (
                    {shortId(DEMO_IDS.proven_finding_id)}): expect 404 <C>FINDING_NOT_FOUND</C>, and a 422 first for an empty reason, because the body is validated
                    before the lookup.
                  </p>
                  {corpus === "disk" ? (
                    <p>
                      <a className={LINK} href={withFlags("sample", {})}>
                        Run it on the lab sample
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : (
                <ul className="type-data">
                  {list.map((f: Finding) => (
                    <li key={f.id} className={cn("grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 border-b border-rule-hair py-1", f.id === targetId && "text-text-primary")}>
                      <span className={cn(f.id === targetId ? "text-signal-text" : "text-text-dim")}>{shortId(f.id)}</span>
                      <span className={cn("min-w-0", f.status === "suppressed" && "line-through decoration-text-dim")}>
                        {f.status} · {f.severity?.band ?? "unscored"} · {f.proof?.status ?? "not_attempted"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Facts
                  rows={[
                    ["target", shortId(targetId)],
                    ["status", finding ? finding.status : target.error ? `${target.error.status} ${target.error.code}` : "reading"],
                    ["blocking", finding ? String(finding.blocking ?? false) : "—"],
                    [
                      "suppression",
                      finding?.suppression ? `${isPendingSuppression(finding.suppression) ? "pending (optimistic)" : shortId(finding.suppression.suppression_id)} · ${finding.suppression.scope}` : "null",
                    ],
                  ]}
                />
              </div>
            </Panel>

            <Panel title="Ledger · GET /v1/suppressions">
              <Facts
                rows={[
                  ...(ledger.error
                    ? ([["totals", `${ledger.error.status} ${ledger.error.code}`]] as [string, ReactNode][])
                    : (["active", "expired", "revoked"] as const).map((k): [string, ReactNode] => [k, ledger.data?.totals ? (ledger.data.totals[k] ?? 0) : "…"])),
                  ["newest", newestRow ? `${shortId(newestRow.suppression_id)} · ${newestRow.scope}` : "none"],
                  ["reason", newestRow ? newestRow.reason : "—"],
                  ["created_by", newestRow ? (newestRow.created_by ?? "null") : "—"],
                  ["revoked_at", newestRow ? (newestRow.revoked_at ?? "null") : "—"],
                ]}
              />
            </Panel>

            <Panel title="Audit · suppression.created">
              {lastEvent ? (
                <Facts
                  rows={[
                    ["seq", lastEvent.seq],
                    ["actor", `${lastEvent.actor_type} · ${lastEvent.actor_id ?? "null"}`],
                    ["prev_hash", shortHash(lastEvent.prev_hash)],
                    ["event_hash", lastEvent.event_hash === PENDING_EVENT_HASH ? "pending: t6 registers the canonical hasher" : shortHash(lastEvent.event_hash)],
                  ]}
                />
              ) : (
                <p className="type-small text-text-body">{trail.data ? "No suppression.created event in the trail yet. Press S." : "Reading GET /v1/audit."}</p>
              )}
              <div className="mt-4">
                <Facts
                  rows={[
                    [
                      "chain",
                      chain.data
                        ? // No-break spaces keep each name with its value when the line wraps.
                          `verified: ${String(chain.data.chain.verified)} · checked ${chain.data.chain.checked ?? 0}${chain.data.chain.first_seq != null ? ` · seq ${chain.data.chain.first_seq}–${chain.data.chain.last_seq}` : ""}`
                        : chain.error
                          ? `${chain.error.status} ${chain.error.code}`
                          : "reading",
                    ],
                  ]}
                />
              </div>
            </Panel>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Action keyName="S" onClick={actions.s} disabled={suppress.isPending}>
              Suppress · scope line
            </Action>
            <Action keyName="E" onClick={actions.e} disabled={suppress.isPending}>
              Suppress · empty reason
            </Action>
            <Action keyName="V" onClick={actions.v} disabled={revoke.isPending || (!newestCreated && !ledger.data?.items?.length)}>
              Revoke newest
            </Action>
          </div>
        </Section>
      </div>
    </div>
  );
}
