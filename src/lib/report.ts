import type { FileEntry, ScanOptions } from '@/types';
import type { AssemblyPlan } from './assemble';
import { diffKey, getExactDiff, summarizePicks } from './diff';
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
    case 'manual':   return `Manual edit (${d.content.split('\n').length} lines)`;
    case 'exclude':  return 'Excluded';
    case 'hunks': {
      const picks = Object.values(d.picks);
      const c = (k: string) => picks.filter((x) => x === k).length;
      return `Hunk merge (${c('A')}×A, ${c('B')}×B, ${c('both')}×both, ${c('none')}×drop)`;
    }
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
  L.push(`| Composed (merged / manual) | ${plan.stats.merged} |`);
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

  /* ------------------------------------------------- Phase 3: merged files */
  const merged = entries.filter(
    (e) => e.decision.kind === 'hunks' || e.decision.kind === 'manual',
  );
  if (merged.length) {
    L.push(`## Composed files (${merged.length})`, '');
    L.push(`> These files exist in neither A nor B in this exact form. They were assembled here, and are written as UTF-8.`, '');
    L.push(`| Path | Method | Composition | Note |`, `| --- | --- | --- | --- |`);
    for (const e of merged) {
      let composition = '—';
      let method = 'Manual edit';
      if (e.decision.kind === 'hunks' && e.a && e.b) {
        method = 'Hunk merge';
        const d = getExactDiff(diffKey(e.id, e.a.hash, e.b.hash), e.a.text ?? '', e.b.text ?? '');
        const p = summarizePicks(d.segments, e.decision.picks);
        composition = `${p.total} hunks → ${p.A} from A, ${p.B} from B, ${p.both} both, ${p.none} dropped`;
      } else if (e.decision.kind === 'manual') {
        composition = `${e.decision.content.split('\n').length} lines, hand-written`;
      }
      L.push(`| \`${esc(e.relPath)}\` | ${method} | ${composition} | ${esc(e.note?.trim() ?? '')} |`);
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