'use client';
// The viewer's side of the Repositories demo: whether GitHub is "connected"
// (and to which account, with what access), the repositories they imported by
// pasting a link, the ones they switched Witness off on, and the reviews they
// started here. It is a per-viewer demo convenience, so it lives in
// localStorage (every access in try/catch) behind a tiny external store:
// useSyncExternalStore gives each view the same snapshot, and a change in one
// tab reaches the others through the `storage` event.
//
// The server snapshot is null: a view renders its neutral skeleton until the
// browser's state is known, so a reload never flashes the wrong state.
import { useSyncExternalStore } from 'react';
import { DEMO_ORG, pullKey, sameRepo, slugOf, syntheticRepoNames, type RepoRef } from './model';

export const REPOS_STORAGE_KEY = 'witness:repos:v1';

export interface Connection {
  account: string;
  kind: 'org' | 'user';
  access: 'all' | 'select';
  /** Repository names chosen under "Only select repositories". */
  repos: string[];
  connectedAt: string;
}

export interface ImportedRepo extends RepoRef {
  importedAt: string;
}

export interface AnalysisRecord {
  /** Epoch ms the simulated review started in this browser. */
  startedAt: number;
}

export interface ReposState {
  v: 1;
  connection: Connection | null;
  imported: ImportedRepo[];
  /** Slugs (lower case) Witness is switched off on. */
  disabled: string[];
  /** pullKey → the simulated review started here. */
  analyses: Record<string, AnalysisRecord>;
}

const EMPTY: ReposState = { v: 1, connection: null, imported: [], disabled: [], analyses: {} };

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: ReposState | null = null;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(): ReposState {
  try {
    const raw = storage()?.getItem(REPOS_STORAGE_KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<ReposState>;
    if (v?.v !== 1) return EMPTY;
    return {
      v: 1,
      connection: v.connection ?? null,
      imported: Array.isArray(v.imported) ? v.imported : [],
      disabled: Array.isArray(v.disabled) ? v.disabled : [],
      analyses: v.analyses && typeof v.analyses === 'object' ? v.analyses : {},
    };
  } catch {
    return EMPTY;
  }
}

function snapshot(): ReposState {
  if (cache === null) cache = read();
  return cache;
}

function write(next: ReposState): void {
  cache = next;
  try {
    storage()?.setItem(REPOS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the state still holds for this page view */
  }
  listeners.forEach((l) => l());
}

function update(fn: (s: ReposState) => ReposState): void {
  write(fn(snapshot()));
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== REPOS_STORAGE_KEY) return;
  cache = read();
  listeners.forEach((l) => l());
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** The viewer's state, or null during server render and hydration. */
export function useReposState(): ReposState | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

const nowIso = () => new Date().toISOString();

export const reposStore = {
  connect(c: Omit<Connection, 'connectedAt'>): void {
    update((s) => ({ ...s, connection: { ...c, connectedAt: nowIso() } }));
  },
  /** The demo workspace: acme, every repository. */
  connectDemo(): void {
    update((s) => ({ ...s, connection: { account: DEMO_ORG, kind: 'org', access: 'all', repos: [], connectedAt: nowIso() } }));
  },
  disconnect(): void {
    update((s) => ({ ...s, connection: null }));
  },
  importRepo(ref: RepoRef): void {
    update((s) => (s.imported.some((r) => sameRepo(r, ref)) ? s : { ...s, imported: [{ owner: ref.owner, name: ref.name, importedAt: nowIso() }, ...s.imported] }));
  },
  removeImported(ref: RepoRef): void {
    update((s) => ({ ...s, imported: s.imported.filter((r) => !sameRepo(r, ref)) }));
  },
  setEnabled(ref: RepoRef, on: boolean): void {
    const slug = slugOf(ref).toLowerCase();
    update((s) => ({ ...s, disabled: on ? s.disabled.filter((d) => d !== slug) : [...new Set([...s.disabled, slug])] }));
  },
  /** Starts a simulated review now (or at `startedAt`, for tests). */
  startAnalysis(ref: RepoRef, number: number, startedAt: number = Date.now()): void {
    const key = pullKey(ref, number);
    update((s) => ({ ...s, analyses: { ...s.analyses, [key]: { startedAt } } }));
  },
  clearAnalysis(ref: RepoRef, number: number): void {
    const key = pullKey(ref, number);
    update((s) => {
      const analyses = { ...s.analyses };
      delete analyses[key];
      return { ...s, analyses };
    });
  },
  reset(): void {
    write(EMPTY);
  },
};

export function isEnabled(state: ReposState | null, ref: RepoRef): boolean {
  return !state?.disabled.includes(slugOf(ref).toLowerCase());
}

export function analysisFor(state: ReposState | null, ref: RepoRef, number: number): AnalysisRecord | null {
  return state?.analyses[pullKey(ref, number)] ?? null;
}

export interface WorkspaceRepo {
  ref: RepoRef;
  source: 'installed' | 'imported';
}

/** Repository names an account holds: the corpus for acme, a stable synthetic set for anyone else. */
export function accountRepoNames(account: string, fixtureRefs: readonly RepoRef[]): string[] {
  if (account.toLowerCase() === DEMO_ORG) return fixtureRefs.filter((r) => r.owner.toLowerCase() === DEMO_ORG).map((r) => r.name);
  return syntheticRepoNames(account);
}

/** Every repository in the viewer's workspace: the installation's, then imported ones not already covered. */
export function workspaceRepos(state: ReposState | null, fixtureRefs: readonly RepoRef[]): WorkspaceRepo[] {
  if (!state) return [];
  const out: WorkspaceRepo[] = [];
  const c = state.connection;
  if (c) {
    const names = accountRepoNames(c.account, fixtureRefs);
    const chosen = c.access === 'all' ? names : names.filter((n) => c.repos.includes(n));
    const canonical = (name: string): RepoRef => fixtureRefs.find((r) => sameRepo(r, { owner: c.account, name })) ?? { owner: c.account, name };
    for (const n of chosen) out.push({ ref: canonical(n), source: 'installed' });
  }
  for (const r of state.imported) if (!out.some((w) => sameRepo(w.ref, r))) out.push({ ref: { owner: r.owner, name: r.name }, source: 'imported' });
  return out;
}
