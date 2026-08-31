import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { FileEntry, HunkPick } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import {
  composeMerge, diffKey, getExactDiff, summarizePicks, wantsTrailingNewline,
} from '@/lib/diff';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/cn';

export default function MergePreview({
  entry, picks,
}: {
  entry: FileEntry;
  picks: Record<number, HunkPick>;
}) {
  const { showMergePreview, toggleMergePreview } = useReconStore();
  const [copied, setCopied] = useState(false);

  const { text, summary, bytes } = useMemo(() => {
    const aText = entry.a?.text ?? '';
    const bText = entry.b?.text ?? '';
    const diff = getExactDiff(diffKey(entry.id, entry.a?.hash ?? '', entry.b?.hash ?? ''), aText, bText);
    const merged = composeMerge(diff.segments, picks, wantsTrailingNewline(aText, bText));
    return {
      text: merged,
      summary: summarizePicks(diff.segments, picks),
      bytes: new TextEncoder().encode(merged).byteLength,
    };
  }, [entry, picks]);

  const lines = useMemo(() => {
    const l = text.split('\n');
    if (l.length && l[l.length - 1] === '') l.pop();
    return l;
  }, [text]);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1400); },
      () => undefined,
    );
  };

  return (
    <div className={cn('flex shrink-0 flex-col border-t-2 border-amber-300 bg-amber-50/30',
      showMergePreview && 'h-2/5')}>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5">
        <button type="button" onClick={toggleMergePreview}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
          {showMergePreview ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          Merged result
        </button>

        <span className="font-mono text-[11px] text-amber-800">
          {lines.length.toLocaleString()} lines · {formatBytes(bytes)}
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="rounded bg-emerald-100 px-1.5 text-emerald-700">{summary.A}×A</span>
          <span className="rounded bg-blue-100 px-1.5 text-blue-700">{summary.B}×B</span>
          <span className="rounded bg-amber-100 px-1.5 text-amber-800">{summary.both}×both</span>
          {summary.none > 0 && (
            <span className="rounded bg-rose-100 px-1.5 text-rose-700">{summary.none}×drop</span>
          )}
        </span>

        <button type="button" onClick={copy}
          className="ml-auto inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-50">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {showMergePreview && (
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {lines.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400">
              Every hunk is set to “Neither” and there is no shared context — the merged file would be empty.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((t, i) => (
                  <tr key={i}>
                    <td className="w-12 select-none border-r border-slate-200 bg-slate-50 px-2 text-right font-mono text-[11px] leading-5 text-slate-400">
                      {i + 1}
                    </td>
                    <td className="whitespace-pre px-3 font-mono text-xs leading-5 text-slate-800">{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}