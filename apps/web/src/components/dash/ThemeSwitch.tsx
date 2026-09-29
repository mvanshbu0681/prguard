'use client';
// Light / dark / system. The full switch is a segmented pill (sidebar foot);
// `compact` renders a single icon button that flips light ↔ dark (collapsed
// rail, top bar).
import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { IconButton, Segmented } from './kit';
import { useDashTheme, useDashThemeChoice, type DashThemeChoice } from './theme';

const OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun, ariaLabel: 'Light theme' },
  { value: 'dark' as const, label: 'Dark', icon: Moon, ariaLabel: 'Dark theme' },
  { value: 'system' as const, label: 'System', icon: Monitor, ariaLabel: 'Match system theme' },
];

const noop = () => () => {};

export function ThemeSwitch({ compact }: { compact?: boolean }) {
  const [choice, setChoice] = useDashThemeChoice();
  const resolved = useDashTheme();
  // The server cannot know the stored choice: render the default until hydrated.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  if (compact) {
    const dark = hydrated && resolved === 'dark';
    return <IconButton icon={dark ? Sun : Moon} label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setChoice(dark ? 'light' : 'dark')} />;
  }
  return (
    <Segmented<DashThemeChoice>
      label="Theme"
      options={OPTIONS}
      value={hydrated ? choice : 'light'}
      onChange={setChoice}
      iconOnly
      size="sm"
    />
  );
}
