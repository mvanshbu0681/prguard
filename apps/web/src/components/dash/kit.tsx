// The dashboard kit: every primitive a route composes, on the landing-page
// system. Styling lives in kit.module.css and reads only --w-* tokens, so each
// piece renders correctly in light and dark with no theme logic of its own.
//
// Rules of use (keep the dashboard reading as one product):
// - Buttons: <Button variant="primary" chip> is THE call to action (at most one
//   per view). "dark" is the strong secondary, "outline"/"secondary"/"ghost"
//   the quiet ones. "glass" only ever sits on a photograph.
// - Cards: "surface" (grey) is the default card on the white panel; "inset"
//   is a white card inside a grey one; "ink" and "lime" are accents, one or
//   two per screen; <PhotoCard> is the sky image with glass tiles on it.
// - Labels are <Eyebrow>, numbers are <Stat>, states are <Tag>/<GateBadge>/
//   <ProofBadge>/<SeverityScore>. Don't hand-roll these.
import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDashed,
  CircleSlash,
  FlaskConical,
  FlaskConicalOff,
  Loader,
  Minus,
  ShieldAlert,
  ShieldCheck,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { Children, useId } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ElementType, HTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';
import s from './kit.module.css';

export { s as kitStyles };

/* ==========================================================================
   Button
   ========================================================================== */

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'outline' | 'ghost' | 'glass' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing circular chip (landing CTA). `true` = ArrowUpRight, which rotates 45° on hover. */
  chip?: LucideIcon | true;
  /** Keep the chip still on hover (for non-directional icons like Plus). */
  chipStill?: boolean;
  /** Render as a Next <Link>. */
  href?: string;
  /** With `href`: open in a new tab (adds rel="noreferrer"). */
  external?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps>;

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: s.primary,
  dark: s.dark,
  secondary: s.secondary,
  outline: s.outline,
  ghost: s.ghost,
  glass: s.glass,
  danger: s.danger,
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export function Button({ variant = 'secondary', size = 'md', icon: Lead, chip, chipStill, href, external, className, children, type, ...rest }: ButtonProps) {
  const ChipIcon = chip === true ? ArrowUpRight : chip;
  const cls = cn(
    s.btn,
    BTN_VARIANT[variant],
    size === 'sm' && s.sm,
    size === 'lg' && s.lg,
    ChipIcon && s.withChip,
    chipStill && s.chipStill,
    className,
  );
  const inner = (
    <>
      {Lead ? <Lead size={ICON_SIZE[size]} strokeWidth={1.9} aria-hidden /> : null}
      {children}
      {ChipIcon ? (
        <span className={s.chip} aria-hidden>
          <ChipIcon size={ICON_SIZE[size]} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );
  if (href && external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer" aria-label={rest['aria-label']} title={rest.title}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} aria-disabled={rest.disabled || undefined} onClick={rest.onClick as never} aria-label={rest['aria-label']} title={rest.title}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} {...rest}>
      {inner}
    </button>
  );
}

/* ==========================================================================
   IconButton
   ========================================================================== */

export type IconButtonVariant = 'ghost' | 'secondary' | 'outline' | 'dark' | 'lime' | 'glass';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name; also the native tooltip. */
  label: string;
  variant?: IconButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** A small red notification dot. */
  badge?: boolean;
  href?: string;
}

const IB_VARIANT: Record<IconButtonVariant, string | undefined> = {
  ghost: undefined,
  secondary: s.ibSecondary,
  outline: s.ibOutline,
  dark: s.ibDark,
  lime: s.ibLime,
  glass: s.ibGlass,
};

export function IconButton({ icon: Glyph, label, variant = 'ghost', size = 'md', badge, href, className, type, ...rest }: IconButtonProps) {
  const cls = cn(s.iconBtn, IB_VARIANT[variant], size === 'sm' && s.ibSm, size === 'lg' && s.ibLg, className);
  const px = size === 'sm' ? 15 : size === 'lg' ? 19 : 17;
  const inner = (
    <>
      <Glyph size={px} strokeWidth={1.8} aria-hidden />
      {badge ? <span className={s.badgeDot} aria-hidden /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label} title={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} aria-label={label} title={label} {...rest}>
      {inner}
    </button>
  );
}

/* ==========================================================================
   Cards
   ========================================================================== */

export type CardTone = 'surface' | 'panel' | 'inset' | 'ink' | 'lime' | 'navy';
export type CardPad = 'none' | 'sm' | 'md' | 'lg';

const TONE: Record<CardTone, string> = {
  surface: s.tSurface,
  panel: s.tPanel,
  inset: s.tInset,
  ink: s.tInk,
  lime: s.tLime,
  navy: s.tNavy,
};
const PAD: Record<CardPad, string> = { none: s.padNone, sm: s.padSm, md: s.padMd, lg: s.padLg };

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: CardTone;
  pad?: CardPad;
  /** Hover affordance (lift + fill). Use on cards that are links/buttons. */
  interactive?: boolean;
  href?: string;
}

