import { useMemo } from 'react';
import { FileDown, RotateCcw } from 'lucide-react';
import type { FileEntry } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import {
  buildDefaultPicks, composeMerge, diffKey, getExactDiff, wantsTrailingNewline,
} from '@/lib/diff';
import { canHunkMerge } from '@/lib/mergeable';
import { formatBytes } from '@/lib/text';

export default function ManualEditor({ entry, content }: { entry: FileEntry; content: string }) {
  const setManualContent = useReconStore((s) => s.setManualContent);

  const stats = useMemo(() => {
    const lines = content.split('\n').length;
    const bytes = new TextEncoder().encode(content).byteLength;
    return { lines, bytes };
  }, [content]);

  const loadMerged = () => {
    if (!canHunkMerge(entry) || !entry.a || !entry.b) return;
    const aText = entry.a.text ?? '';
    const bText = entry.b.text ?? '';
    const diff = getExactDiff(diffKey(entry.id, entry.a.hash, entry.b.hash), aText, bText);
    setManualContent(entry.id, composeMerge(diff.segments, buildDefaultPicks(diff.segments), wantsTrailingNewline(aText, bText)));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Manual edit</span>

        <button type="button" disabled={entry.a?.text == null}
          onClick={() => setManualContent(entry.id, entry.a?.text ?? '')}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-30">
          <FileDown className="h-3 w-3" /> Load A
        </button>
        <button type="button" disabled={entry.b?.text == null}
          onClick={() => setManualContent(entry.id, entry.b?.text ?? '')}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-30">
          <FileDown className="h-3 w-3" /> Load B
        </button>
        <button type="button" disabled={!canHunkMerge(entry)} onClick={loadMerged}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-30">
          <RotateCcw className="h-3 w-3" /> Load auto-merge
        </button>

        <span className="ml-auto font-mono text-[11px] text-slate-500">
          {stats.lines.toLocaleString()} lines · {formatBytes(stats.bytes)}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setManualContent(entry.id, e.target.value)}
        spellCheck={false}
        wrap="off"
        className="min-h-0 flex-1 resize-none whitespace-pre bg-white px-4 py-3 font-mono text-xs leading-5 text-slate-800 outline-none"
        placeholder="Type the exact content you want in the merged output…"
      />

      <p className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500">
        Saved as you type. This exact text is written to the merged output — with a UTF-8 encoding and your line endings as typed.
      </p>
    </div>
  );
}