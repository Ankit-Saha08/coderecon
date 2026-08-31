import { useMemo } from 'react';
import { FileQuestion, Minus, Plus } from 'lucide-react';
import type { FileEntry, HunkPick } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import {
  buildDiff, defaultPick, diffKey, getExactDiff, type DiffRow, type HunkInfo, type WordPart,
} from '@/lib/diff';
import { STATUS_META } from '@/lib/statusMeta';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/cn';
import HunkBar from './HunkBar';
import MergePreview from './MergePreview';
import ManualEditor from './ManualEditor';

const CODE = 'whitespace-pre px-3 font-mono text-xs leading-5';
const GUT = 'w-12 select-none border-r border-slate-200 bg-slate-50/80 px-2 text-right font-mono text-[11px] leading-5 text-slate-400';

function Words({ parts, tone }: { parts: WordPart[]; tone: 'add' | 'del' }) {
  return (
    <>
      {parts.map((p, i) =>
        p.changed ? (
          <span key={i} className={tone === 'add' ? 'rounded bg-emerald-200/70' : 'rounded bg-rose-200/70'}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

interface MergeCtl {
  picks: Record<number, HunkPick>;
  hunks: HunkInfo[];
  explicit: Set<number>;
  onPick: (hunkIndex: number, pick: HunkPick) => void;
}

function Gap({ n, colSpan }: { n: number; colSpan: number }) {
  return (
    <tr className="bg-slate-50 text-slate-400">
      <td colSpan={colSpan} className="px-3 py-0.5 text-center font-mono text-[11px]">
        ⋯ {n} unchanged {n === 1 ? 'line' : 'lines'} ⋯
      </td>
    </tr>
  );
}

function SplitRows({ rows, merge }: { rows: DiffRow[]; merge?: MergeCtl }) {
  const out: React.ReactNode[] = [];
  rows.forEach((r, i) => {
    if (r.type === 'gap') { out.push(<Gap key={`g${i}`} n={r.gapLines ?? 0} colSpan={4} />); return; }

    if (merge && r.hunkStart && r.hunk >= 0) {
      const h = merge.hunks.find((x) => x.index === r.hunk);
      if (h) {
        out.push(
          <HunkBar key={`h${r.hunk}`} hunk={h} colSpan={4}
            pick={merge.picks[r.hunk] ?? 'B'} isDefault={!merge.explicit.has(r.hunk)}
            onPick={(p) => merge.onPick(r.hunk, p)} />,
        );
      }
    }

    const lTone = r.type === 'ctx' ? '' : r.left ? 'bg-rose-50' : 'bg-slate-100/60';
    const rTone = r.type === 'ctx' ? '' : r.right ? 'bg-emerald-50' : 'bg-slate-100/60';
    out.push(
      <tr key={`r${i}`} className="align-top">
        <td className={GUT}>{r.left?.num ?? ''}</td>
        <td className={cn(CODE, lTone, 'border-r border-slate-200 text-slate-800')}>
          {r.words && r.left ? <Words parts={r.words.left} tone="del" /> : r.left?.text}
        </td>
        <td className={GUT}>{r.right?.num ?? ''}</td>
        <td className={cn(CODE, rTone, 'text-slate-800')}>
          {r.words && r.right ? <Words parts={r.words.right} tone="add" /> : r.right?.text}
        </td>
      </tr>,
    );
  });
  return <tbody>{out}</tbody>;
}

function InlineRows({ rows, merge }: { rows: DiffRow[]; merge?: MergeCtl }) {
  const out: React.ReactNode[] = [];
  rows.forEach((r, i) => {
    if (r.type === 'gap') { out.push(<Gap key={`g${i}`} n={r.gapLines ?? 0} colSpan={3} />); return; }

    if (merge && r.hunkStart && r.hunk >= 0) {
      const h = merge.hunks.find((x) => x.index === r.hunk);
      if (h) {
        out.push(
          <HunkBar key={`h${r.hunk}`} hunk={h} colSpan={3}
            pick={merge.picks[r.hunk] ?? 'B'} isDefault={!merge.explicit.has(r.hunk)}
            onPick={(p) => merge.onPick(r.hunk, p)} />,
        );
      }
    }

    if (r.type === 'ctx') {
      out.push(
        <tr key={`c${i}`}>
          <td className={GUT}>{r.left?.num}</td>
          <td className={GUT}>{r.right?.num}</td>
          <td className={cn(CODE, 'text-slate-700')}>{r.left?.text}</td>
        </tr>,
      );
      return;
    }
    if (r.left) {
      out.push(
        <tr key={`d${i}`} className="bg-rose-50">
          <td className={GUT}>{r.left.num}</td>
          <td className={GUT} />
          <td className={cn(CODE, 'text-rose-900')}>
            <span className="mr-1 text-rose-400">-</span>
            {r.words ? <Words parts={r.words.left} tone="del" /> : r.left.text}
          </td>
        </tr>,
      );
    }
    if (r.right) {
      out.push(
        <tr key={`a${i}`} className="bg-emerald-50">
          <td className={GUT} />
          <td className={GUT}>{r.right.num}</td>
          <td className={cn(CODE, 'text-emerald-900')}>
            <span className="mr-1 text-emerald-500">+</span>
            {r.words ? <Words parts={r.words.right} tone="add" /> : r.right.text}
          </td>
        </tr>,
      );
    }
  });
  return <tbody>{out}</tbody>;
}

function WholeFile({ entry, side }: { entry: FileEntry; side: 'A' | 'B' }) {
  const blob = side === 'A' ? entry.a : entry.b;
  const lines = (blob?.text ?? '').split('\n');
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((t, i) => (
          <tr key={i} className={side === 'A' ? 'bg-rose-50/40' : 'bg-emerald-50/40'}>
            <td className={GUT}>{i + 1}</td>
            <td className={cn(CODE, 'text-slate-800')}>{t}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DiffViewer({ entry }: { entry: FileEntry }) {
  const { diffMode, setDiffMode, options, setPick, setAllPicks } = useReconStore();

  const isMerging = entry.decision.kind === 'hunks';
  const isManual = entry.decision.kind === 'manual';
  // Merge composition requires an exact diff, so ignore-whitespace is suspended here.
  const useExact = isMerging || !options.ignoreWhitespace;

  const diff = useMemo(() => {
    if (!entry.a || !entry.b) return null;
    if (entry.a.isBinary || entry.b.isBinary) return null;
    if (entry.a.text == null || entry.b.text == null) return null;
    return useExact
      ? getExactDiff(diffKey(entry.id, entry.a.hash, entry.b.hash), entry.a.text, entry.b.text)
      : buildDiff(entry.a.text, entry.b.text, { ignoreWhitespace: true });
  }, [entry, useExact]);

  const merge: MergeCtl | undefined = useMemo(() => {
    if (!isMerging || !diff || entry.decision.kind !== 'hunks') return undefined;
    const picks = entry.decision.picks;
    const filled: Record<number, HunkPick> = {};
    for (const s of diff.segments) {
      if (s.kind === 'hunk') filled[s.index] = picks[s.index] ?? defaultPick(s);
    }
    return {
      picks: filled,
      hunks: diff.hunks,
      explicit: new Set(Object.keys(picks).map(Number)),
      onPick: (i, p) => setPick(entry.id, i, p),
    };
  }, [isMerging, diff, entry.decision, entry.id, setPick]);

  const meta = STATUS_META[entry.status];
  const visibleHunks = useMemo(() => {
    if (!diff) return 0;
    const seen = new Set<number>();
    diff.rows.forEach((r) => { if (r.hunk >= 0) seen.add(r.hunk); });
    return seen.size;
  }, [diff]);

  if (isManual && entry.decision.kind === 'manual') {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <span className={cn('rounded border px-2 py-0.5 text-xs font-semibold', meta.chip)}>{meta.label}</span>
          <span className="truncate font-mono text-sm font-medium text-slate-800">{entry.relPath}</span>
          <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
            MANUAL
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <ManualEditor entry={entry} content={entry.decision.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <span className={cn('rounded border px-2 py-0.5 text-xs font-semibold', meta.chip)}>{meta.label}</span>
        <span className="truncate font-mono text-sm font-medium text-slate-800">{entry.relPath}</span>

        {diff && !diff.identical && (
          <span className="flex items-center gap-2 font-mono text-xs">
            <span className="flex items-center gap-0.5 text-emerald-600"><Plus className="h-3 w-3" />{diff.added + diff.changed}</span>
            <span className="flex items-center gap-0.5 text-rose-600"><Minus className="h-3 w-3" />{diff.removed + diff.changed}</span>
            <span className="text-slate-400">{diff.hunkCount} {diff.hunkCount === 1 ? 'hunk' : 'hunks'}</span>
          </span>
        )}

        {isMerging && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">MERGE MODE</span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {isMerging && diff && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-medium text-slate-500">All:</span>
              {(['A', 'B', 'both'] as const).map((p) => (
                <button key={p} type="button"
                  onClick={() => setAllPicks(entry.id, p, diff.hunks.map((h) => h.index))}
                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50">
                  {p === 'both' ? 'A+B' : p}
                </button>
              ))}
            </div>
          )}
          <span className="font-mono text-[11px] text-slate-400">
            {entry.a ? `A ${formatBytes(entry.a.size)}` : 'A —'} · {entry.b ? `B ${formatBytes(entry.b.size)}` : 'B —'}
          </span>
          {diff && !diff.identical && (
            <div className="flex overflow-hidden rounded-lg border border-slate-200">
              {(['split', 'inline'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setDiffMode(m)}
                  className={cn('px-2.5 py-1 text-xs font-medium capitalize',
                    diffMode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {entry.note && !isMerging && (
        <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          💡 {entry.note}
        </div>
      )}

      {isMerging && options.ignoreWhitespace && (
        <div className="shrink-0 border-b border-sky-100 bg-sky-50 px-4 py-1.5 text-xs text-sky-800">
          “Ignore whitespace” is suspended for this file — merging must use an exact diff so no line is lost.
        </div>
      )}

      {isMerging && diff && diff.truncated && visibleHunks < diff.hunkCount && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          Showing {visibleHunks} of {diff.hunkCount} hunks (display capped). Off-screen hunks use their defaults —
          use the <b>All</b> buttons above to set every hunk at once.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {(!entry.a || !entry.b) && !((entry.a ?? entry.b)!.isBinary) && (
          <>
            <div className={cn('px-4 py-2 text-xs font-medium',
              entry.a ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800')}>
              {entry.a
                ? 'Present only in A. Keeping it preserves existing work; excluding it deletes the file.'
                : 'Present only in B. Keeping it adds the new file to the merged output.'}
            </div>
            <WholeFile entry={entry} side={entry.a ? 'A' : 'B'} />
          </>
        )}

        {((entry.a?.isBinary || entry.b?.isBinary) || entry.status === 'typeConflict') && (
          <div className="grid h-full place-items-center p-8">
            <div className="max-w-md text-center">
              <FileQuestion className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No text preview available</p>
              <p className="mt-1 text-xs text-slate-500">
                {entry.status === 'typeConflict'
                  ? 'A file on one side collides with a folder name on the other. Pick a side or rename.'
                  : 'Binary or oversized file — compared by hash. Choose a side below.'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-left font-mono text-[11px]">
                {(['a', 'b'] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1 font-sans font-semibold uppercase text-slate-500">{k}</div>
                    {entry[k]
                      ? <><div>{formatBytes(entry[k]!.size)}</div><div className="truncate text-slate-400">{entry[k]!.hash.slice(0, 16)}…</div></>
                      : <div className="text-slate-400">absent</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {diff && (
          diff.identical ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <p className="text-sm font-medium text-slate-700">Files are identical</p>
                <p className="mt-1 text-xs text-slate-500">
                  {options.ignoreWhitespace && !isMerging
                    ? 'No differences beyond whitespace.'
                    : 'Byte-for-byte match after normalization.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className={cn('sticky top-0 z-10 grid border-b border-slate-200 bg-white text-xs font-semibold',
                diffMode === 'split' ? 'grid-cols-2' : 'grid-cols-1')}>
                <div className="border-r border-slate-200 px-3 py-1.5 text-emerald-700">A · Current</div>
                {diffMode === 'split' && <div className="px-3 py-1.5 text-blue-700">B · Incoming</div>}
              </div>
              <table className="w-full border-collapse">
                {diffMode === 'split'
                  ? <SplitRows rows={diff.rows} merge={merge} />
                  : <InlineRows rows={diff.rows} merge={merge} />}
              </table>
              {diff.truncated && !isMerging && (
                <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Diff truncated at 6,000 rows. The full file is still exported correctly.
                </div>
              )}
            </>
          )
        )}
      </div>

      {isMerging && entry.decision.kind === 'hunks' && diff && !diff.identical && (
        <MergePreview entry={entry} picks={entry.decision.picks} />
      )}
    </div>
  );
}