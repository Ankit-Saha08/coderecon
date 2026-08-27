import { useMemo } from 'react';
import { FileQuestion, Minus, Plus } from 'lucide-react';
import type { FileEntry } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { buildDiff, type DiffRow, type WordPart } from '@/lib/diff';
import { STATUS_META } from '@/lib/statusMeta';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/cn';

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

function SplitRows({ rows }: { rows: DiffRow[] }) {
  return (
    <tbody>
      {rows.map((r, i) => {
        if (r.type === 'gap') {
          return (
            <tr key={i} className="bg-slate-50 text-slate-400">
              <td colSpan={4} className="px-3 py-0.5 text-center font-mono text-[11px]">
                ⋯ {r.gapLines} unchanged {r.gapLines === 1 ? 'line' : 'lines'} ⋯
              </td>
            </tr>
          );
        }
        const lTone = r.type === 'ctx' ? '' : r.left ? 'bg-rose-50' : 'bg-slate-100/60';
        const rTone = r.type === 'ctx' ? '' : r.right ? 'bg-emerald-50' : 'bg-slate-100/60';
        return (
          <tr key={i} className="align-top">
            <td className={GUT}>{r.left?.num ?? ''}</td>
            <td className={cn(CODE, lTone, 'border-r border-slate-200 text-slate-800')}>
              {r.words && r.left ? <Words parts={r.words.left} tone="del" /> : r.left?.text}
            </td>
            <td className={GUT}>{r.right?.num ?? ''}</td>
            <td className={cn(CODE, rTone, 'text-slate-800')}>
              {r.words && r.right ? <Words parts={r.words.right} tone="add" /> : r.right?.text}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function InlineRows({ rows }: { rows: DiffRow[] }) {
  const out: React.ReactNode[] = [];
  rows.forEach((r, i) => {
    if (r.type === 'gap') {
      out.push(
        <tr key={`g${i}`} className="bg-slate-50 text-slate-400">
          <td colSpan={3} className="px-3 py-0.5 text-center font-mono text-[11px]">
            ⋯ {r.gapLines} unchanged {r.gapLines === 1 ? 'line' : 'lines'} ⋯
          </td>
        </tr>,
      );
      return;
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
  const { diffMode, setDiffMode, options } = useReconStore();

  const diff = useMemo(() => {
    if (!entry.a?.text && !entry.b?.text) return null;
    if (!entry.a || !entry.b) return null;
    if (entry.a.isBinary || entry.b.isBinary) return null;
    return buildDiff(entry.a.text ?? '', entry.b.text ?? '', {
      ignoreWhitespace: options.ignoreWhitespace,
    });
  }, [entry, options.ignoreWhitespace]);

  const meta = STATUS_META[entry.status];

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <span className={cn('rounded border px-2 py-0.5 text-xs font-semibold', meta.chip)}>{meta.label}</span>
        <span className="truncate font-mono text-sm font-medium text-slate-800">{entry.relPath}</span>

        {diff && !diff.identical && (
          <span className="flex items-center gap-2 font-mono text-xs">
            <span className="flex items-center gap-0.5 text-emerald-600"><Plus className="h-3 w-3" />{diff.added + diff.changed}</span>
            <span className="flex items-center gap-0.5 text-rose-600"><Minus className="h-3 w-3" />{diff.removed + diff.changed}</span>
            <span className="text-slate-400">{diff.hunkCount} {diff.hunkCount === 1 ? 'hunk' : 'hunks'}</span>
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="font-mono text-[11px] text-slate-400">
            {entry.a ? `A ${formatBytes(entry.a.size)}` : 'A —'} · {entry.b ? `B ${formatBytes(entry.b.size)}` : 'B —'}
          </span>
          {diff && !diff.identical && (
            <div className="flex overflow-hidden rounded-lg border border-slate-200">
              {(['split', 'inline'] as const).map((m) => (
                <button key={m} onClick={() => setDiffMode(m)}
                  className={cn('px-2.5 py-1 text-xs font-medium capitalize',
                    diffMode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {entry.note && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          💡 {entry.note}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Only in one side */}
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

        {/* Binary / too large / type conflict */}
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

        {/* Text diff */}
        {diff && (
          diff.identical ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <p className="text-sm font-medium text-slate-700">Files are identical</p>
                <p className="mt-1 text-xs text-slate-500">
                  {options.ignoreWhitespace ? 'No differences beyond whitespace.' : 'Byte-for-byte match after normalization.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-slate-200 bg-white text-xs font-semibold">
                <div className="border-r border-slate-200 px-3 py-1.5 text-emerald-700">A · Current</div>
                <div className="px-3 py-1.5 text-blue-700">B · Incoming</div>
              </div>
              <table className="w-full border-collapse">
                {diffMode === 'split' ? <SplitRows rows={diff.rows} /> : <InlineRows rows={diff.rows} />}
              </table>
              {diff.truncated && (
                <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Diff truncated at 6,000 rows. The full file is still exported correctly.
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}