import type { FileEntry, Side } from '@/types';

export interface OutputFile {
  path: string;                 // final path inside the merged tree
  from: Side | 'merged';
  originalPath: string;
  entryId: string;
  renamed: boolean;
  size: number;
  raw?: File;                   // byte-exact passthrough (preferred)
  bytes?: Uint8Array;           // synthesized content
}

export interface ExcludedFile {
  entryId: string;
  relPath: string;
  reason: string;
}

export interface AssemblyPlan {
  files: OutputFile[];
  excluded: ExcludedFile[];
  warnings: string[];
  errors: string[];
  stats: {
    fromA: number; fromB: number; merged: number;
    renamed: number; excluded: number; totalBytes: number;
  };
}

/**
 * Insert a suffix before the final extension.
 *   utils/date.ts        + .incoming -> utils/date.incoming.ts
 *   utils/a.test.ts      + .incoming -> utils/a.test.incoming.ts
 *   .env                 + .incoming -> .env.incoming      (leading dot is not an ext)
 *   Makefile             + .incoming -> Makefile.incoming
 */
export function insertSuffix(path: string, suffix: string): string {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return `${dir}${base}${suffix}`;
  return `${dir}${base.slice(0, dot)}${suffix}${base.slice(dot)}`;
}

/** Guarantee uniqueness by appending -2, -3, … before the extension. */
function uniquePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) return path;
  for (let n = 2; n < 1000; n++) {
    const candidate = insertSuffix(path, `-${n}`);
    if (!taken.has(candidate)) return candidate;
  }
  return insertSuffix(path, `-${Date.now()}`);
}

export function assemble(entries: FileEntry[]): AssemblyPlan {
  const files: OutputFile[] = [];
  const excluded: ExcludedFile[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const taken = new Set<string>();

  const push = (f: Omit<OutputFile, 'renamed'> & { renamed?: boolean }) => {
    const path = uniquePath(f.path, taken);
    if (path !== f.path) {
      warnings.push(`Path collision resolved: "${f.path}" written as "${path}".`);
    }
    taken.add(path);
    files.push({ ...f, path, renamed: f.renamed || path !== f.originalPath });
  };

  const sorted = [...entries].sort((x, y) => x.relPath.localeCompare(y.relPath));

  for (const e of sorted) {
    const d = e.decision;

    if (d.kind === 'exclude') {
      excluded.push({ entryId: e.id, relPath: e.relPath, reason: e.note?.trim() || 'Excluded by decision' });
      continue;
    }

    if (d.kind === 'takeA' || d.kind === 'takeB') {
      const side: Side = d.kind === 'takeA' ? 'A' : 'B';
      const blob = side === 'A' ? e.a : e.b;
      if (!blob) {
        errors.push(`${e.relPath}: decision is "keep ${side}" but the file does not exist in ${side}. Skipped.`);
        continue;
      }
      push({
        path: e.relPath, from: side, originalPath: e.relPath,
        entryId: e.id, size: blob.size, raw: blob.raw,
      });
      continue;
    }

    if (d.kind === 'keepBoth') {
      if (!e.a || !e.b) {
        errors.push(`${e.relPath}: "keep both" needs the file on both sides. Skipped.`);
        continue;
      }
      const keepSide: Side = d.renameSide === 'B' ? 'A' : 'B';
      const renameSide: Side = d.renameSide;
      const keepBlob = keepSide === 'A' ? e.a : e.b;
      const renameBlob = renameSide === 'A' ? e.a : e.b;

      push({
        path: e.relPath, from: keepSide, originalPath: e.relPath,
        entryId: e.id, size: keepBlob.size, raw: keepBlob.raw,
      });
      push({
        path: insertSuffix(e.relPath, d.suffix), from: renameSide, originalPath: e.relPath,
        entryId: e.id, size: renameBlob.size, raw: renameBlob.raw, renamed: true,
      });
      continue;
    }

    if (d.kind === 'manual') {
      const bytes = new TextEncoder().encode(d.content);
      push({
        path: e.relPath, from: 'merged', originalPath: e.relPath,
        entryId: e.id, size: bytes.byteLength, bytes,
      });
      continue;
    }

    // d.kind === 'hunks' — Phase 3
    errors.push(`${e.relPath}: hunk-level merging is not implemented yet. Skipped.`);
  }

  const stats = {
    fromA: files.filter((f) => f.from === 'A').length,
    fromB: files.filter((f) => f.from === 'B').length,
    merged: files.filter((f) => f.from === 'merged').length,
    renamed: files.filter((f) => f.renamed).length,
    excluded: excluded.length,
    totalBytes: files.reduce((n, f) => n + f.size, 0),
  };

  return { files, excluded, warnings, errors, stats };
}