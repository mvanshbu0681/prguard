'use client';
// /repos before anything is connected: the one photographic moment of the
// flow. A sky card with the pitch ("Bring your GitHub. Witness does the
// rest."), THE lime "Connect GitHub", a glass "Explore demo", and a glass paste
// field for anyone who would rather start from a link. On the right, three
// glass tiles show what connecting buys. Below, the flow in three illustrated
// steps rather than paragraphs.
import { ArrowRight, Ban, Check, Eye, MessageSquareText, ShieldCheck, X } from 'lucide-react';
import { TrackingMark } from '@/components/brand';
import { Avatar, AvatarStack, Button, Eyebrow, GateBadge, GlassTile, PhotoCard, ProofBadge, Rise, Tag } from '@/components/dash/kit';
import { GithubMark } from './GithubMark';
import type { RepoRef } from './model';
import { PasteBar } from './PasteBar';
import { SPECIALISTS } from './shared';
import s from './repos.module.css';

export interface ConnectLandingProps {
  totals: { proven: number; reviews: number; repositories: number; org: string };
  workspace: readonly RepoRef[];
  onConnect: (owner?: string) => void;
  onDemo: () => void;
  focusKey: number;
}

const TRUST = ['bugs', 'security', 'tests', 'quality'] as const;

export function ConnectLanding({ totals, workspace, onConnect, onDemo, focusKey }: ConnectLandingProps) {
  return (
    <>
      <Rise>
        <PhotoCard pad="none" position="6% 42%" priority sizes="(max-width: 900px) 100vw, 1200px" className={s.hero}>
          <span className={s.heroShade} aria-hidden />
          <div className={s.heroCopy}>
            <div className={s.trust}>
              <AvatarStack className={s.trustAvatars}>
                {TRUST.map((k) => (
                  <span key={k} className={s.trustAvatar} style={{ background: SPECIALISTS[k]!.color }}>
                    {SPECIALISTS[k]!.initials}
                  </span>
                ))}
              </AvatarStack>
              <p className={s.trustText}>
                {totals.proven} bugs proven across {totals.reviews} reviews
              </p>
            </div>
            <h1 className={s.heroTitle}>
              <span>Bring your GitHub.</span>
              <span className={s.heroSoft}>Witness does the rest.</span>
            </h1>
            <p className={s.heroSub}>Connect an organisation and every pull request gets a review that proves its claims. Rather start small? Paste a link.</p>
            <div className={s.heroActions}>
              <Button variant="primary" size="lg" chip={GithubMark} chipStill onClick={() => onConnect()}>
                Connect GitHub
              </Button>
              <Button variant="glass" size="lg" onClick={onDemo}>
                Explore demo
              </Button>
            </div>
            <div className={s.orRow} aria-hidden>
              <span>or paste a link</span>
            </div>
            <PasteBar
              variant="glass"
              workspace={workspace}
              onConnect={(owner) => onConnect(owner)}
              focusKey={focusKey}
              placeholder="Paste an org, repository or pull-request link"
              chips={['acme/checkout-service#4821', 'github.com/acme/ledger', 'github.com/acme']}
            />
          </div>

          <div className={s.heroArt} aria-hidden>
            <GlassTile tone="white" className={s.artInstall}>
              <div className={s.artHead}>
                <span className={s.artMark}>
                  <TrackingMark size={16} />
                </span>
                <span className={s.artDots}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={s.artGh}>
                  <GithubMark size={16} />
                </span>
                <span className={s.artHeadText}>Witness wants to</span>
              </div>
              {[
                [Eye, 'Read code and pull requests'],
                [ShieldCheck, 'Write the merge-gate check'],
                [MessageSquareText, 'Comment on pull requests'],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Eye;
                return (
                  <div key={text as string} className={s.artPerm}>
                    <I size={13} strokeWidth={2} />
                    <span>{text as string}</span>
                    <Check size={13} strokeWidth={2.6} className={s.artOk} />
                  </div>
                );
              })}
              <div className={s.artPerm} data-never="">
                <Ban size={13} strokeWidth={2} />
                <span>Never approves or merges</span>
              </div>
            </GlassTile>

            <GlassTile tone="white" className={s.artPr}>
              <div className="flex items-center justify-between gap-3">
                <span className={s.artMono}>checkout-service #4821</span>
                <GateBadge conclusion="failure" size="sm" />
              </div>
              <p className={s.artPrTitle}>
                <code>charge()</code> dereferences a None currency
              </p>
              <div className={s.artRuns}>
                <span data-ok="">
                  <Check size={11} strokeWidth={3} /> base 7c41a09 passed
                </span>
                <span data-bad="">
                  <X size={11} strokeWidth={3} /> head 9c2d4b1 failed
                </span>
              </div>
              <ProofBadge status="proven" size="sm" />
            </GlassTile>

            <GlassTile tone="navy" className={s.artRepos}>
              <span className={s.artRepoMarks}>
                {['checkout-service', 'identity-gateway', 'ledger', 'web-storefront'].map((n) => (
                  <Avatar key={n} name={n} size={24} square />
                ))}
              </span>
              <span>
                <b>{totals.repositories} repositories</b> in {totals.org}
              </span>
            </GlassTile>
          </div>
        </PhotoCard>
      </Rise>

      <Rise delay={120}>
        <section aria-labelledby="how-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2 id="how-title" className={s.stepsTitle}>
                Three steps.<span className="text-w-subtle"> Then every push is proven.</span>
              </h2>
            </div>
          </div>
          <ol className={s.steps}>
            <li className={s.step}>
              <div className={s.stepScene}>
                <div className={s.miniCard}>
                  <div className={s.miniMarks}>
                    <span className={s.miniWitness}>
                      <TrackingMark size={15} />
                    </span>
                    <span className={s.miniDots}>
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className={s.miniGh}>
                      <GithubMark size={15} />
                    </span>
                  </div>
                  <div className={s.miniAccount}>
                    <Avatar name="acme" size={26} square />
                    <span>
                      <b>acme</b>
                      <small>Organization</small>
                    </span>
                    <span className={s.miniRadio} />
                  </div>
                  <span className={s.miniPill}>Install &amp; authorize</span>
                </div>
              </div>
              <div className={s.stepBody}>
                <span className={s.stepNum}>Step 1</span>
                <h3 className={s.stepTitle}>Connect GitHub</h3>
                <p className={s.stepText}>Install the app on an organisation. Read access to code, write access to checks.</p>
              </div>
              <span className={s.stepArrow} aria-hidden>
                <ArrowRight size={15} strokeWidth={2} />
              </span>
            </li>

            <li className={s.step}>
              <div className={s.stepScene}>
                <div className={s.miniCard}>
                  {[
                    ['checkout-service', true],
                    ['web-storefront', true],
                    ['infra-terraform', false],
                  ].map(([name, on]) => (
                    <div key={name as string} className={s.miniRepo}>
                      <Avatar name={name as string} size={22} square />
                      <span className={s.miniRepoName}>{name as string}</span>
                      <span className={s.miniToggle} data-on={on ? '' : undefined} aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.stepBody}>
                <span className={s.stepNum}>Step 2</span>
                <h3 className={s.stepTitle}>Pick repositories</h3>
                <p className={s.stepText}>All of them, or only a few. Switch Witness off on any repository later.</p>
              </div>
              <span className={s.stepArrow} aria-hidden>
                <ArrowRight size={15} strokeWidth={2} />
              </span>
            </li>

            <li className={s.step}>
              <div className={s.stepScene}>
                <div className={s.miniCard}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={s.artMono}>#4821</span>
                    <GateBadge conclusion="failure" size="sm" />
                  </div>
                  <div className={s.miniRuns}>
                    <span data-ok="">
                      <Check size={10} strokeWidth={3} /> base passed
                    </span>
                    <span data-bad="">
                      <X size={10} strokeWidth={3} /> head failed
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProofBadge status="proven" size="sm" />
                    <ProofBadge status="disproven" size="sm" />
                    <Tag tone="soft" size="sm">
                      7 dropped
                    </Tag>
                  </div>
                </div>
              </div>
              <div className={s.stepBody}>
                <span className={s.stepNum}>Step 3</span>
                <h3 className={s.stepTitle}>Every PR, proven</h3>
                <p className={s.stepText}>Each claim gets a repro test at base and head. Only a proven bug holds the merge.</p>
              </div>
            </li>
          </ol>
        </section>
      </Rise>
    </>
  );
}
