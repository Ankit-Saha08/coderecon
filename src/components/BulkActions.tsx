import { useMemo, useState } from 'react';
import { Layers, Save, Upload } from 'lucide-react';
import type { Decision } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { isPending, matchesFilter } from '@/lib/stats';
import { buildSession, parseSession } from '@/lib/session';
import { downloadText, timestamp } from '@/lib/exportZip';
import { cn } from '@/lib/cn';

export default function BulkActions() {
  const { entries, filter, search, bulkDecide, applySession, rootA, rootB, options } = useReconStore();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => matchesFilter(e, filter) && (!q || e.relPath.toLowerCase().includes(q)));
  }, [entries, filter, search]);

  const pending = visible.filter(isPending);

  const apply = (d: Decision, onlyPending: boolean, label: string) => {
    const targets = (onlyPending ? pending : visible).map((e) => e.id);
    if (!targets.length) return;
    bulkDecide(targets, d);
    setMsg(`${label} → ${targets.length} file${targets.length === 1 ? '' : 's'}`);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-1">
      <button onClick={() => setOpen((v) => !v)}
        className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
          open ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
        <Layers className="h-3.5 w-3.5" /> Bulk
      </button>

      <button title="Save decisions to a session file"
        onClick={() => downloadText(
          JSON.stringify(buildSession(entries, rootA, rootB, options), null, 2),
          `coderecon-session-${timestamp()}.json`,
          'application/json',
        )}
        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
        <Save className="h-3.5 w-3.5" />
      </button>

      <label title="Load a session file"
        className="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
        <Upload className="h-3.5 w-3.5" />
        <input type="file" accept=".json" className="hidden"
          onChange={async (ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (!file) return;
            try {
              const r = applySession(parseSession(await file.text()));
              setMsg(`Restored ${r.applied}; ${r.missing} not in session; ${r.extra} unmatched`);
            } catch (err) {
              setMsg(`Load failed: ${(err as Error).message}`);
            }
          }} />
      </label>

      {msg && <span className="max-w-[240px] truncate text-xs text-slate-500">{msg}</span>}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="px-2 pb-2 text-xs text-slate-500">
            Applies to the <b>{visible.length}</b> file{visible.length === 1 ? '' : 's'} currently listed
            {pending.length > 0 && <> · <b>{pending.length}</b> pending</>}
          </p>
          {[
            { label: 'Keep A for all pending',        run: () => apply({ kind: 'takeA' }, true, 'Keep A') },
            { label: 'Keep B for all pending',        run: () => apply({ kind: 'takeB' }, true, 'Keep B') },
            { label: 'Keep both for all pending',     run: () => apply({ kind: 'keepBoth', renameSide: 'B', suffix: '.incoming' }, true, 'Keep both') },
            { label: 'Accept defaults (mark pending as reviewed)', run: () => {
                const ids = pending.map((e) => e.id);
                pending.forEach((e) => useReconStore.getState().setDecision(e.id, e.decision));
                setMsg(`Accepted defaults → ${ids.length} files`); setOpen(false);
              } },
            { label: 'Exclude everything listed',     run: () => apply({ kind: 'exclude' }, false, 'Exclude'), danger: true },
          ].map((a) => (
            <button key={a.label} onClick={a.run}
              className={cn('block w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50',
                a.danger ? 'text-rose-700' : 'text-slate-700')}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}