import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
import type { FilterKey } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { computeStats } from '@/lib/stats';
import { STATUS_META } from '@/lib/statusMeta';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/cn';

const CARDS: Array<{ key: FilterKey; label: string; tone: string }> = [
  { key: 'modified',       label: 'Modified',        tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { key: 'onlyInA',        label: 'Only in A',       tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { key: 'onlyInB',        label: 'Only in B',       tone: 'border-blue-200 bg-blue-50 text-blue-800' },
  { key: 'whitespaceOnly', label: 'Whitespace only', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  { key: 'binaryDiff',     label: 'Binary differs',  tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  { key: 'typeConflict',   label: 'Type conflicts',  tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  { key: 'identical',      label: 'Identical',       tone: 'border-slate-200 bg-slate-50 text-slate-600' },
];

export default function OverviewScreen() {
  const { entries, metaA, metaB, rootA, rootB, setFilter, setScreen, reset } = useReconStore();
  const stats = useMemo(() => computeStats(entries), [entries]);

  const eolMismatch = useMemo(
    () => entries.filter((e) => e.a && e.b && e.a.lineEnding !== e.b.lineEnding).length,
    [entries],
  );

  const go = (filter: FilterKey) => { setFilter(filter); setScreen('reconcile'); };
  const counts: Record<string, number> = stats as unknown as Record<string, number>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Comparison summary</h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono font-semibold text-emerald-700">{rootA || 'A'}</span>
            {' → '}
            <span className="font-mono font-semibold text-blue-700">{rootB || 'B'}</span>
            {' · '}{stats.total.toLocaleString()} unique paths
          </p>
        </div>
        <button onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <RotateCcw className="h-3.5 w-3.5" /> Start over
        </button>
      </header>

      <div className={cn(
        'flex items-center justify-between gap-4 rounded-2xl border p-5',
        stats.needsReview ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50',
      )}>
        <div>
          <div className="text-3xl font-bold text-slate-900">{stats.needsReview}</div>
          <div className="text-sm font-medium text-slate-700">
            {stats.needsReview
              ? 'files need your decision'
              : 'Nothing ambiguous — every file auto-resolved'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {(stats.total - stats.needsReview).toLocaleString()} handled automatically by smart defaults
          </div>
        </div>
        <button onClick={() => go(stats.needsReview ? 'needsReview' : 'changed')}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          Start reviewing <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map((c) => (
          <button key={c.key} onClick={() => go(c.key)} disabled={!counts[c.key]}
            className={cn('rounded-xl border p-4 text-left transition hover:shadow-sm disabled:opacity-40 disabled:hover:shadow-none', c.tone)}>
            <div className="text-2xl font-bold">{(counts[c.key] ?? 0).toLocaleString()}</div>
            <div className="text-xs font-medium">{c.label}</div>
          </button>
        ))}
      </div>

      {(eolMismatch > 0 || (metaA?.skippedCount ?? 0) > 0 || (metaB?.skippedCount ?? 0) > 0) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Worth knowing</div>
          {eolMismatch > 0 && (
            <p><b>{eolMismatch}</b> files differ in line endings. They're classified as <i>whitespace only</i> and default to keeping A.</p>
          )}
          {!!metaA?.skippedCount && <p><b>{metaA.skippedCount}</b> files in A were unreadable and skipped.</p>}
          {!!metaB?.skippedCount && <p><b>{metaB.skippedCount}</b> files in B were unreadable and skipped.</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {([['A', metaA, rootA, 'emerald'], ['B', metaB, rootB, 'blue']] as const).map(([label, meta, root, tone]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <div className={cn('mb-1 font-semibold', tone === 'emerald' ? 'text-emerald-700' : 'text-blue-700')}>
              Folder {label} · <span className="font-mono">{root || '(flat)'}</span>
            </div>
            <div>{meta?.blobs.size.toLocaleString() ?? 0} files scanned · {formatBytes(meta?.totalBytes ?? 0)}</div>
            <div>{meta?.excludedCount ?? 0} excluded by patterns · {meta?.skippedCount ?? 0} skipped</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} className={cn('rounded-full border px-2.5 py-0.5 text-xs', m.chip)}>{m.label}</span>
        ))}
      </div>
    </div>
  );
}