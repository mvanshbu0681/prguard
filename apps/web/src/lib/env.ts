// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// Defaults live in code because `.env.*` files are gitignored at the repo root.
// Fixture mode is off: the synthetic demo corpus it served was removed, because
// the landing page shows only real data (src/sandbox). NEXT_PUBLIC_* values are
// inlined at build time.
export const FIXTURES = false;
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
