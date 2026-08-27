import type { FileEntry, FilterKey, Stats } from '@/types';

export function computeStats(entries: FileEntry[]): Stats {
  const c = (f: (x: FileEntry) => boolean) => entries.filter(f).length;
  return {
    total: entries.length,
    changed: c((x) => x.status !== 'identical'),
    identical: c((x) => x.status === 'identical'),
    modified: c((x) => x.status === 'modified'),
    whitespaceOnly: c((x) => x.status === 'whitespaceOnly'),
    onlyInA: c((x) => x.status === 'onlyInA'),
    onlyInB: c((x) => x.status === 'onlyInB'),
    binaryDiff: c((x) => x.status === 'binaryDiff'),
    typeConflict: c((x) => x.status === 'typeConflict'),
    needsReview: c((x) => !x.autoResolved && !x.reviewed),
    reviewed: c((x) => x.reviewed),
  };
}

export function matchesFilter(e: FileEntry, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':         return true;
    case 'changed':     return e.status !== 'identical';
    case 'needsReview': return !e.autoResolved && !e.reviewed;
    default:            return e.status === filter;
  }
}

/** True when the file still awaits a human decision. */
export const isPending = (e: FileEntry) => !e.autoResolved && !e.reviewed;