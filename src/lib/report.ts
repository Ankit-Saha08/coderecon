import type { FileEntry, ScanOptions } from '@/types';
import type { AssemblyPlan } from './assemble';
import { computeStats } from './stats';
import { STATUS_META } from './statusMeta';
import { formatBytes } from './text';

interface Ctx {
  entries: FileEntry[];
  plan: AssemblyPlan;
  rootA: string;
  rootB: string;
  options: ScanOptions;
  outputName: string;
}

const describe = (e: FileEntry): string => {
  const d = e.decision;
  switch (d.kind) {
    case 'takeA':    return 'Keep A';
    case 'takeB':    return 'Keep B';
    case 'keepBoth': return `Keep both (${d.renameSide} → *${d.suffix}.*)`;
    case 'manual':   return 'Manual edit';
    case 'hunks':    return 'Hunk merge';
    case 'exclude':  return 'Excluded';
  }
};

const esc = (s: string) => s.replace(/\|/g, '\\|');

export function buildMarkdownReport(ctx: Ctx): string {
  const { entries, plan, rootA, rootB, options, outputName } = ctx;
  const s = computeStats(entries);
  const now = new Date();
  const L: string[] = [];

  L.push(`# CodeRecon Merge Report`, '');
  L.push(`**Generated:** ${now.toLocaleString()} (${now.toISOString()})  `);
  L.push(`**Folder A (current/base):** \`${rootA || '(flat)'}\`  `);
  L.push(`**Folder B (incoming):** \`${rootB || '(flat)'}\`  `);
  L.push(`**Output:** \`${outputName}\``, '');
  L.push(`> No version control was used. This report is the authoritative record of what changed and why.`, '');

  L.push(`## Summary`, '');
  L.push(`| Metric | Count |`, `| --- | ---: |`);
  L.push(`| Unique paths compared | ${s.total} |`);
  L.push(`| Identical | ${s.identical} |`);
  L.push(`| Modified | ${s.modified} |`);
  L.push(`| Whitespace / EOL only | ${s.whitespaceOnly} |`);
  L.push(`| Only in A | ${s.onlyInA} |`);
  L.push(`| Only in B | ${s.onlyInB} |`);
  L.push(`| Binary differs | ${s.binaryDiff} |`);
  L.push(`| Type conflicts | ${s.typeConflict} |`);
  L.push(`| Human-reviewed | ${s.reviewed} |`);
  L.push('');

  L.push(`## Output composition`, '');
  L.push(`| Metric | Count |`, `| --- | ---: |`);
  L.push(`| Files written | ${plan.files.length} |`);
  L.push(`| Taken from A | ${plan.stats.fromA} |`);
  L.push(`| Taken from B | ${plan.stats.fromB} |`);
  L.push(`| Manually merged | ${plan.stats.merged} |`);
  L.push(`| Renamed (keep both / collision) | ${plan.stats.renamed} |`);
  L.push(`| Excluded | ${plan.stats.excluded} |`);
  L.push(`| Total size | ${formatBytes(plan.stats.totalBytes)} |`);
  L.push('');

  if (plan.errors.length) {
    L.push(`## ⚠️ Errors`, '');
    plan.errors.forEach((e) => L.push(`- ${e}`));
    L.push('');
  }
  if (plan.warnings.length) {
    L.push(`## Warnings`, '');
    plan.warnings.forEach((w) => L.push(`- ${w}`));
    L.push('');
  }

  const changed = entries.filter((e) => e.status !== 'identical');
  if (changed.length) {
    L.push(`## Decisions on non-identical files (${changed.length})`, '');
    L.push(`| Path | Status | Decision | Reviewed | A size | B size | Note |`);
    L.push(`| --- | --- | --- | :-: | ---: | ---: | --- |`);
    for (const e of changed) {
      L.push(
        `| \`${esc(e.relPath)}\` | ${STATUS_META[e.status].label} | ${describe(e)} | ` +
        `${e.reviewed ? '✅' : e.autoResolved ? 'auto' : '—'} | ` +
        `${e.a ? formatBytes(e.a.size) : '—'} | ${e.b ? formatBytes(e.b.size) : '—'} | ` +
        `${esc(e.note?.trim() ?? '')} |`,
      );
    }
    L.push('');
  }

  const renamed = plan.files.filter((f) => f.renamed);
  if (renamed.length) {
    L.push(`## Renamed in output (${renamed.length})`, '');
    L.push(`| Original | Written as | From |`, `| --- | --- | :-: |`);
    renamed.forEach((f) => L.push(`| \`${esc(f.originalPath)}\` | \`${esc(f.path)}\` | ${f.from} |`));
    L.push('');
  }

  if (plan.excluded.length) {
    L.push(`## Excluded from output (${plan.excluded.length})`, '');
    L.push(`| Path | Reason |`, `| --- | --- |`);
    plan.excluded.forEach((x) => L.push(`| \`${esc(x.relPath)}\` | ${esc(x.reason)} |`));
    L.push('');
  }

  L.push(`## Scan settings`, '');
  L.push('```json');
  L.push(JSON.stringify(options, null, 2));
  L.push('```', '');
  L.push(`---`, `*Produced by CodeRecon — Codebase Reconciliation Studio. All processing ran locally in the browser.*`);

  return L.join('\n');
}

export function buildCsvReport(entries: FileEntry[], plan: AssemblyPlan): string {
  const outByEntry = new Map<string, string[]>();
  for (const f of plan.files) {
    const list = outByEntry.get(f.entryId) ?? [];
    list.push(f.path);
    outByEntry.set(f.entryId, list);
  }

  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ['path', 'status', 'decision', 'reviewed', 'autoResolved',
     'sizeA', 'sizeB', 'hashA', 'hashB', 'eolA', 'eolB', 'outputPaths', 'note']
      .map(q).join(','),
  ];

  for (const e of [...entries].sort((x, y) => x.relPath.localeCompare(y.relPath))) {
    rows.push([
      e.relPath, e.status, describe(e), e.reviewed ? 'yes' : 'no', e.autoResolved ? 'yes' : 'no',
      e.a?.size ?? '', e.b?.size ?? '',
      e.a?.hash.slice(0, 16) ?? '', e.b?.hash.slice(0, 16) ?? '',
      e.a?.lineEnding ?? '', e.b?.lineEnding ?? '',
      (outByEntry.get(e.id) ?? []).join(' | '),
      e.note?.trim() ?? '',
    ].map(q).join(','));
  }

  return rows.join('\r\n');
}