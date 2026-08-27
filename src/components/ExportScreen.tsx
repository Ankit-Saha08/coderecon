import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, FolderDown, HardDriveDownload, Loader2, Package,
} from 'lucide-react';
import { useReconStore } from '@/store/useReconStore';
import { assemble } from '@/lib/assemble';
import { buildCsvReport, buildMarkdownReport } from '@/lib/report';
import { buildSession } from '@/lib/session';
import {
  buildZipBlob, canWriteToDisk, downloadBlob, downloadText, timestamp, writePlanToDisk,
} from '@/lib/exportZip';
import { computeStats } from '@/lib/stats';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/cn';

export default function ExportScreen() {
  const { entries, rootA, rootB, options, setScreen, reset } = useReconStore();

  const [rootFolderName, setRootFolderName] = useState(rootA || 'merged-src');
  const [includeReport, setIncludeReport] = useState(true);
  const [includeSession, setIncludeSession] = useState(true);
  const [busy, setBusy] = useState('');
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState('');
  const [showAll, setShowAll] = useState(false);

  const plan = useMemo(() => assemble(entries), [entries]);
  const stats = useMemo(() => computeStats(entries), [entries]);

  const stamp = timestamp();
  const zipName = `${rootFolderName || 'merged-src'}-merged-${stamp}.zip`;

  const reportCtx = {
    entries, plan, rootA, rootB, options,
    outputName: rootFolderName || 'merged-src',
  };
  const markdown = () => buildMarkdownReport(reportCtx);
  const csv = () => buildCsvReport(entries, plan);
  const sessionJson = () => JSON.stringify(buildSession(entries, rootA, rootB, options), null, 2);

  const extras = () => {
    const list: Array<{ path: string; content: string }> = [];
    if (includeReport) {
      list.push({ path: `MERGE-REPORT-${stamp}.md`, content: markdown() });
      list.push({ path: `merge-report-${stamp}.csv`, content: csv() });
    }
    if (includeSession) {
      list.push({ path: `coderecon-session-${stamp}.json`, content: sessionJson() });
    }
    return list;
  };

  async function downloadZip() {
    setBusy('Compressing…'); setPct(0); setResult('');
    try {
      const blob = await buildZipBlob(plan, {
        rootFolderName, extras: extras(), onProgress: (p) => setPct(p),
      });
      downloadBlob(blob, zipName);
      setResult(`Downloaded ${zipName} · ${formatBytes(blob.size)}`);
    } catch (e) {
      setResult(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(''); setPct(0);
    }
  }

  async function saveToFolder() {
    setBusy('Writing…'); setPct(0); setResult('');
    try {
      const dir = await writePlanToDisk(plan, extras(), (d, t) => setPct(Math.round((d / t) * 100)));
      setResult(`Wrote ${plan.files.length} files into "${dir}"`);
    } catch (e) {
      const msg = (e as Error).message;
      setResult(msg.includes('abort') ? '' : `Failed: ${msg}`);
    } finally {
      setBusy(''); setPct(0);
    }
  }

  const preview = showAll ? plan.files : plan.files.slice(0, 200);
  const badge = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700', merged: 'bg-amber-100 text-amber-700' };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Assemble merged output</h2>
          <p className="mt-1 text-sm text-slate-500">
            {plan.files.length.toLocaleString()} files · {formatBytes(plan.stats.totalBytes)} ·
            byte-exact copies of whichever side you chose
          </p>
        </div>
        <button onClick={() => setScreen('reconcile')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to review
        </button>
      </header>

      {stats.needsReview > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><b>{stats.needsReview}</b> files still have no confirmed decision. Their smart defaults will be used.</span>
        </div>
      )}

      {plan.errors.length > 0 && (
        <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Errors</div>
          {plan.errors.slice(0, 8).map((e, i) => <p key={i} className="font-mono text-xs">{e}</p>)}
          {plan.errors.length > 8 && <p className="text-xs">…and {plan.errors.length - 8} more (see report).</p>}
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Warnings</div>
          {plan.warnings.slice(0, 6).map((w, i) => <p key={i} className="font-mono text-xs">{w}</p>)}
          {plan.warnings.length > 6 && <p className="text-xs">…and {plan.warnings.length - 6} more.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { n: plan.stats.fromA, l: 'From A', t: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
          { n: plan.stats.fromB, l: 'From B', t: 'border-blue-200 bg-blue-50 text-blue-800' },
          { n: plan.stats.merged, l: 'Merged', t: 'border-amber-200 bg-amber-50 text-amber-800' },
          { n: plan.stats.renamed, l: 'Renamed', t: 'border-violet-200 bg-violet-50 text-violet-800' },
          { n: plan.stats.excluded, l: 'Excluded', t: 'border-slate-200 bg-slate-50 text-slate-600' },
        ].map((c) => (
          <div key={c.l} className={cn('rounded-xl border p-4', c.t)}>
            <div className="text-2xl font-bold">{c.n.toLocaleString()}</div>
            <div className="text-xs font-medium">{c.l}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Root folder name in output</span>
          <input value={rootFolderName} onChange={(e) => setRootFolderName(e.target.value)}
            placeholder="leave blank for a flat ZIP"
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-slate-400" />
          <span className="mt-1 block text-xs text-slate-500">
            Files land at <code className="font-mono">{rootFolderName ? `${rootFolderName}/…` : '…'}</code>
          </span>
        </label>

        <div className="space-y-2">
          {[
            { v: includeReport, set: setIncludeReport, l: 'Include merge report (.md + .csv) in the ZIP', h: 'Your changelog, since there is no commit history.' },
            { v: includeSession, set: setIncludeSession, l: 'Include session file (.json)', h: 'Lets you reload every decision later.' },
          ].map((o) => (
            <label key={o.l} className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={o.v} onChange={(e) => o.set(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-slate-900" />
              <span>
                <span className="block text-sm font-medium text-slate-800">{o.l}</span>
                <span className="block text-xs text-slate-500">{o.h}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={downloadZip} disabled={!!busy || !plan.files.length}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {busy === 'Compressing…' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          Download merged ZIP
        </button>

        {canWriteToDisk() && (
          <button onClick={saveToFolder} disabled={!!busy || !plan.files.length}
            title="Write files directly into a folder you choose"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {busy === 'Writing…' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
            Save to folder…
          </button>
        )}

        <button onClick={() => downloadText(markdown(), `MERGE-REPORT-${stamp}.md`, 'text/markdown;charset=utf-8')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FileText className="h-3.5 w-3.5" /> Report .md
        </button>
        <button onClick={() => downloadText(csv(), `merge-report-${stamp}.csv`, 'text/csv;charset=utf-8')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <Download className="h-3.5 w-3.5" /> .csv
        </button>
        <button onClick={() => downloadText(sessionJson(), `coderecon-session-${stamp}.json`, 'application/json')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FolderDown className="h-3.5 w-3.5" /> Session .json
        </button>
      </div>

      {!!busy && (
        <div className="w-full max-w-sm">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">{busy} {pct}%</div>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{result}</p>
            <p className="mt-1 text-xs">
              Keep this output as your next baseline — reconciling against it makes the following merge far smaller.
            </p>
            <button onClick={reset} className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-50">
              Start a new comparison
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">Output manifest</h3>
          <span className="text-xs text-slate-500">{plan.files.length.toLocaleString()} files</span>
        </div>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {preview.map((f) => (
              <tr key={f.path} className={f.renamed ? 'bg-violet-50/40' : undefined}>
                <td className="px-4 py-1.5 font-mono text-xs text-slate-700">
                  {rootFolderName && <span className="text-slate-400">{rootFolderName}/</span>}
                  {f.path}
                  {f.renamed && (
                    <span className="ml-2 text-[11px] text-violet-600">← {f.originalPath}</span>
                  )}
                </td>
                <td className="w-20 px-4 py-1.5">
                  <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', badge[f.from])}>{f.from}</span>
                </td>
                <td className="w-24 px-4 py-1.5 text-right font-mono text-xs text-slate-400">{formatBytes(f.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.files.length > 200 && (
          <button onClick={() => setShowAll((v) => !v)}
            className="w-full border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
            {showAll ? 'Show first 200 only' : `Show all ${plan.files.length.toLocaleString()} files`}
          </button>
        )}
      </div>

      {plan.excluded.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Excluded from output ({plan.excluded.length})
          </div>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {plan.excluded.slice(0, 50).map((x) => (
                <tr key={x.entryId}>
                  <td className="px-4 py-1.5 font-mono text-xs text-slate-500 line-through">{x.relPath}</td>
                  <td className="px-4 py-1.5 text-xs text-slate-500">{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}