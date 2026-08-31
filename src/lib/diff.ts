import { diffLines, diffWordsWithSpace } from 'diff';
import type { HunkPick } from '@/types';

export interface WordPart { text: string; changed: boolean }
export interface SideCell { num: number; text: string }

export interface DiffRow {
  type: 'ctx' | 'change' | 'add' | 'del' | 'gap';
  left: SideCell | null;
  right: SideCell | null;
  hunk: number;                 // -1 outside a hunk
  hunkStart?: boolean;          // first row of its hunk → UI injects controls
  gapLines?: number;
  words?: { left: WordPart[]; right: WordPart[] };
}

export interface HunkInfo {
  index: number;
  aStart: number; aCount: number;
  bStart: number; bCount: number;
  kind: 'change' | 'add' | 'del';
}

/** Ordered reconstruction plan: context blocks alternating with change blocks. */
export type MergeSegment =
  | { kind: 'ctx'; lines: string[] }
  | { kind: 'hunk'; index: number; aLines: string[]; bLines: string[] };

export interface FileDiff {
  rows: DiffRow[];              // display rows (collapsed + capped)
  hunks: HunkInfo[];
  segments: MergeSegment[];     // complete — never collapsed or capped
  exact: boolean;               // false ⇒ segments are NOT safe to compose from
  hunkCount: number;
  added: number; removed: number; changed: number;
  identical: boolean;
  truncated: boolean;
}

const MAX_ROWS = 6000;
const WORD_ROW_BUDGET = 600;
const WORD_LINE_MAX = 500;

function toLines(v: string): string[] {
  const lines = v.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function wordDiff(a: string, b: string): { left: WordPart[]; right: WordPart[] } {
  const left: WordPart[] = [], right: WordPart[] = [];
  for (const p of diffWordsWithSpace(a, b)) {
    if (p.added) right.push({ text: p.value, changed: true });
    else if (p.removed) left.push({ text: p.value, changed: true });
    else { left.push({ text: p.value, changed: false }); right.push({ text: p.value, changed: false }); }
  }
  return { left, right };
}

export function buildDiff(
  aText: string,
  bText: string,
  opts: { contextLines?: number; ignoreWhitespace?: boolean } = {},
): FileDiff {
  const context = opts.contextLines ?? 3;
  const exact = !opts.ignoreWhitespace;
  const parts = diffLines(aText, bText, { ignoreWhitespace: !!opts.ignoreWhitespace });

  // ---- Pass 1: raw aligned rows + segments + hunk metadata ----------------
  const raw: DiffRow[] = [];
  const segments: MergeSegment[] = [];
  const hunks: HunkInfo[] = [];
  let aLine = 1, bLine = 1, i = 0, hunkIdx = 0;
  let ctxBuf: string[] = [];

  const flushCtx = () => {
    if (ctxBuf.length) { segments.push({ kind: 'ctx', lines: ctxBuf }); ctxBuf = []; }
  };

  while (i < parts.length) {
    const p = parts[i];

    if (!p.added && !p.removed) {
      const lines = toLines(p.value);
      for (const t of lines) {
        raw.push({ type: 'ctx', left: { num: aLine++, text: t }, right: { num: bLine++, text: t }, hunk: -1 });
      }
      ctxBuf.push(...lines);
      i++;
      continue;
    }

    let dels: string[] = [], adds: string[] = [];
    if (p.removed) {
      dels = toLines(p.value); i++;
      if (i < parts.length && parts[i].added) { adds = toLines(parts[i].value); i++; }
    } else {
      adds = toLines(p.value); i++;
      if (i < parts.length && parts[i].removed) { dels = toLines(parts[i].value); i++; }
    }

    flushCtx();
    const index = hunkIdx++;
    hunks.push({
      index,
      aStart: dels.length ? aLine : 0, aCount: dels.length,
      bStart: adds.length ? bLine : 0, bCount: adds.length,
      kind: dels.length && adds.length ? 'change' : dels.length ? 'del' : 'add',
    });
    segments.push({ kind: 'hunk', index, aLines: dels, bLines: adds });

    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const l = k < dels.length ? { num: aLine++, text: dels[k] } : null;
      const r = k < adds.length ? { num: bLine++, text: adds[k] } : null;
      raw.push({
        type: l && r ? 'change' : l ? 'del' : 'add',
        left: l, right: r, hunk: index, hunkStart: k === 0,
      });
    }
  }
  flushCtx();

  // ---- Pass 2: stats + word-level highlighting ----------------------------
  let added = 0, removed = 0, changed = 0;
  for (const r of raw) {
    if (r.type === 'add') added++;
    else if (r.type === 'del') removed++;
    else if (r.type === 'change') changed++;
  }

  if (changed <= WORD_ROW_BUDGET) {
    for (const r of raw) {
      if (r.type !== 'change' || !r.left || !r.right) continue;
      if (r.left.text.length > WORD_LINE_MAX || r.right.text.length > WORD_LINE_MAX) continue;
      r.words = wordDiff(r.left.text, r.right.text);
    }
  }

  const identical = !added && !removed && !changed;
  if (identical) {
    return {
      rows: [], hunks: [], segments, exact, hunkCount: 0,
      added: 0, removed: 0, changed: 0, identical: true, truncated: false,
    };
  }

  // ---- Pass 3: keep windows around changes, collapse the rest -------------
  const keep = new Array<boolean>(raw.length).fill(false);
  raw.forEach((r, idx) => {
    if (r.type === 'ctx') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(raw.length - 1, idx + context); k++) keep[k] = true;
  });

  const rows: DiffRow[] = [];
  let gap = 0;
  for (let idx = 0; idx < raw.length; idx++) {
    if (!keep[idx]) { gap++; continue; }
    if (gap > 0) { rows.push({ type: 'gap', left: null, right: null, hunk: -1, gapLines: gap }); gap = 0; }
    rows.push(raw[idx]);
  }
  if (gap > 0) rows.push({ type: 'gap', left: null, right: null, hunk: -1, gapLines: gap });

  const truncated = rows.length > MAX_ROWS;
  return {
    rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
    hunks, segments, exact,
    hunkCount: hunks.length,
    added, removed, changed, identical: false, truncated,
  };
}

