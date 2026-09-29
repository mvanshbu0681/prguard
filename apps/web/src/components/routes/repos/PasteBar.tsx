'use client';
// The one field that starts everything: paste an organisation, a repository or
// a pull request. A PR or repository opens in place (an unknown repository is
// imported first), an account link starts the GitHub connection for it, and
// anything else is an inline error under the field. Two looks: glass on the
// sky hero, a pill field with THE lime "Analyze" on a card.
import { ArrowRight, ArrowUpRight, Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, TextField } from '@/components/dash/kit';
import { cn } from '@/lib/utils';
import { GithubMark } from './GithubMark';
import { resolvePaste, type RepoRef } from './model';
import { reposStore } from './store';
import s from './repos.module.css';

export interface PasteBarProps {
  variant: 'glass' | 'panel';
  workspace: readonly RepoRef[];
  onConnect: (owner: string) => void;
  chips?: string[];
  /** Bump to move the cursor into the field (the sidebar's "New review" lands here). */
  focusKey?: number;
  placeholder?: string;
  className?: string;
}

export function PasteBar({ variant, workspace, onConnect, chips = [], focusKey = 0, placeholder, className }: PasteBarProps) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.closest('form')?.scrollIntoView({ block: 'center' });
  }, [focusKey]);

  function submit(candidate: string) {
    const target = resolvePaste(candidate, workspace);
    if (target.action === 'error') {
      setError(target.message);
      return;
    }
    setError(null);
    if (target.action === 'connect') {
      onConnect(target.owner);
      return;
    }
    if (target.importRepo) reposStore.importRepo(target.importRepo);
    setPending(true);
    router.push(target.href);
  }

  const onChange = (v: string) => {
    setValue(v);
    if (error) setError(null);
  };
  const ph = placeholder ?? 'github.com/acme/checkout-service/pull/4821';

  return (
    <form
      className={cn(s.paste, variant === 'glass' ? s.pasteGlass : s.pastePanel, className)}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <label htmlFor={inputId} className={s.srOnly}>
        GitHub link
      </label>
      {variant === 'glass' ? (
        <div className={s.glassField}>
          <Link2 size={17} strokeWidth={1.9} aria-hidden className={s.glassFieldIcon} />
          <input
            id={inputId}
            ref={inputRef}
            className={s.glassInput}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={ph}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button type="submit" className={s.glassGo} aria-label="Open link" disabled={pending}>
            <ArrowRight size={17} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <TextField
          id={inputId}
          ref={inputRef}
          size="lg"
          variant="outline"
          mono
          icon={GithubMark}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={ph}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          wrapperClassName={s.panelField}
          trailing={
            <Button type="submit" variant="primary" size="lg" chip={ArrowUpRight} disabled={pending}>
              {pending ? 'Opening' : 'Analyze'}
            </Button>
          }
        />
      )}
      {error ? (
        <p id={errorId} className={s.pasteError} role="alert">
          {error}
        </p>
      ) : null}
      {chips.length ? (
        <div className={s.tryRow}>
          <span className={s.tryLabel}>Try</span>
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className={s.tryChip}
              onClick={() => {
                setValue(c);
                setError(null);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