export function Card({ as, tone = 'surface', pad = 'md', interactive, href, className, children, ...rest }: CardProps) {
  const cls = cn(s.card, TONE[tone], PAD[pad], className);
  if (href) {
    return (
      <Link href={href} className={cls} data-interactive="" {...(rest as object)}>
        {children}
      </Link>
    );
  }
  const Tag = as ?? 'div';
  return (
    <Tag className={cls} data-interactive={interactive ? '' : undefined} {...rest}>
      {children}
    </Tag>
  );
}

export interface PhotoCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** A photograph from /public/marketing. Sky by default, grass for "go" moments. */
  src?: '/marketing/hero-sky.jpg' | '/marketing/cta-grass.jpg';
  /** CSS object-position for the photograph. */
  position?: string;
  pad?: CardPad;
  /** Zoom the photo on hover. */
  zoom?: boolean;
  priority?: boolean;
  sizes?: string;
}

export function PhotoCard({
  as,
  src = '/marketing/hero-sky.jpg',
  position = '50% 60%',
  pad = 'lg',
  zoom,
  priority,
  sizes = '(max-width: 900px) 100vw, 60vw',
  className,
  children,
  ...rest
}: PhotoCardProps) {
  const Tag = as ?? 'div';
  return (
    <Tag className={cn(s.card, s.photo, PAD[pad], className)} data-zoom={zoom ? '' : undefined} {...rest}>
      <Image src={src} alt="" fill priority={priority} sizes={sizes} className={s.photoImg} style={{ objectPosition: position }} />
      <span className={s.photoShade} aria-hidden />
      {children}
    </Tag>
  );
}

/** Frosted tile for use ON a photograph. `tone`: white-tint glass, navy glass, or a near-opaque white card. */
export function GlassTile({
  tone = 'tint',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: 'tint' | 'navy' | 'white' }) {
  return (
    <div className={cn(tone === 'tint' ? s.glassTile : tone === 'navy' ? s.glassNavy : s.glassWhite, className)} {...rest}>
      {children}
    </div>
  );
}

/* ==========================================================================
   Type
   ========================================================================== */

