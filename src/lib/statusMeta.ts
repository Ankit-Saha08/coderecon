import type { Status } from '@/types';

export const STATUS_META: Record<Status, { label: string; chip: string; short: string }> = {
  identical:      { label: 'Identical',        short: '=',  chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  modified:       { label: 'Modified',         short: '≠',  chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  whitespaceOnly: { label: 'Whitespace only',  short: '␣',  chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  onlyInA:        { label: 'Only in A',        short: 'A',  chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  onlyInB:        { label: 'Only in B',        short: 'B',  chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  binaryDiff:     { label: 'Binary differs',   short: '01', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  typeConflict:   { label: 'Type conflict',    short: '!',  chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  possibleRename: { label: 'Possible rename',  short: '→',  chip: 'bg-teal-50 text-teal-700 border-teal-200' },
};