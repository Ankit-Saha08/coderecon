import type { HunkPick } from '@/types';
import type { HunkInfo } from '@/lib/diff';
import { cn } from '@/lib/cn';

const OPTIONS: Array<{ pick: HunkPick; label: string; title: string }> = [
  { pick: 'A',    label: 'A only',   title: "Keep A's version of this block" },
  { pick: 'B',    label: 'B only',   title: "Take B's version of this block" },
  { pick: 'both', label: 'A + B',    title: 'Emit A then B — safest when unsure' },
  { pick: 'none', label: 'Neither',  title: 'Drop this block entirely' },
];

export default function HunkBar({
  hunk, pick, isDefault, colSpan, onPick,
}: {
  hunk: HunkInfo;
  pick: HunkPick;
  isDefault: boolean;
  colSpan: number;
  onPick: (p: HunkPick) => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-y border-slate-200 bg-slate-100/90 px-3 py-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700">Hunk {hunk.index + 1}</span>
          <span className="font-mono text-slate-500">
            {hunk.aCount > 0 && <span className="text-rose-600">−{hunk.aCount}</span>}
            {hunk.aCount > 0 && hunk.bCount > 0 && ' '}
            {hunk.bCount > 0 && <span className="text-emerald-600">+{hunk.bCount}</span>}
          </span>
          {isDefault && (
            <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-600">
              default
            </span>
          )}

          <div className="ml-auto flex overflow-hidden rounded-md border border-slate-300">
            {OPTIONS.map((o) => (
              <button
                key={o.pick}
                type="button"
                title={o.title}
                onClick={() => onPick(o.pick)}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-semibold transition',
                  pick === o.pick
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}