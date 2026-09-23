// OWNER: T3 (wave 1). /lab/t3: the motion substrate, every primitive live.
//
//   ?runtime=ok | late | blocked   how the animation runtime loads (./runtime.tsx);
//                                  "blocked" simulates the bundle failing on venue wifi
//
// The replay bench's identifiers are the binding demo ids from
// public/fixtures/manifest.json (plan A10), read on the server. Every duration, curve
// and stagger printed here comes from src/motion/tokens.ts, which a unit test holds
// equal to app/tokens/core.css.
import type { Metadata } from "next";
import manifest from "@fixtures/manifest.json";
import { DUR, DUR_VAR, EASE, HANDSHAKE, ROW_GROUP_DELAYS, STAGGER } from "@/motion/tokens";
import type { BenchIds } from "./bench";
import { DrawDemo } from "./draw-demo";
import { HandshakeProbes } from "./handshake-demo";
import { HeartbeatDemo } from "./heartbeat-demo";
import { C, Kbd, LabSection, U } from "./lab-ui";
import { parseMode } from "./modes";
import { MotionPanel } from "./panel";
import { RevealDemo } from "./reveal-demo";
import { ReplaySlot } from "./runtime";
import { SequenceDemo } from "./sequence-demo";
import { StampDemo } from "./stamp-demo";

export const metadata: Metadata = { title: "Motion substrate (lab)" };

const REDUCED: { type: string; becomes: string }[] = [
  { type: "replay bench (P)", becomes: "never plays: the end frame is already there. P steps beat by beat with zero tweening" },
  { type: "verdict flip", becomes: "unchanged: a 0ms colour change is not motion. The 180ms scale is dropped" },
  { type: "heartbeat", becomes: "static at full opacity; the age keeps ticking as text" },
  { type: "reveal", becomes: `opacity only, over ${DUR.hover}ms, no rise` },
  { type: "draw", becomes: "rendered complete" },
  { type: "scan line", becomes: "never runs" },
  { type: "stations (S)", becomes: "S steps beat by beat; play lands on the end frame" },
];

