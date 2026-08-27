import { Ban, Check, Copy, FileMinus, FilePlus } from 'lucide-react';
import type { Decision, FileEntry } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { cn } from '@/lib/cn';
import { isPending } from '@/lib/stats';

function kindOf(d: Decision): string {
  return d.kind === 'keepBoth' ? `keepBoth:${d.renameSide}` : d.kind;
}

export default function DecisionBar({ entry }: { entry: FileEntry }) {
  const { setDecision, setNote, markReviewed } = useReconStore();
  const current = kindOf(entry.decision);

  const options: Array<{ id: string; label: string; icon: React.ReactNode; decision: Decision; disabled?: boolean; hint: string }> = [
    { id: 'takeA', label: 'Keep A', icon: <FileMinus className="h-3.5 w-3.5" />, decision: { kind: 'takeA' }, disabled: !entry.a, hint: "Use A's version" },
    { id: 'takeB', label: 'Keep B', icon: <FilePlus className="h-3.5 w-3.5" />, decision: { kind: 'takeB' }, disabled: !entry.b, hint: "Use B's version" },
    { id: 'keepBoth:B', label: 'Keep both', icon: <Copy className="h-3.5 w-3.5" />, decision: { kind: 'keepBoth', renameSide: 'B', suffix: '.incoming' }, disabled: !entry.a || !entry.b, hint: 'Emit A plus B renamed with .incoming' },
    { id: 'exclude', label: 'Exclude', icon: <Ban className="h-3.5 w-3.5" />, decision: { kind: 'exclude' }, hint: 'Omit from the merged output' },
  ];

  return (
    <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision</span>

        {options.map((o) => (
          <button key={o.id} onClick={() => setDecision(entry.id, o.decision)} disabled={o.disabled} title={o.hint}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-30',
              current === o.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
            )}>
            {o.icon} {o.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {entry.autoResolved && !entry.reviewed && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">auto</span>
          )}
          {isPending(entry) ? (
            <button onClick={() => markReviewed(entry.id)}
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