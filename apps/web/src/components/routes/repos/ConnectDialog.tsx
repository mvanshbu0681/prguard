'use client';
// "Connect GitHub", simulated: the GitHub App install screen in Witness's own
// language. Pick an account, choose repository access (all, or a checklist),
// read the three permissions Witness asks for (and the one thing it never
// does), then "Install & authorize" plays a short sequence — authorizing,
// fetching repositories, subscribing to events — and the workspace is live.
// Nothing leaves the browser: the result is written to the demo store.
import { Ban, Check, Eye, LoaderCircle, MessageSquareText, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TrackingMark } from '@/components/brand';
import { Avatar, Button, Tag } from '@/components/dash/kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { GithubMark } from './GithubMark';
import { DEMO_ORG, PERSONAL_ACCOUNT, type LangKey, type RepoRef } from './model';
import { LangDot } from './shared';
import { accountRepoNames, reposStore, type Connection } from './store';
import s from './repos.module.css';

export interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixtureRefs: readonly RepoRef[];
  /** Lower-case slug → language, for the corpus repositories. */
  languages: Record<string, LangKey>;
  /** An account named by a pasted link: offered first and preselected. */
  initialAccount?: string | null;
  /** The live connection, when managing access instead of installing. */
  current?: Connection | null;
  onDone?: () => void;
}

interface Account {
  login: string;
  kind: 'org' | 'user';
}

type Phase = 'account' | 'access' | 'installing' | 'done';

const PERMISSIONS: { icon: LucideIcon; title: string; detail: string; never?: boolean }[] = [
  { icon: Eye, title: 'Read code and pull requests', detail: 'Contents, metadata and diffs, to review them' },
  { icon: ShieldCheck, title: 'Write checks', detail: 'The witness/merge-gate status on each head commit' },
  { icon: MessageSquareText, title: 'Write pull-request comments', detail: 'One review per push, findings on their lines' },
  { icon: Ban, title: 'Never push, approve or merge', detail: 'Witness has no write access to code', never: true },
];

