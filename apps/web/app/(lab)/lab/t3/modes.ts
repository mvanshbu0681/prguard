// OWNER: T3 (wave 1). The runtime modes of /lab/t3, as plain data. Not a "use client"
// module: the server page reads these values, and a value exported from a client module
// would reach the server as an opaque client reference.
export type RuntimeMode = "ok" | "late" | "blocked";
export const RUNTIME_MODES: readonly RuntimeMode[] = ["ok", "late", "blocked"];
/** ?runtime=late loads GSAP this long after hydration: after the 1600ms force-reveal. */
export const LATE_MS = 2500;

export function parseMode(value: string | string[] | undefined): RuntimeMode {
  const v = Array.isArray(value) ? value[0] : value;
  return (RUNTIME_MODES as readonly string[]).includes(v ?? "") ? (v as RuntimeMode) : "ok";
}
