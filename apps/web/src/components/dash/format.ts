// Formatting shared by every dashboard route, so numbers read the same everywhere.

/** The fixture corpus is frozen at this instant; relative times are measured from it. */
export const CORPUS_NOW = Date.parse('2026-09-23T12:00:00Z');

export function relTime(iso: string | null | undefined, now: number = CORPUS_NOW): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return shortDate(iso);
}

/** One month spelling everywhere ("Sep", never ICU's "Sept"). */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "7 Sep" (UTC). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "7 Sep, 11:46 UTC". */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

export function usd(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toFixed(digits)}`;
}

export function seconds(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1) return `${Math.round(n * 1000)}ms`;
  if (n < 90) return `${n.toFixed(n < 10 ? 1 : 0)}s`;
  const m = Math.floor(n / 60);
  return `${m}m ${Math.round(n - m * 60)}s`;
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function sha(s: string | null | undefined, n = 7): string {
  return s ? s.slice(0, n) : '—';
}

export function repoSlug(repo: { owner: string; name: string } | null | undefined): string {
  return repo ? `${repo.owner}/${repo.name}` : '—';
}

/** `app/billing/rates.py` → `rates.py`; keeps the tail readable in tight rows. */
export function basename(path: string | null | undefined): string {
  if (!path) return '—';
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const SPECIALIST_LABEL: Record<string, string> = {
  bugs: 'Bugs',
  correctness: 'Correctness',
  security: 'Security',
  tests: 'Tests',
  test_integrity: 'Test integrity',
  quality: 'Quality',
  maintainability: 'Maintainability',
  performance: 'Performance',
};

export function humanize(key: string | null | undefined): string {
  if (!key) return '—';
  return SPECIALIST_LABEL[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
