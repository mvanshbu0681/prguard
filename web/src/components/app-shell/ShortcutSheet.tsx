'use client';
// OWNER: t9a (wave 2). `?` opens this (dashboard §1.5, brief bullet 5): every
// shortcut the shell binds, listed with <Kbd>. A Dialog, not a Sheet — the
// brief names it a "shortcut sheet" as a concept, but design §5.10 reserves
// the sliding Sheet for filter panels and forms; a reference list is a Dialog
// (§5.11), same as the shortcut cheatsheet in every editor it echoes.
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { CHORD_MAP } from './routes';

export interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutRow {
  keys: string[];
  action: string;
  scope: string;
}

const GLOBAL_ROWS: ShortcutRow[] = [
  { keys: ['⌘', 'K'], action: 'Open the command palette', scope: 'global' },
  { keys: ['⌘', 'B'], action: 'Collapse or expand the rail', scope: 'global' },
  { keys: ['?'], action: 'Open this sheet', scope: 'global' },
  { keys: ['Esc'], action: 'Close an overlay', scope: 'global' },
];

const GRID_ROWS: ShortcutRow[] = [
  { keys: ['j'], action: 'Next row', scope: 'grid' },
  { keys: ['k'], action: 'Previous row', scope: 'grid' },
  { keys: ['Enter'], action: 'Open the focused row', scope: 'grid' },
];

function chordRows(): ShortcutRow[] {
  return [...CHORD_MAP.entries()].map(([chord, item]) => ({ keys: ['g', chord], action: `Go to ${item.label}`, scope: 'global' }));
}

export function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps) {
  const rows = [...GLOBAL_ROWS, ...chordRows(), ...GRID_ROWS];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every binding the dashboard shell answers to.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  <KbdGroup>
                    {row.keys.map((k, j) => (
                      <Kbd key={j}>{k}</Kbd>
                    ))}
                  </KbdGroup>
                </TableCell>
                <TableCell kind="prose">{row.action}</TableCell>
                <TableCell className="text-text-dim">{row.scope}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
