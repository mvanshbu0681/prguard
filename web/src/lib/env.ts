// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// Defaults live in code because `.env.*` files are gitignored at the repo root.
// Fixture mode is ON unless explicitly disabled with NEXT_PUBLIC_FIXTURES=0, so
// the whole app builds and demos with the FastAPI backend stopped (plan, binding
// condition). NEXT_PUBLIC_* values are inlined at build time.
export const FIXTURES = process.env.NEXT_PUBLIC_FIXTURES !== '0';
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
