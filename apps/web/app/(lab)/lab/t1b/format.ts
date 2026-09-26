// OWNER: T1b (wave 1). Pure formatting for the /lab/t1b specimens. Kept apart
// from lab-data.ts so client components never pull openapi.json into a bundle.

/** first-8 … last-4, the hash form everywhere (design §2.5). */
export function shortHash(value: string): string {
  return value.length <= 13 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/** Seven characters in prose (brand-gaps §D numeric style). */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
