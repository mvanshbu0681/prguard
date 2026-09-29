// The paste box: every GitHub link shape it accepts, where each one goes, and
// the inline error for anything else.
import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT_MESSAGE, INVALID_INPUT_MESSAGE, parseRepoInput, resolvePaste } from '@/components/routes/repos/model';

describe('parseRepoInput', () => {
  it('reads a pull-request URL and the owner/repo#n shorthand', () => {
    expect(parseRepoInput('https://github.com/acme/checkout-service/pull/4821')).toEqual({ kind: 'pull', owner: 'acme', name: 'checkout-service', number: 4821 });
    expect(parseRepoInput('  github.com/acme/ledger/pull/318/files ')).toEqual({ kind: 'pull', owner: 'acme', name: 'ledger', number: 318 });
    expect(parseRepoInput('acme/web-storefront#1135')).toEqual({ kind: 'pull', owner: 'acme', name: 'web-storefront', number: 1135 });
  });

  it('reads a repository from a URL, a .git remote, an SSH remote or owner/name', () => {
    expect(parseRepoInput('https://github.com/vercel/next.js')).toEqual({ kind: 'repo', owner: 'vercel', name: 'next.js' });
    expect(parseRepoInput('https://github.com/vercel/next.js.git')).toEqual({ kind: 'repo', owner: 'vercel', name: 'next.js' });
    expect(parseRepoInput('github.com/acme/ledger/tree/main/app')).toEqual({ kind: 'repo', owner: 'acme', name: 'ledger' });
    expect(parseRepoInput('git@github.com:acme/notifications.git')).toEqual({ kind: 'repo', owner: 'acme', name: 'notifications' });
    expect(parseRepoInput('acme/infra-terraform')).toEqual({ kind: 'repo', owner: 'acme', name: 'infra-terraform' });
  });

  it('reads an account from github.com/owner or @owner', () => {
    expect(parseRepoInput('https://github.com/acme')).toEqual({ kind: 'owner', owner: 'acme' });
    expect(parseRepoInput('github.com/acme/')).toEqual({ kind: 'owner', owner: 'acme' });
    expect(parseRepoInput('@octo-org')).toEqual({ kind: 'owner', owner: 'octo-org' });
  });

  it('rejects empty input, other hosts, GitHub pages that are not accounts, and PR #0', () => {
    expect(parseRepoInput('   ')).toEqual({ kind: 'error', message: EMPTY_INPUT_MESSAGE });
    for (const bad of ['https://gitlab.com/acme/ledger', 'github.com/settings', 'github.com/orgs/acme', 'acme', 'not a url', 'acme/ledger#0']) {
      expect(parseRepoInput(bad), bad).toEqual({ kind: 'error', message: INVALID_INPUT_MESSAGE });
    }
  });
});

describe('resolvePaste', () => {
  const workspace = [
    { owner: 'acme', name: 'checkout-service' },
    { owner: 'acme', name: 'ledger' },
  ];

  it('opens a PR of a workspace repository in place, with its canonical casing', () => {
    expect(resolvePaste('github.com/ACME/Checkout-Service/pull/4821', workspace)).toEqual({ action: 'navigate', href: '/repos/acme/checkout-service/pulls/4821', importRepo: null });
    expect(resolvePaste('acme/ledger', workspace)).toEqual({ action: 'navigate', href: '/repos/acme/ledger', importRepo: null });
  });

  it('imports an unknown repository before opening it', () => {
    expect(resolvePaste('https://github.com/vercel/next.js/pull/77', workspace)).toEqual({
      action: 'navigate',
      href: '/repos/vercel/next.js/pulls/77',
      importRepo: { owner: 'vercel', name: 'next.js' },
    });
  });

  it('starts the GitHub connection for an account link, and surfaces errors', () => {
    expect(resolvePaste('github.com/acme', workspace)).toEqual({ action: 'connect', owner: 'acme' });
    expect(resolvePaste('', workspace)).toEqual({ action: 'error', message: EMPTY_INPUT_MESSAGE });
  });
});
