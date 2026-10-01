"use client";

import { Mark } from "./brand";
import { buttonClass } from "./ui/button";

export function Unavailable() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark size={24} />
        <p className="text-sm text-body">Couldn&apos;t reach PR Guard.</p>
        <button type="button" onClick={() => window.location.reload()} className={buttonClass({ size: "sm" })}>
          Retry
        </button>
      </div>
    </main>
  );
}
