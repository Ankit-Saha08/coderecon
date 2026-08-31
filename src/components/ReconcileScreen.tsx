import { useEffect, useMemo } from 'react';
import { ArrowLeft, Keyboard, PackageOpen } from 'lucide-react';
import { useReconStore } from '@/store/useReconStore';
import { computeStats, isPending, matchesFilter } from '@/lib/stats';
import { buildDefaultPicks, diffKey, getExactDiff } from '@/lib/diff';
import { canHunkMerge, canManualEdit, seedManualContent } from '@/lib/mergeable';
import FileTree from './FileTree';
import DiffViewer from './DiffViewer';
import DecisionBar from './DecisionBar';
import BulkActions from './BulkActions';

export default function ReconcileScreen() {
  const { entries, filter, search, selectedId, select, setScreen, setDecision, markReviewed } =
    useReconStore();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) => matchesFilter(e, filter) && (!q || e.relPath.toLowerCase().includes(q)),
    );
  }, [entries, filter, search]);

  const stats = useMemo(() => computeStats(entries), [entries]);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  // Auto-select the first visible file
  useEffect(() => {
    if (!selectedId && visible.length) select(visible[0].id);
  }, [selectedId, visible, select]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

      const idx = visible.findIndex((e) => e.id === selectedId);

      switch (ev.key) {
        case 'j': case 'ArrowDown':
          if (idx < visible.length - 1) { ev.preventDefault(); select(visible[idx + 1].id); }
          break;

        case 'k': case 'ArrowUp':
          if (idx > 0) { ev.preventDefault(); select(visible[idx - 1].id); }
          break;

        case 'n': {
          ev.preventDefault();
          const next = visible.slice(idx + 1).find(isPending) ?? visible.find(isPending);
          if (next) select(next.id);
          break;
        }

        case '1':
          if (selected?.a) { ev.preventDefault(); setDecision(selected.id, { kind: 'takeA' }); }
          break;

        case '2':
          if (selected?.b) { ev.preventDefault(); setDecision(selected.id, { kind: 'takeB' }); }
          break;

        case '3':
          if (selected?.a && selected?.b) {
            ev.preventDefault();
            setDecision(selected.id, { kind: 'keepBoth', renameSide: 'B', suffix: '.incoming' });
          }
          break;

        case 'm':
          if (selected && canHunkMerge(selected) && selected.a && selected.b) {
            ev.preventDefault();
            const d = getExactDiff(
              diffKey(selected.id, selected.a.hash, selected.b.hash),
              selected.a.text ?? '', selected.b.text ?? '',
            );
            setDecision(selected.id, { kind: 'hunks', picks: buildDefaultPicks(d.segments) });
          }
          break;

        case 'e':
          if (selected && canManualEdit(selected)) {
            ev.preventDefault();
            setDecision(selected.id, { kind: 'manual', content: seedManualContent(selected) });
          }
          break;

        case 'x':
          if (selected) { ev.preventDefault(); setDecision(selected.id, { kind: 'exclude' }); }
          break;

        case 'r':
          if (selected) { ev.preventDefault(); markReviewed(selected.id); }
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, selected, select, setDecision, markReviewed]);

  const pct = stats.total
    ? Math.round(((stats.total - stats.needsReview) / stats.total) * 100)
    : 100;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5">
        <button onClick={() => setScreen('overview')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" /> Summary
        </button>

        <div className="flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-slate-600">
            {stats.needsReview ? `${stats.needsReview} pending` : 'All resolved'}
          </span>
        </div>

        <BulkActions />

        <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-400 xl:flex">
          <Keyboard className="h-3.5 w-3.5" />
          <kbd className="rounded border px-1">j</kbd>/<kbd className="rounded border px-1">k</kbd> move ·
          <kbd className="rounded border px-1">n</kbd> next ·
          <kbd className="rounded border px-1">1</kbd>/<kbd className="rounded border px-1">2</kbd> keep A/B ·
          <kbd className="rounded border px-1">m</kbd> merge ·
          <kbd className="rounded border px-1">e</kbd> edit ·
          <kbd className="rounded border px-1">x</kbd> exclude
        </span>

        <button onClick={() => setScreen('export')} disabled={stats.needsReview > 0}
          title={stats.needsReview
            ? `${stats.needsReview} files still need a decision`
            : 'Assemble the merged folder'}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          <PackageOpen className="h-4 w-4" /> Assemble
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,26%)_1fr]">
        <FileTree />
        <div className="flex min-h-0 flex-col">
          {selected ? (
            <>
              <div className="min-h-0 flex-1 overflow-hidden">
                <DiffViewer entry={selected} />
              </div>
              <DecisionBar entry={selected} />
            </>
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-400">
              Select a file to review
            </div>
          )}
        </div>
      </div>
    </div>
  );
}