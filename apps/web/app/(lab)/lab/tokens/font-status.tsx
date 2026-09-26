"use client";
// OWNER: T0 (wave 0). Lists the FontFaces the document actually loaded, so a
// screenshot proves the self-hosted variable faces rendered (not a fallback).
import { useEffect, useState } from "react";

type Row = { family: string; weight: string; status: string };

export function FontStatus() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      const next: Row[] = [];
      document.fonts.forEach((f) => next.push({ family: f.family, weight: f.weight, status: f.status }));
      setRows(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <ul data-testid="font-status" className="type-data text-text-body">
      {rows === null ? (
        <li className="text-text-dim">waiting for document.fonts.ready</li>
      ) : rows.length === 0 ? (
        <li className="text-marker">no FontFace registered</li>
      ) : (
        // Keyed by position: next dev's overlay registers its own faces more than once.
        rows.map((r, i) => (
          <li key={i}>
            {r.family} · wght {r.weight} · <span className={r.status === "loaded" ? "text-signal-text" : "text-marker"}>{r.status}</span>
          </li>
        ))
      )}
    </ul>
  );
}
