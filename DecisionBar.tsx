import { useMemo } from 'react';
import { Ban, Check, Copy, FileMinus, FilePlus, GitMerge, PenLine } from 'lucide-react';
import type { Decision, FileEntry } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { cn } from '@/lib/cn';
import { isPending } from '@/lib/stats';
import {
  buildDefaultPicks, diffKey, getExactDiff, summarizePicks,
} from '@/lib/diff';
import { canHunkMerge, canManualEdit, seedManualContent } from '@/lib/mergeable';

function kindOf(d: Decision): string {
  return d.kind === 'keepBoth' ? `keepBoth:${d.renameSide}` : d.kind;
}

export default function DecisionBar({ entry }: { entry: FileEntry }) {
  const { setDecision, setNote, markReviewed } = useReconStore();
  const current = kindOf(entry.decision);

  const mergeOk = canHunkMerge(entry);
  const manualOk = canManualEdit(entry);

  const mergeSummary = useMemo(() => {
    if (entry.decision.kind !== 'hunks' || !mergeOk || !entry.a || !entry.b) return null;
    const diff = getExactDiff(diffKey(entry.id, entry.a.hash, entry.b.hash), entry.a.text ?? '', entry.b.text ?? '');
    return summarizePicks(diff.segments, entry.decision.picks);
  }, [entry, mergeOk]);

  const startMerge = () => {
    if (!mergeOk || !entry.a || !entry.b) return;
    const diff = getExactDiff(diffKey(entry.id, entry.a.hash, entry.b.hash), entry.a.text ?? '', entry.b.text ?? '');
    setDecision(entry.id, { kind: 'hunks', picks: buildDefaultPicks(diff.segments) });
  };

  const startManual = () => {
    if (!manualOk) return;
    setDecision(entry.id, { kind: 'manual', content: seedManualContent(entry) });
  };

  const options: Array<{
    id: string; label: string; icon: React.ReactNode; disabled?: boolean; hint: string;
    onClick: () => void; tone?: 'merge';
  }> = [
    { id: 'takeA', label: 'Keep A', icon: <FileMinus className="h-3.5 w-3.5" />, disabled: !entry.a,
      hint: "Use A's version verbatim", onClick: () => setDecision(entry.id, { kind: 'takeA' }) },
    { id: 'takeB', label: 'Keep B', icon: <FilePlus className="h-3.5 w-3.5" />, disabled: !entry.b,
      hint: "Use B's version verbatim", onClick: () => setDecision(entry.id, { kind: 'takeB' }) },
    { id: 'keepBoth:B', label: 'Keep both', icon: <Copy className="h-3.5 w-3.5" />, disabled: !entry.a || !entry.b,
      hint: 'Emit A plus B renamed with .incoming',
      onClick: () => setDecision(entry.id, { kind: 'keepBoth', renameSide: 'B', suffix: '.incoming' }) },
    { id: 'hunks', label: 'Merge hunks', icon: <GitMerge className="h-3.5 w-3.5" />, disabled: !mergeOk,
      hint: mergeOk ? 'Combine both files block by block' : 'Needs decodable text on both sides',
      onClick: startMerge, tone: 'merge' },
    { id: 'manual', label: 'Edit manually', icon: <PenLine className="h-3.5 w-3.5" />, disabled: !manualOk,
      hint: 'Type the exact merged content yourself', onClick: startManual, tone: 'merge' },
    { id: 'exclude', label: 'Exclude', icon: <Ban className="h-3.5 w-3.5" />,
      hint: 'Omit from the merged output', onClick: () => setDecision(entry.id, { kind: 'exclude' }) },
  ];

  return (
    <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision</span>

        {options.map((o) => (
          <button key={o.id} type="button" onClick={o.onClick} disabled={o.disabled} title={o.hint}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-30',
              current === o.id
                ? o.tone === 'merge'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
            )}>
            {o.icon} {o.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {mergeSummary && (
            <span className="font-mono text-[11px] text-slate-500">
              {mergeSummary.total} hunks · {mergeSummary.A}A/{mergeSummary.B}B/{mergeSummary.both}both
              {mergeSummary.none > 0 && `/${mergeSummary.none}drop`}
            </span>
          )}
          {entry.autoResolved && !entry.reviewed && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">auto</span>
          )}
          {isPending(entry) ? (
            <button type="button" onClick={() => markReviewed(entry.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              <Check className="h-3.5 w-3.5" /> Mark reviewed
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Resolved
            </span>
          )}
        </div>
      </div>

      <input
        value={entry.note ?? ''} onChange={(e) => setNote(entry.id, e.target.value)}
        placeholder="Why this decision? (included in the merge report)"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-slate-400"
      />
    </div>
  );
}