export function Eyebrow({ children, dot = true, lime, className }: { children: ReactNode; dot?: boolean; lime?: boolean; className?: string }) {
  return (
    <p className={cn(s.eyebrow, lime && s.eyebrowLime, className)}>
      {dot ? <span className={s.eyebrowDot} aria-hidden /> : null}
      {children}
    </p>
  );
}

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** A second, softer clause after the title (landing-style two-tone headline). */
  soft?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, soft, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn(s.pageHeader, s.rise, className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow lime>{eyebrow}</Eyebrow> : null}
        <h1 className={s.pageTitle}>
          {title}
          {soft ? <span className={s.pageTitleSoft}> {soft}</span> : null}
        </h1>
        {description ? <p className={s.pageDesc}>{description}</p> : null}
      </div>
      {actions ? <div className={s.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn(s.sectionHeader, className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h2 className={s.sectionTitle} id={id}>
          {title}
        </h2>
        {description ? <p className={s.sectionDesc}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The route frame: max width, gutters, vertical rhythm. Every page renders inside one. */
export function Page({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn(s.page, className)} style={style}>
      {children}
    </div>
  );
}

/** The landing's entrance: rise + fade, staggered with `delay` (ms). */
export function Rise({
  children,
  delay = 0,
  className,
  as,
  style,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode; delay?: number; as?: ElementType }) {
  const Tag = as ?? 'div';
  return (
    <Tag className={cn(s.rise, className)} style={{ ...style, ['--d' as string]: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

/* ==========================================================================
   Tags and state badges
   ========================================================================== */

export type TagTone = 'lime' | 'ink' | 'inkLime' | 'soft' | 'outline' | 'dashed' | 'danger' | 'warn' | 'ok' | 'blue' | 'glass';

const TAG_TONE: Record<TagTone, string> = {
  lime: s.tgLime,
  ink: s.tgInk,
  inkLime: s.tgInkLime,
  soft: s.tgSoft,
  outline: s.tgOutline,
  dashed: s.tgDashed,
  danger: s.tgDanger,
  warn: s.tgWarn,
  ok: s.tgOk,
  blue: s.tgBlue,
  glass: s.tgGlass,
};

export interface TagProps {
  tone?: TagTone;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  dot?: boolean;
  strike?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Tag({ tone = 'soft', size = 'md', icon: Glyph, dot, strike, title, className, children }: TagProps) {
  return (
    <span className={cn(s.tag, TAG_TONE[tone], size === 'sm' && s.tagSm, size === 'lg' && s.tagLg, className)} title={title}>
      {dot ? <span className={s.tagDot} aria-hidden /> : null}
      {Glyph ? <Glyph size={size === 'sm' ? 11 : 12} strokeWidth={2} aria-hidden /> : null}
      <span className={strike ? s.strike : undefined}>{children}</span>
    </span>
  );
}

export type GateConclusion = 'failure' | 'success' | 'neutral' | 'running' | 'pending' | null | undefined;

/** The merge gate: Blocked (red), Clear (lime), Neutral, Running. */
export function GateBadge({ conclusion, size = 'md', className }: { conclusion: GateConclusion; size?: TagProps['size']; className?: string }) {
  switch (conclusion) {
    case 'failure':
      return (
        <Tag tone="danger" size={size} icon={Square} className={className} title="Merge gate: blocked by a proven finding">
          Blocked
        </Tag>
      );
    case 'success':
      return (
        <Tag tone="ok" size={size} icon={ShieldCheck} className={className} title="Merge gate: clear">
          Clear
        </Tag>
      );
    case 'running':
      return (
        <Tag tone="blue" size={size} icon={Loader} className={className} title="Review in progress">
          Running
        </Tag>
      );
    case 'pending':
      return (
        <Tag tone="dashed" size={size} icon={CircleDashed} className={className}>
          Not reviewed
        </Tag>
      );
    default:
      return (
        <Tag tone="soft" size={size} icon={Minus} className={className} title="Merge gate: neutral (nothing blocking, not fully verified)">
          Neutral
        </Tag>
      );
  }
}

export type ProofStatus = 'proven' | 'disproven' | 'inconclusive' | 'not_attempted' | 'not_applicable' | 'skipped_no_env' | string | null | undefined;

/** Proof by execution. Proven is lime (the brand's "verified"); refuted is struck through. */
export function ProofBadge({ status, size = 'md', className }: { status: ProofStatus; size?: TagProps['size']; className?: string }) {
  switch (status) {
    case 'proven':
      return (
        <Tag tone="lime" size={size} icon={FlaskConical} className={className} title="Repro test fails on head, passes on base">
          Proven
        </Tag>
      );
    case 'disproven':
      return (
        <Tag tone="outline" size={size} icon={FlaskConicalOff} strike className={className} title="Witness refuted its own claim by execution">
          Refuted
        </Tag>
      );
    case 'inconclusive':
      return (
        <Tag tone="warn" size={size} icon={TriangleAlert} className={className} title="The repro did not settle the claim">
          Inconclusive
        </Tag>
      );
    case 'skipped_no_env':
      return (
        <Tag tone="dashed" size={size} icon={CircleSlash} className={className} title="No runnable environment">
          No env
        </Tag>
      );
    case 'not_applicable':
      return (
        <Tag tone="dashed" size={size} className={className} title="Not executable by nature (e.g. maintainability)">
          N/A
        </Tag>
      );
    default:
      return (
        <Tag tone="dashed" size={size} icon={CircleDashed} className={className} title="Not attempted">
          Unproven
        </Tag>
      );
  }
}

/**
 * THE colour code for proof outcomes and gate verdicts. Every chart, bar,
 * legend and dot that encodes one of these reads it from here, so "lime"
 * means proven on every page. Order is the display order for legends.
 */
export const PROOF_ENCODING = [
  { key: 'proven', label: 'Proven', color: 'var(--w-lime)' },
  { key: 'disproven', label: 'Refuted', color: 'var(--w-chart-1)' },
  { key: 'inconclusive', label: 'Inconclusive', color: 'var(--w-warn)' },
  { key: 'skipped_no_env', label: 'No env', color: 'var(--w-chart-3)' },
  { key: 'not_attempted', label: 'Not attempted', color: 'var(--w-chart-5)' },
  { key: 'not_applicable', label: 'Not applicable', color: 'var(--w-chart-6)' },
] as const;

export type ProofKey = (typeof PROOF_ENCODING)[number]['key'];

export const PROOF_COLOR: Record<ProofKey, string> = Object.fromEntries(PROOF_ENCODING.map((p) => [p.key, p.color])) as Record<ProofKey, string>;
export const PROOF_LABEL: Record<ProofKey, string> = Object.fromEntries(PROOF_ENCODING.map((p) => [p.key, p.label])) as Record<ProofKey, string>;

/** Gate verdicts: blocked is red, clear is lime, neutral grey. Blocking always outranks proven. */
export const GATE_ENCODING = [
  { key: 'failure', label: 'Blocked', color: 'var(--w-danger)' },
  { key: 'success', label: 'Clear', color: 'var(--w-lime)' },
  { key: 'neutral', label: 'Neutral', color: 'var(--w-chart-5)' },
] as const;

export const GATE_COLOR: Record<'failure' | 'success' | 'neutral', string> = { failure: 'var(--w-danger)', success: 'var(--w-lime)', neutral: 'var(--w-chart-5)' };

export type SeverityBand = 'critical' | 'high' | 'medium' | 'low' | 'info' | string | null | undefined;

const BAND_LEVEL: Record<string, number> = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
const BAND_COLOR: Record<string, string> = {
  info: 'var(--w-sev-info)',
  low: 'var(--w-sev-low)',
  medium: 'var(--w-sev-medium)',
  high: 'var(--w-sev-high)',
  critical: 'var(--w-sev-critical)',
};

export function bandColor(band: SeverityBand): string {
  return BAND_COLOR[band ?? ''] ?? 'var(--w-sev-info)';
}

export function bandFromScore(score: number | null | undefined): SeverityBand {
  if (score == null) return null;
  if (score >= 0.75) return 'critical';
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  if (score >= 0.15) return 'low';
  return 'info';
}

/** A computed severity: the score, a 5-segment meter and the band. `layout="stack"` for hero readouts. */
export function SeverityScore({
  score,
  band,
  size = 'md',
  showBand = true,
  className,
}: {
  score: number | null | undefined;
  band?: SeverityBand;
  size?: 'md' | 'lg';
  showBand?: boolean;
  className?: string;
}) {
  const b = band ?? bandFromScore(score);
  const level = BAND_LEVEL[b ?? ''] ?? 0;
  const color = bandColor(b);
  const meter = (
    <span className={s.sevMeter} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} style={i <= level ? { background: color } : undefined} />
      ))}
    </span>
  );
  if (size === 'lg') {
    return (
      <span className={cn(s.sevStack, s.sevLg, className)}>
        <span className={s.sevScore}>{score == null ? '—' : score.toFixed(3)}</span>
        <span className="flex items-center gap-3">
          {meter}
          {showBand && b ? (
            <Tag tone={b === 'critical' ? 'danger' : b === 'high' ? 'warn' : 'soft'} size="sm">
              {b}
            </Tag>
          ) : null}
        </span>
      </span>
    );
  }
  return (
    <span className={cn(s.sev, className)} title={b ? `${b} severity` : undefined}>
      <span className={s.sevScore}>{score == null ? '—' : score.toFixed(2)}</span>
      {meter}
      {showBand && b ? <span className="font-w-mono text-[10.5px] uppercase tracking-[0.1em] text-w-muted">{b}</span> : null}
    </span>
  );
}

/** Severity as a single coloured bar — for list rows where the meter is too busy. */
export function SeverityRail({ band, className }: { band: SeverityBand; className?: string }) {
  return <span aria-hidden className={cn('block h-full w-[3px] rounded-w-pill', className)} style={{ background: bandColor(band) }} />;
}

/* ==========================================================================
   Stat
   ========================================================================== */

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean };
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Surface the stat sits on, so muted text keeps its contrast. `ink` flips with the theme; `navy` and `photo` are always dark. */
  on?: 'panel' | 'ink' | 'lime' | 'navy' | 'photo';
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}

export function Delta({ value, direction, good }: NonNullable<StatProps['delta']>) {
  const Arrow = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const tone = direction === 'flat' ? s.deltaFlat : good ? s.deltaGood : s.deltaBad;
  return (
    <span className={cn(s.delta, tone)}>
      <Arrow size={12} strokeWidth={2.2} aria-hidden />
      {value}
    </span>
  );
}

export function Stat({ label, value, unit, hint, delta, size = 'lg', on = 'panel', icon: Glyph, className, children }: StatProps) {
  return (
    <div className={cn(s.stat, on === 'ink' && s.onInk, on === 'lime' && s.onLime, (on === 'photo' || on === 'navy') && s.onPhoto, className)}>
      <span className={s.statLabel}>
        {Glyph ? <Glyph size={15} strokeWidth={1.9} aria-hidden /> : null}
        {label}
      </span>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className={cn(s.statValue, size === 'md' && s.statValueMd, size === 'sm' && s.statValueSm, size === 'xl' && s.statValueXl)}>
          {value}
          {unit ? <span className={s.statUnit}>{unit}</span> : null}
        </p>
        {delta ? (
          <span className="pb-1">
            <Delta {...delta} />
          </span>
        ) : null}
      </div>
      {hint ? <p className={s.statHint}>{hint}</p> : null}
      {children}
    </div>
  );
}

/* ==========================================================================
   Segmented control
   ========================================================================== */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
  /** Accessible name when the label is only an icon. */
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  iconOnly,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
  /** Group name for assistive tech. */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn(s.seg, size === 'sm' && s.segSm, iconOnly && s.segIcon, className)}>
      {options.map((o) => {
        const Glyph = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            className={s.segBtn}
            aria-pressed={o.value === value}
            aria-label={o.ariaLabel}
            title={iconOnly ? o.ariaLabel : undefined}
            onClick={() => onChange(o.value)}
          >
            {Glyph ? <Glyph size={14} strokeWidth={1.9} aria-hidden /> : null}
            {iconOnly ? null : o.label}
            {o.count != null ? <span className={s.segCount}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Fields
   ========================================================================== */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'fill' | 'outline';
  mono?: boolean;
  /** Content at the right edge, inside the pill (a button, a kbd hint). */
  trailing?: ReactNode;
  wrapperClassName?: string;
  /** React 19: a plain prop, forwarded to the <input>. */
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ icon: Glyph, size = 'md', variant = 'fill', mono, trailing, wrapperClassName, className, ...rest }: TextFieldProps) {
  return (
    <label className={cn(s.field, size === 'sm' && s.fieldSm, size === 'lg' && s.fieldLg, variant === 'outline' && s.fieldOutline, wrapperClassName)}>
      {Glyph ? <Glyph size={size === 'lg' ? 18 : 16} strokeWidth={1.9} aria-hidden /> : null}
      <input className={cn(s.fieldInput, mono && s.fieldMono, className)} {...rest} />
      {trailing}
    </label>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn(s.kbd, className)}>{children}</kbd>;
}

/* ==========================================================================
   Switch
   ========================================================================== */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(s.switch, className)}
    >
      <span className={s.switchKnob} aria-hidden />
    </button>
  );
}

