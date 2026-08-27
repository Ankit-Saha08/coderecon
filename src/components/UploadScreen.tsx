import { useState } from 'react';
import { FolderOpen, Loader2, Settings2, ShieldCheck, X } from 'lucide-react';
import type { Side } from '@/types';
import { useReconStore } from '@/store/useReconStore';
import { filesFromDataTransfer, filesFromInput } from '@/lib/ingest';
import { detectRootName } from '@/lib/paths';
import { cn } from '@/lib/cn';

const dirProps = { webkitdirectory: '', directory: '', mozdirectory: '' } as Record<string, string>;

const ROLE: Record<Side, { title: string; sub: string; accent: string }> = {
  A: { title: 'Current / Base', sub: 'The version you trust today', accent: 'emerald' },
  B: { title: 'Incoming', sub: 'The version with new work to fold in', accent: 'blue' },
};

function DropZone({ side }: { side: Side }) {
  const files = useReconStore((s) => (side === 'A' ? s.filesA : s.filesB));
  const setSide = useReconStore((s) => s.setSide);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const root = files.length ? detectRootName(files.map((f) => f.sourcePath)) : '';
  const role = ROLE[side];

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault(); setOver(false); setBusy(true);
        try {
          const picked = await filesFromDataTransfer(e.dataTransfer);
          if (picked.length) setSide(side, picked, detectRootName(picked.map((p) => p.sourcePath)));
        } finally { setBusy(false); }
      }}
      className={cn(
        'relative flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-6 text-center transition',
        over ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400',
        files.length && 'border-solid',
      )}
    >
      <span className={cn(
        'absolute left-4 top-4 rounded-md px-2 py-0.5 text-xs font-bold',
        side === 'A' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700',
      )}>
        {side}
      </span>

      {busy ? <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            : <FolderOpen className={cn('h-8 w-8', files.length ? 'text-slate-700' : 'text-slate-300')} />}

      <div className="mt-3 text-base font-semibold text-slate-800">{role.title}</div>
      <div className="text-xs text-slate-500">{role.sub}</div>

      {files.length ? (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <div className="font-mono font-semibold text-slate-800">{root || '(flat file list)'}</div>
          <div className="text-slate-500">{files.length.toLocaleString()} files</div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-slate-400">Click to browse, or drag a folder here</div>
      )}

      <input
        type="file" multiple {...dirProps} className="hidden"
        onChange={(e) => {
          const picked = filesFromInput(e.target.files);
          if (picked.length) setSide(side, picked, detectRootName(picked.map((p) => p.sourcePath)));
        }}
      />
    </label>
  );
}

function ExclusionEditor() {
  const globs = useReconStore((s) => s.options.excludeGlobs);
  const setOptions = useReconStore((s) => s.setOptions);
  const [draft, setDraft] = useState('');

  const add = () => {
    const items = draft.split(',').map((x) => x.trim()).filter(Boolean);
    if (items.length) setOptions({ excludeGlobs: Array.from(new Set([...globs, ...items])) });
    setDraft('');
  };

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Exclude patterns</div>
      <div className="flex flex-wrap gap-1.5">
        {globs.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 font-mono text-xs text-slate-600">
            {g}
            <button type="button" onClick={() => setOptions({ excludeGlobs: globs.filter((x) => x !== g) })}
              className="rounded-full p-0.5 hover:bg-slate-300">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        placeholder="add pattern, e.g. *.snap  (Enter to add)"
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs outline-none focus:border-slate-400"
      />
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: {
  label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900" />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export default function UploadScreen() {
  const { filesA, filesB, options, setOptions, runScan, isScanning, stage, progress, scanError } =
    useReconStore();
  const [showOptions, setShowOptions] = useState(false);
  const ready = filesA.length > 0 && filesB.length > 0;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Code<span className="text-change">Recon</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Codebase Reconciliation Studio — compare two <code className="font-mono">src</code> folders, decide what to keep, assemble one merged tree.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <DropZone side="A" />
        <DropZone side="B" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <button onClick={() => setShowOptions((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700">
          <Settings2 className="h-4 w-4" />
          Scan options
          <span className="ml-auto text-xs text-slate-400">{showOptions ? 'hide' : 'show'}</span>
        </button>

        {showOptions && (
          <div className="grid gap-5 border-t border-slate-100 p-4 sm:grid-cols-2">
            <ExclusionEditor />
            <div className="space-y-3">
              <Toggle label="Normalize line endings" hint="Treat CRLF and LF as equal. Leave on unless you care about EOL."
                value={options.normalizeLineEndings} onChange={(v) => setOptions({ normalizeLineEndings: v })} />
              <Toggle label="Ignore whitespace in diffs" hint="Hides indentation-only changes in the diff view."
                value={options.ignoreWhitespace} onChange={(v) => setOptions({ ignoreWhitespace: v })} />
              <Toggle label="Case-insensitive paths" hint="Pair Utils/ with utils/. Useful across Windows and macOS."
                value={options.caseInsensitivePaths} onChange={(v) => setOptions({ caseInsensitivePaths: v })} />
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Max diff size (KB)</span>
                <input type="number" min={64} step={64} value={options.maxDiffFileSizeKB}
                  onChange={(e) => setOptions({ maxDiffFileSizeKB: Number(e.target.value) || 2048 })}
                  className="mt-1 w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-slate-400" />
                <span className="mt-0.5 block text-xs text-slate-500">Larger files are compared by hash only.</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button onClick={runScan} disabled={!ready || isScanning}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          {isScanning && <Loader2 className="h-4 w-4 animate-spin" />}
          {isScanning ? stage || 'Scanning…' : 'Compare folders'}
        </button>

        {isScanning && (
          <div className="w-full max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-center font-mono text-xs text-slate-500">
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
            </div>
          </div>
        )}

        {!ready && !isScanning && (
          <p className="text-xs text-slate-400">Select both folders to continue</p>
        )}
        {scanError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{scanError}</p>
        )}

        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Everything runs in your browser. No file is uploaded anywhere.
        </p>
      </div>
    </div>
  );
}