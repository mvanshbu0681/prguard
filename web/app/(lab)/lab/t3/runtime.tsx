"use client";
// OWNER: T3 (wave 1). Loads the animation runtime for /lab/t3 the way the page asks:
//   ?runtime=ok       (default) GSAP loads right after hydration
//   ?runtime=late     GSAP loads 2.5s in: the force-reveal has already fired, so the
//                     handshake keeps that content static and reveals only what mounts later
//   ?runtime=blocked  GSAP never loads (a bundle 404 on venue wifi): [data-anim] content
//                     force-reveals at 1600ms and every set-piece stays on its end frame
// Nothing else on the page imports GSAP or Motion, so this slot decides whether the
// handshake is ever disarmed.
import { lazy, Suspense, useEffect, useState } from "react";
import { Bench, type BenchIds } from "./bench";
import { Kbd, LabButton } from "./lab-ui";
import { LATE_MS, type RuntimeMode } from "./modes";

const ReplayDemo = lazy(() => import("./replay-demo").then((m) => ({ default: m.ReplayDemo })));

function StaticReplay({ ids, note }: { ids: BenchIds; note: string }) {
  return (
    <div className="space-y-4">
      <Bench ids={ids} />
      <div className="flex flex-wrap items-center gap-3">
        <LabButton disabled aria-keyshortcuts="P">
          replay <Kbd>P</Kbd>
        </LabButton>
        <p className="type-data text-text-dim">{note}</p>
      </div>
    </div>
  );
}

export function ReplaySlot({ mode, ids }: { mode: RuntimeMode; ids: BenchIds }) {
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (mode === "blocked") return;
    const timer = window.setTimeout(() => setLoad(true), mode === "late" ? LATE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  if (!load) {
    const note = mode === "blocked" ? "runtime blocked: the bench stays on its end frame and P does nothing" : mode === "late" ? `the runtime loads at ${LATE_MS}ms` : "loading the runtime";
    return <StaticReplay ids={ids} note={note} />;
  }
  return (
    <Suspense fallback={<StaticReplay ids={ids} note="loading the runtime" />}>
      <ReplayDemo ids={ids} />
    </Suspense>
  );
}
