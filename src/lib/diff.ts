import { diffLines, diffWordsWithSpace } from 'diff';

export interface WordPart { text: string; changed: boolean }
export interface SideCell { num: number; text: string }

export interface DiffRow {
  type: 'ctx' | 'change' | 'add' | 'del' | 'gap';
  left: SideCell | null;
  right: SideCell | null;
  hunk: number;                                   // -1 outside a hunk
  gapLines?: number;
  words?: { left: WordPart[]; right: WordPart[] };
}

export interface FileDiff {
  rows: DiffRow[];
  hunkCount: number;
  added: number;
  removed: number;
  changed: number;
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
  const parts = diffLines(aText, bText, { ignoreWhitespace: !!opts.ignoreWhitespace });

  // ---- Pass 1: raw aligned rows -------------------------------------------
  const raw: DiffRow[] = [];
  let aLine = 1, bLine = 1, i = 0;

  while (i < parts.length) {
    const p = parts[i];

    if (!p.added && !p.removed) {
      for (const t of toLines(p.value)) {
        raw.push({ type: 'ctx', left: { num: aLine++, text: t }, right: { num: bLine++, text: t }, hunk: -1 });
      }
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

    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const l = k < dels.length ? { num: aLine++, text: dels[k] } : null;
      const r = k < adds.length ? { num: bLine++, text: adds[k] } : null;
      raw.push({ type: l && r ? 'change' : l ? 'del' : 'add', left: l, right: r, hunk: -1 });
    }
  }

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

  if (!added && !removed && !changed) {
    return { rows: [], hunkCount: 0, added: 0, removed: 0, changed: 0, identical: true, truncated: false };
  }

  // ---- Pass 3: keep windows around changes, collapse the rest -------------
  const keep = new Array<boolean>(raw.length).fill(false);
  raw.forEach((r, idx) => {
    if (r.type === 'ctx') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(raw.length - 1, idx + context); k++) keep[k] = true;
  });

  const rows: DiffRow[] = [];
  let hunk = -1, inHunk = false, gap = 0;

  for (let idx = 0; idx < raw.length; idx++) {
    if (!keep[idx]) { gap++; inHunk = false; continue; }
    if (gap > 0) { rows.push({ type: 'gap', left: null, right: null, hunk: -1, gapLines: gap }); gap = 0; }
    if (!inHunk) { hunk++; inHunk = true; }
    rows.push({ ...raw[idx], hunk });
  }
  if (gap > 0) rows.push({ type: 'gap', left: null, right: null, hunk: -1, gapLines: gap });

  const truncated = rows.length > MAX_ROWS;
  return {
    rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
    hunkCount: hunk + 1, added, removed, changed, identical: false, truncated,
  };
}