import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, File, Folder, Search } from 'lucide-react';
import type { FilterKey } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { allDirIds, buildTree, flattenTree } from '@/lib/tree';
import { isPending, matchesFilter } from '@/lib/stats';
import { STATUS_META } from '@/lib/statusMeta';
import { cn } from '@/lib/cn';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'needsReview', label: 'Needs review' },
  { key: 'changed',     label: 'Changed' },
  { key: 'modified',    label: 'Modified' },
  { key: 'onlyInA',     label: 'Only A' },
  { key: 'onlyInB',     label: 'Only B' },
  { key: 'all',         label: 'All' },
];

export default function FileTree() {
  const { entries, filter, setFilter, search, setSearch, selectedId, select } = useReconStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) => matchesFilter(e, filter) && (!q || e.relPath.toLowerCase().includes(q)),
    );
  }, [entries, filter, search]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 15,
  });

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by path…"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium transition',
                filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length.toLocaleString()} files</span>
          <button onClick={() => setCollapsed((p) => (p.size ? new Set() : new Set(allDirIds(tree))))}
            className="hover:text-slate-800">
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        {!rows.length && (
          <p className="p-4 text-center text-xs text-slate-400">No files match this filter.</p>
        )}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const node = rows[vi.index];
            const style = {
              position: 'absolute' as const, top: 0, left: 0, width: '100%',
              height: vi.size, transform: `translateY(${vi.start}px)`,
            };

            if (node.kind === 'dir') {
              const open = !collapsed.has(node.id);
              return (
                <div key={node.id} style={style}>
                  <button onClick={() => toggle(node.id)}
                    className="flex h-full w-full items-center gap-1 pr-2 text-left text-sm hover:bg-slate-50"
                    style={{ paddingLeft: 8 + node.depth * 12 }}>
                    {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                    <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate font-medium text-slate-700">{node.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{node.files}</span>
                    {node.pending > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">
                        {node.pending}
                      </span>
                    )}
                  </button>
                </div>
              );
            }

            const e = node.entry;
            const meta = STATUS_META[e.status];
            const pending = isPending(e);

            return (
              <div key={node.id} style={style}>
                <button onClick={() => select(e.id)}
                  className={cn('flex h-full w-full items-center gap-1.5 pr-2 text-left text-sm',
                    selectedId === e.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50')}
                  style={{ paddingLeft: 8 + node.depth * 12 }}>
                  <File className={cn('h-3.5 w-3.5 shrink-0', selectedId === e.id ? 'text-white/60' : 'text-slate-300')} />
                  <span className="truncate">{node.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <span className={cn('rounded border px-1 text-[10px] font-bold leading-4',
                      selectedId === e.id ? 'border-white/30 bg-white/10 text-white' : meta.chip)}>
                      {meta.short}
                    </span>
                    {pending
                      ? <Circle className="h-3 w-3 text-rose-400" />
                      : <CheckCircle2 className={cn('h-3 w-3', selectedId === e.id ? 'text-white/60' : 'text-emerald-500')} />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}