/* ------------------------------------------------------------ MERGE HELPERS */

type HunkSegment = Extract<MergeSegment, { kind: 'hunk' }>;

/**
 * Conservative defaults, in keeping with "nothing is silently dropped":
 *   B deleted lines  → keep A  (don't lose code without an explicit choice)
 *   B added lines    → take B  (that's the new work you came for)
 *   genuine change   → take B  (incoming wins, but you review it)
 */
export function defaultPick(seg: HunkSegment): HunkPick {
  if (seg.aLines.length && !seg.bLines.length) return 'A';
  if (!seg.aLines.length && seg.bLines.length) return 'B';
  return 'B';
}

export function buildDefaultPicks(segments: MergeSegment[]): Record<number, HunkPick> {
  const picks: Record<number, HunkPick> = {};
  for (const s of segments) if (s.kind === 'hunk') picks[s.index] = defaultPick(s);
  return picks;
}

export function composeMerge(
  segments: MergeSegment[],
  picks: Record<number, HunkPick>,
  trailingNewline: boolean,
): string {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'ctx') { out.push(...seg.lines); continue; }
    const pick = picks[seg.index] ?? defaultPick(seg);
    if (pick === 'A') out.push(...seg.aLines);
    else if (pick === 'B') out.push(...seg.bLines);
    else if (pick === 'both') out.push(...seg.aLines, ...seg.bLines);
    // 'none' → emit nothing
  }
  let text = out.join('\n');
  if (trailingNewline && text.length) text += '\n';
  return text;
}

export interface PickSummary { A: number; B: number; both: number; none: number; total: number }

export function summarizePicks(
  segments: MergeSegment[],
  picks: Record<number, HunkPick>,
): PickSummary {
  const s: PickSummary = { A: 0, B: 0, both: 0, none: 0, total: 0 };
  for (const seg of segments) {
    if (seg.kind !== 'hunk') continue;
    s.total++;
    s[picks[seg.index] ?? defaultPick(seg)]++;
  }
  return s;
}

export const wantsTrailingNewline = (aText: string, bText: string): boolean =>
  aText.endsWith('\n') || bText.endsWith('\n');

/* -------------------------------------------------------------- SHARED CACHE
   DecisionBar, DiffViewer, MergePreview and assemble() must all agree on hunk
   numbering. One cache keyed by content hashes guarantees that, and avoids
   re-diffing the same file four times per render. */
const exactCache = new Map<string, FileDiff>();

export function getExactDiff(key: string, aText: string, bText: string): FileDiff {
  const hit = exactCache.get(key);
  if (hit) return hit;
  const d = buildDiff(aText, bText, { ignoreWhitespace: false });
  if (exactCache.size > 60) exactCache.clear();
  exactCache.set(key, d);
  return d;
}

export const diffKey = (id: string, aHash: string, bHash: string) => `${id}|${aHash}|${bHash}`;