/* ==========================================================================
   Avatars
   ========================================================================== */

const AVATAR_TONES: Array<[string, string]> = [
  ['#131313', '#ffffff'],
  ['#d4d4d8', '#131313'],
  ['#1e6fd9', '#ffffff'],
  ['#38bdf8', '#0b2540'],
  ['#475569', '#ffffff'],
  ['#e7e5e4', '#1c1917'],
  ['#111827', '#cbf857'],
];

function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 32,
  square,
  src,
  className,
  title,
}: {
  name: string;
  size?: number;
  square?: boolean;
  src?: string;
  className?: string;
  title?: string;
}) {
  const [bg, fg] = AVATAR_TONES[hashIndex(name, AVATAR_TONES.length)];
  return (
    <span
      className={cn(s.avatar, square && s.avatarSquare, className)}
      style={{ ['--av' as string]: `${size}px`, ['--av-bg' as string]: bg, ['--av-fg' as string]: fg }}
      title={title ?? name}
      aria-hidden={title ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Overlapping avatars. `max` shows the first N and a "+rest" disc. */
export function AvatarStack({ children, max, size = 28, className }: { children: ReactNode; max?: number; size?: number; className?: string }) {
  const items = Children.toArray(children);
  const shown = max != null && items.length > max ? items.slice(0, max) : items;
  const rest = items.length - shown.length;
  return (
    <span className={cn(s.avatarStack, className)}>
      {shown}
      {rest > 0 ? (
        <span className={s.avatar} style={{ ['--av' as string]: `${size}px`, ['--av-bg' as string]: 'var(--w-surface-3)', ['--av-fg' as string]: 'var(--w-text-2)' }} title={`${rest} more`}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/* ==========================================================================
   Viz
   ========================================================================== */

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Fill under the line with a fade of `color`. */
  area?: boolean;
  /** Emphasise the last point. */
  dot?: boolean;
  strokeWidth?: number;
  /** Fixed y-range; defaults to [min, max] of values. */
  domain?: [number, number];
  className?: string;
  label?: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = 'var(--w-text)',
  area = true,
  dot = true,
  strokeWidth = 1.8,
  domain,
  className,
  label,
}: SparklineProps) {
  const id = `spark${useId().replace(/:/g, '')}`;
  if (values.length === 0) return null;
  const [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)];
  const span = hi - lo || 1;
  const pad = strokeWidth + 2;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - lo) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  // Smooth with a Catmull-Rom → Bézier pass.
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  const last = pts[pts.length - 1];
  return (
    <svg
      className={cn(s.spark, className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${d} L ${last[0]} ${height} L ${pts[0][0]} ${height} Z`} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {dot ? <circle cx={last[0]} cy={last[1]} r={strokeWidth + 1.4} fill={color} /> : null}
    </svg>
  );
}

/** Mini vertical bars (a week of runs, a histogram). */
export function MiniBars({
  values,
  width = 120,
  height = 36,
  color = 'var(--w-text)',
  highlightLast = true,
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
  className?: string;
  label?: string;
}) {
  const max = Math.max(...values, 1);
  const gap = 3;
  const bw = Math.max(2, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg
      className={cn(s.spark, className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={Math.min(bw / 2, 3)}
            fill={color}
            opacity={highlightLast && !last ? 0.32 : 1}
          />
        );
      })}
    </svg>
  );
}

export interface StackSegment {
  value: number;
  color: string;
  label: string;
}

/** A rounded, gapped stacked bar with an optional legend (funnels, compositions). */
export function StackBar({
  segments,
  legend = true,
  size = 'md',
  className,
  label,
}: {
  segments: StackSegment[];
  legend?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  const aria = label ?? segments.map((g) => `${g.value} ${g.label}`).join(', ');
  return (
    <div className={className}>
      <div className={cn(s.stack, size === 'lg' && s.stackLg)} role="img" aria-label={aria}>
        {segments
          .filter((g) => g.value > 0)
          .map((g, i) => (
            <i key={g.label} style={{ width: `${(g.value / total) * 100}%`, background: g.color, animationDelay: `${i * 80}ms` }} />
          ))}
      </div>
      {legend ? (
        <div className={s.legend} aria-hidden>
          {segments.map((g) => (
            <span key={g.label}>
              <i className={s.swatch} style={{ background: g.color }} />
              <b>{g.value}</b> {g.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Meter({ value, color = 'var(--w-text)', className, label }: { value: number; color?: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn(s.meter, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <i style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}

/** A donut ring for a single ratio. */
export function Ring({
  value,
  size = 72,
  thickness = 8,
  color = 'var(--w-lime)',
  track = 'var(--w-surface-3)',
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={cn(s.ring, className)} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
        />
      </svg>
      {children ? <span className={s.ringLabel}>{children}</span> : null}
    </span>
  );
}

/* ==========================================================================
   Misc
   ========================================================================== */

export function Dot({ color, pulse, className }: { color?: string; pulse?: boolean; className?: string }) {
  return <span className={cn(s.dot, pulse && s.dotPulse, className)} style={color ? { ['--dot' as string]: color } : undefined} aria-hidden />;
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn(s.skeleton, className)} style={style} aria-hidden />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn(s.divider, className)} />;
}

/** A list row: rounded, hover-filled. Pass `href` for a link row. */
export function Row({
  href,
  onClick,
  className,
  children,
  interactive,
  ...rest
}: HTMLAttributes<HTMLElement> & { href?: string; interactive?: boolean }) {
  if (href) {
    return (
      <Link href={href} className={cn(s.row, className)} {...(rest as object)}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(s.row, 'w-full text-left', className)} {...(rest as object)}>
        {children}
      </button>
    );
  }
  return (
    <div className={cn(s.row, className)} data-interactive={interactive ? '' : undefined} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Glyph = ShieldAlert,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(s.empty, className)}>
      <span className={s.emptyIcon} aria-hidden>
        <Glyph size={24} strokeWidth={1.8} />
      </span>
      <h3 className={s.emptyTitle}>{title}</h3>
      {body ? <p className={s.emptyBody}>{body}</p> : null}
      {action}
    </div>
  );
}