export default async function MotionLabPage({ searchParams }: { searchParams: Promise<{ runtime?: string | string[] }> }) {
  const mode = parseMode((await searchParams).runtime);
  const ids: BenchIds = {
    base: manifest.ids.base_sha.slice(0, 7),
    head: manifest.ids.head_sha.slice(0, 7),
    testPath: manifest.ids.repro_test_path,
    testName: manifest.ids.failing_test,
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <header className="pb-10">
        <p className="type-label text-text-dim">/ lab — t3 · motion substrate</p>
        <h1 className="mt-3 type-display-h3 text-text-primary md:type-display-h2">Motion substrate</h1>
        <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
          The primitives every animated surface uses: tokens held equal to the stylesheet, the fallback handshake, <C>useReplay</C> on GSAP,{" "}
          <C>useSequence</C> without an engine, and the CSS helpers. Readouts are measured in this browser. Press <Kbd>P</Kbd> to replay the
          bench and <Kbd>S</Kbd> to replay the stations.
        </p>
        <div className="mt-6">
          <MotionPanel mode={mode} />
        </div>
      </header>

      <LabSection
        id="handshake"
        index="01"
        title="Handshake"
        note={
          <>
            <C>[data-anim]</C> content is hidden by an inline style in <C>{"<head>"}</C> and force-revealed at {HANDSHAKE.forceRevealMs}ms, unless a
            runtime loads and runs a frame first. A runtime that arrives late keeps what is already visible exactly as it is. Each runtime
            link above is a full page load.
          </>
        }
      >
        <HandshakeProbes />
      </LabSection>

      <LabSection
        id="replay"
        index="02"
        title={
          <>
            <U>useReplay</U> · P
          </>
        }
        note="A paused GSAP timeline, built on mount and parked on its last frame, so the server-rendered bench is the end state. P restarts it from zero and it lands on the same frame every time. At 2200ms the chip changes colour in 0ms; only the 180ms scale moves. Then it holds for 4000ms."
      >
        <ReplaySlot mode={mode} ids={ids} />
      </LabSection>

      <LabSection
        id="stamp"
        index="03"
        title={
          <>
            The <U>0ms</U> flip
          </>
        }
        note={
          <>
            <C>.stamp</C> carries no transition at all, whatever a utility asks for. The only motion is scale 1.045 to 1 over {DUR.state}ms on{" "}
            <C>--ease-snap</C>. Controlled: <C>useStamp</C> drives <C>data-stamp</C>. Declarative: the element re-mounts with the class.
          </>
        }
      >
        <StampDemo />
      </LabSection>

      <LabSection
        id="heartbeat"
        index="04"
        title="Heartbeat"
        note={
          <>
            The only loop in the product. It ticks at the telemetry period on <C>steps(1, end)</C>, turns <C>--marker</C> after 10s of silence and
            stops after 20s. The period is written on the dot, never on <C>:root</C>.
          </>
        }
      >
        <HeartbeatDemo />
      </LabSection>

      <LabSection
        id="reveal"
        index="05"
        title="Reveal"
        note={
          <>
            Mark an element <C>data-anim</C> with the class <C>reveal</C> and nothing else: one revealer per document shows it when its top
            crosses 84% of the viewport, {STAGGER.sibling}ms apart within a batch, capped at the {STAGGER.cap}th item.
          </>
        }
      >
        <RevealDemo />
      </LabSection>

      <LabSection
        id="draw"
        index="06"
        title="Draw"
        note={
          <>
            <C>stroke-dashoffset</C> on paths with <C>pathLength=&quot;1&quot;</C>, over {DUR.enter}ms on <C>--ease-instrument</C>. At rest a path
            has no dash, so a scaled hairline is solid; the dash is measured when a draw starts. At most six paths draw at once. Press{" "}
            <Kbd>W</Kbd> to replay the right-hand figure.
          </>
        }
      >
        <DrawDemo />
      </LabSection>

      <LabSection
        id="sequence"
        index="07"
        title={
          <>
            <U>useSequence</U> · S
          </>
        }
        note={
          <>
            Timed beats with no animation engine, for the dashboard. Each beat sets React state; CSS does any tweening. A timer wakes a frame
            early and <C>requestAnimationFrame</C> lands the beat, so a stalled frame catches up in order.
          </>
        }
      >
        <SequenceDemo />
      </LabSection>

      <LabSection id="reduced" index="08" title="Reduced motion" note="A designed second state, never an off switch. The toggle above writes the same attribute as the footer toggle; the OS preference takes the same path.">
        <dl className="grid gap-px overflow-hidden rounded-panel border border-rule-1 bg-rule-1">
          {REDUCED.map((row) => (
            <div key={row.type} className="grid gap-1 bg-ink-1 px-4 py-2 md:grid-cols-[14rem_1fr] md:gap-4">
              <dt className="type-data text-text-primary">{row.type}</dt>
              <dd className="type-small text-text-body">{row.becomes}</dd>
            </div>
          ))}
        </dl>
      </LabSection>

      <LabSection
        id="tokens"
        index="09"
        title="Tokens"
        note={
          <>
            <C>src/motion/tokens.ts</C>, which a unit test parses against <C>app/tokens/core.css</C>, so a GSAP timeline and a CSS transition
            cannot drift apart.
          </>
        }
      >
        <div className="grid gap-6 md:grid-cols-3">
          <dl className="type-data">
            {Object.values(EASE).map((e) => (
              <div key={e.cssVar} className="flex flex-col gap-0.5 border-b border-rule-hair py-2">
                <dt className="text-text-primary">{e.cssVar}</dt>
                <dd className="text-text-body [overflow-wrap:anywhere]">{e.css}</dd>
              </div>
            ))}
          </dl>
          <dl className="type-data">
            {(Object.keys(DUR) as (keyof typeof DUR)[]).map((name) => (
              <div key={name} className="flex justify-between gap-3 border-b border-rule-hair py-2">
                <dt className="text-text-primary">{DUR_VAR[name]}</dt>
                <dd className="text-text-body">{DUR[name]}ms</dd>
              </div>
            ))}
          </dl>
          <dl className="type-data">
            <div className="flex justify-between gap-3 border-b border-rule-hair py-2">
              <dt className="text-text-primary">--stagger-sibling</dt>
              <dd className="text-text-body">{STAGGER.sibling}ms</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-rule-hair py-2">
              <dt className="text-text-primary">--stagger-stage</dt>
              <dd className="text-text-body">{STAGGER.stage}ms</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-rule-hair py-2">
              <dt className="text-text-primary">row groups</dt>
              <dd className="text-text-body">{ROW_GROUP_DELAYS.map((d) => `${d}ms`).join(" / ")}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-rule-hair py-2">
              <dt className="text-text-primary">force-reveal</dt>
              <dd className="text-text-body">{HANDSHAKE.forceRevealMs}ms</dd>
            </div>
          </dl>
        </div>
      </LabSection>
    </div>
  );
}