export function ConnectDialog({ open, onOpenChange, ...rest }: ConnectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={s.dlg} aria-describedby={undefined}>
        {open ? <ConnectFlow {...rest} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConnectFlow({
  fixtureRefs,
  languages,
  initialAccount,
  current,
  onDone,
  close,
}: Omit<ConnectDialogProps, 'open' | 'onOpenChange'> & { close: () => void }) {
  const accounts = useMemo<Account[]>(() => {
    const list: Account[] = [
      { login: DEMO_ORG, kind: 'org' },
      { login: PERSONAL_ACCOUNT, kind: 'user' },
    ];
    const extra = initialAccount ?? current?.account;
    if (extra && !list.some((a) => a.login.toLowerCase() === extra.toLowerCase())) list.unshift({ login: extra, kind: 'org' });
    return list;
  }, [initialAccount, current]);

  const managing = !!current;
  const [phase, setPhase] = useState<Phase>(managing ? 'access' : 'account');
  const [login, setLogin] = useState<string>(current?.account ?? initialAccount ?? DEMO_ORG);
  const [access, setAccess] = useState<'all' | 'select'>(current?.access ?? 'all');
  const names = useMemo(() => accountRepoNames(login, fixtureRefs), [login, fixtureRefs]);
  const [picked, setPicked] = useState<string[] | null>(current?.access === 'select' ? current.repos : null);
  const selected = picked ?? names;
  const [tick, setTick] = useState(0);
  const account = accounts.find((a) => a.login.toLowerCase() === login.toLowerCase()) ?? { login, kind: 'org' as const };
  const count = access === 'all' ? names.length : selected.length;

  const langOf = (name: string): LangKey | null => languages[`${login}/${name}`.toLowerCase()] ?? null;

  // The install sequence: three beats, then the workspace is written.
  useEffect(() => {
    if (phase !== 'installing') return;
    const timers = [650, 1350, 2050].map((ms, i) => setTimeout(() => setTick(i + 1), ms));
    const done = setTimeout(() => {
      reposStore.connect({ account: account.login, kind: account.kind, access, repos: access === 'select' ? selected : [] });
      setPhase('done');
    }, 2500);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
    // Runs once per install; the inputs are frozen while installing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const steps: { key: Phase; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'access', label: 'Access' },
    { key: 'installing', label: 'Install' },
  ];
  const stepIndex = phase === 'done' ? 3 : steps.findIndex((x) => x.key === phase);

  return (
    <>
      <div className={s.dlgHead}>
        <div className={s.dlgMarks} aria-hidden>
          <span className={s.dlgWitness}>
            <TrackingMark size={22} />
          </span>
          <span className={s.dlgLink} data-live={phase === 'installing' || phase === 'done' ? '' : undefined}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={s.dlgGithub}>
            <GithubMark size={22} />
          </span>
        </div>
        <DialogTitle className={s.dlgTitle}>{phase === 'done' ? `${account.login} is connected` : managing ? 'Repository access' : 'Install Witness'}</DialogTitle>
        <DialogDescription className={s.dlgDesc}>
          {phase === 'done'
            ? count
              ? `${count} ${count === 1 ? 'repository is' : 'repositories are'} ready. New pull requests are reviewed as they open.`
              : 'Witness cannot list this account’s repositories in the demo. Paste a repository or pull-request link to add one.'
            : 'The Witness GitHub App reads your pull requests and reports back with proof. It never merges.'}
        </DialogDescription>
        {phase !== 'done' ? (
          <ol className={s.dlgSteps} aria-label="Install steps">
            {steps.map((st, i) => (
              <li key={st.key} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'}>
                <span>{i < stepIndex ? <Check size={11} strokeWidth={3} aria-hidden /> : i + 1}</span>
                {st.label}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className={s.dlgBody}>
        {phase === 'account' ? (
          <div role="radiogroup" aria-label="GitHub account" className={s.optList}>
            <p className={s.dlgLabel}>Where should Witness be installed?</p>
            {accounts.map((a) => {
              const n = accountRepoNames(a.login, fixtureRefs).length;
              const on = a.login.toLowerCase() === login.toLowerCase();
              return (
                <button
                  key={a.login}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={s.opt}
                  onClick={() => {
                    setLogin(a.login);
                    setPicked(null);
                  }}
                >
                  <Avatar name={a.login} size={36} square={a.kind === 'org'} />
                  <span className="min-w-0 flex-1">
                    <span className={s.optTitle}>{a.login}</span>
                    <span className={s.optMeta}>
                      {a.kind === 'org' ? 'Organization' : 'Personal account'} · {n ? `${n} ${n === 1 ? 'repository' : 'repositories'}` : 'repositories listed after authorizing'}
                    </span>
                  </span>
                  {a.login === DEMO_ORG ? (
                    <Tag tone="soft" size="sm">
                      Demo data
                    </Tag>
                  ) : null}
                  <span className={s.radio} aria-hidden />
                </button>
              );
            })}
          </div>
        ) : null}

        {phase === 'access' ? (
          <div className="flex flex-col gap-5">
            <div role="radiogroup" aria-label="Repository access" className={s.optList}>
              <p className={s.dlgLabel}>
                Repository access on <b>{account.login}</b>
              </p>
              <button type="button" role="radio" aria-checked={access === 'all'} className={s.opt} onClick={() => setAccess('all')}>
                <span className="min-w-0 flex-1">
                  <span className={s.optTitle}>All repositories</span>
                  <span className={s.optMeta}>{names.length ? `All ${names.length} today, and any created later` : 'Every repository, as GitHub lists them'}</span>
                </span>
                <span className={s.radio} aria-hidden />
              </button>
              <button type="button" role="radio" aria-checked={access === 'select'} className={s.opt} onClick={() => setAccess('select')}>
                <span className="min-w-0 flex-1">
                  <span className={s.optTitle}>Only select repositories</span>
                  <span className={s.optMeta}>{access === 'select' ? `${selected.length} of ${names.length} selected` : 'Choose them one by one'}</span>
                </span>
                <span className={s.radio} aria-hidden />
              </button>
              {access === 'select' ? (
                <div className={s.checklist}>
                  {names.map((n) => {
                    const on = selected.includes(n);
                    return (
                      <label key={n} className={s.checkRow}>
                        <input
                          type="checkbox"
                          className={s.checkbox}
                          checked={on}
                          onChange={() => setPicked(on ? selected.filter((x) => x !== n) : [...selected, n])}
                        />
                        <Avatar name={n} size={24} square />
                        <span className={s.checkName}>
                          <span className="text-w-subtle">{account.login}/</span>
                          {n}
                        </span>
                        <LangDot lang={langOf(n)} />
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className={s.perms}>
              <p className={s.dlgLabel}>Witness will be able to</p>
              {PERMISSIONS.map((p) => (
                <div key={p.title} className={s.perm} data-never={p.never ? '' : undefined}>
                  <span className={s.permIcon}>
                    <p.icon size={15} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={s.permTitle}>{p.title}</span>
                    <span className={s.permDetail}>{p.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {phase === 'installing' || phase === 'done' ? (
          <div className={s.install}>
            {[
              { title: `Authorizing Witness on ${account.login}`, detail: 'GitHub App installation token' },
              { title: count ? `Fetching ${count} ${count === 1 ? 'repository' : 'repositories'}` : 'Fetching repositories', detail: count ? 'Default branches, languages, open pull requests' : 'Not available in the demo: add repositories by link' },
              { title: 'Subscribing to pull-request events', detail: 'pull_request · check_run · issue_comment' },
            ].map((row, i) => {
              const state = phase === 'done' || tick > i ? 'done' : tick === i ? 'active' : 'todo';
              return (
                <div key={row.title} className={s.installRow} data-state={state}>
                  <span className={s.installIcon}>
                    {state === 'done' ? <Check size={13} strokeWidth={3} aria-hidden /> : state === 'active' ? <LoaderCircle size={15} strokeWidth={2.2} className={s.spin} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className={s.installTitle}>{row.title}</span>
                    <span className={s.installDetail}>{row.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={s.dlgFoot}>
        {phase === 'account' ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="dark" onClick={() => setPhase('access')}>
              Continue
            </Button>
          </>
        ) : null}
        {phase === 'access' ? (
          <>
            {managing ? (
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setPhase('account')}>
                Back
              </Button>
            )}
            <Button variant="primary" chip={GithubMark} chipStill disabled={access === 'select' && selected.length === 0} onClick={() => setPhase('installing')}>
              {managing ? 'Save access' : 'Install & authorize'}
            </Button>
          </>
        ) : null}
        {phase === 'installing' ? (
          <p className={cn(s.dlgNote)} role="status">
            Talking to GitHub…
          </p>
        ) : null}
        {phase === 'done' ? (
          <Button
            variant="primary"
            chip
            onClick={() => {
              close();
              onDone?.();
            }}
          >
            Open repositories
          </Button>
        ) : null}
      </div>
    </>
  );
}
