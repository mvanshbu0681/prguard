// One icon per destination, shared by the rail and the ⌘K palette.
import type { LucideIcon } from 'lucide-react';
import { ArchiveRestore, FolderGit2, GitPullRequestArrow, LayoutGrid, Link2, ScanSearch, SlidersHorizontal, Target } from 'lucide-react';

export const NAV_ICON: Record<string, LucideIcon> = {
  '/overview': LayoutGrid,
  '/repos': FolderGit2,
  '/runs': GitPullRequestArrow,
  '/findings': ScanSearch,
  '/suppressions': ArchiveRestore,
  '/audit': Link2,
  '/accuracy': Target,
  '/settings/policy': SlidersHorizontal,
};
