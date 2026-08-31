import type {
  Decision, FileBlob, FileEntry, ScanOptions, SourceFile, Status,
} from '@/types';
import { hashBytes } from './hash';
import { detectRootName, makeMatcher, normalizeSlashes, stripLeadingSegments, baseName } from './paths';
import {
  decodeText, detectLineEnding, isSubsequenceOfLines, looksBinary,
  normalizeEol, whitespaceKey,
} from './text';

export interface IngestResult {
  root: string;
  blobs: Map<string, FileBlob>;   // key = comparison key (maybe lowercased)
  excludedCount: number;
  skippedCount: number;
  totalBytes: number;
}

/** Bounded-concurrency map — sequential awaits over 3,000 files is glacial. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  });
  await Promise.all(runners);
}

export async function ingestSide(
  sources: SourceFile[],
  opts: ScanOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<IngestResult> {
  const paths = sources.map((s) => normalizeSlashes(s.sourcePath));
  const root = detectRootName(paths);
  const isExcluded = makeMatcher(opts.excludeGlobs);

  const kept: Array<{ src: SourceFile; relPath: string }> = [];
  let excludedCount = 0;

  sources.forEach((src, i) => {
    const relPath = root ? stripLeadingSegments(paths[i], 1) : paths[i];
    if (!relPath) return;
    if (isExcluded(relPath) || isExcluded(paths[i])) { excludedCount++; return; }
    kept.push({ src, relPath });
  });

  const blobs = new Map<string, FileBlob>();
  const maxBytes = opts.maxDiffFileSizeKB * 1024;
  let done = 0;
  let skippedCount = 0;
  let totalBytes = 0;

  await mapPool(kept, 8, async ({ src, relPath }) => {
    try {
      const buf = await src.file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      totalBytes += bytes.length;

      const hash = await hashBytes(bytes);
      const tooLarge = bytes.length > maxBytes;
      const binaryByBytes = looksBinary(bytes);

      let isBinary = binaryByBytes;
      let text: string | null = null;
      let lineEnding: FileBlob['lineEnding'] = 'NONE';

      if (!binaryByBytes && !tooLarge) {
        const decoded = decodeText(bytes);
        if (decoded) {
          text = opts.normalizeLineEndings ? normalizeEol(decoded.text) : decoded.text;
          lineEnding = detectLineEnding(decoded.text);
        } else {
          isBinary = true;               // not valid UTF-8 → treat as binary
        }
      }

      const key = opts.caseInsensitivePaths ? relPath.toLowerCase() : relPath;
      blobs.set(key, {
        relPath, name: baseName(relPath), size: bytes.length,
        hash, isBinary, tooLarge, text, lineEnding, raw: src.file,
      });
    } catch {
      skippedCount++;                    // unreadable / permission denied
    } finally {
      onProgress?.(++done, kept.length);
    }
  });

  return { root, blobs, excludedCount, skippedCount, totalBytes };
}

/* ---------------------------------------------------------------- */

function classify(
  a: FileBlob | undefined,
  b: FileBlob | undefined,
  dirsA: Set<string>,
  dirsB: Set<string>,
  key: string,
): { status: Status; hint?: string } {
  if (a && !b) return dirsB.has(key)
    ? { status: 'typeConflict', hint: 'File in A, but a folder of the same name in B' }
    : { status: 'onlyInA' };

  if (b && !a) return dirsA.has(key)
    ? { status: 'typeConflict', hint: 'File in B, but a folder of the same name in A' }
    : { status: 'onlyInB' };

  if (!a || !b) return { status: 'identical' };            // unreachable
  if (a.hash === b.hash) return { status: 'identical' };
  if (a.isBinary || b.isBinary) return { status: 'binaryDiff' };
  if (a.tooLarge || b.tooLarge)
    return { status: 'binaryDiff', hint: 'Too large to diff — compared by hash only' };

  const ta = a.text ?? '';
  const tb = b.text ?? '';

  if (normalizeEol(ta) === normalizeEol(tb))
    return { status: 'whitespaceOnly', hint: `Line endings only (${a.lineEnding} vs ${b.lineEnding})` };

  if (whitespaceKey(ta) === whitespaceKey(tb))
    return { status: 'whitespaceOnly', hint: 'Whitespace / indentation / blank lines only' };

  if (isSubsequenceOfLines(ta, tb))
    return { status: 'modified', hint: 'B appears to be A plus additions — taking B is likely safe' };

  if (isSubsequenceOfLines(tb, ta))
    return { status: 'modified', hint: 'A appears to be B plus additions — taking A is likely safe' };

  return { status: 'modified' };
}

/**
 * Smart defaults. `autoResolved: true` means the engine is confident and the
 * file needs no human click. Everything else surfaces in "Needs review",
 * and Step 10 will block export while any remain.
 */
function seedDecision(status: Status, hint?: string): { decision: Decision; autoResolved: boolean } {
  switch (status) {
    case 'identical':      return { decision: { kind: 'takeA' }, autoResolved: true };
    case 'onlyInA':        return { decision: { kind: 'takeA' }, autoResolved: true };
    case 'onlyInB':        return { decision: { kind: 'takeB' }, autoResolved: true };
    case 'whitespaceOnly': return { decision: { kind: 'takeA' }, autoResolved: true };
    case 'modified':
      return hint?.startsWith('B appears')
        ? { decision: { kind: 'takeB' }, autoResolved: false }
        : { decision: { kind: 'takeA' }, autoResolved: false };
    default:               return { decision: { kind: 'takeA' }, autoResolved: false };
  }
}

/** All directory prefixes present in a key set — used for type-conflict detection. */
function dirPrefixes(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const parts = k.split('/');
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return out;
}

export function reconcile(a: IngestResult, b: IngestResult): FileEntry[] {
  const dirsA = dirPrefixes(a.blobs.keys());
  const dirsB = dirPrefixes(b.blobs.keys());
  const keys = Array.from(new Set([...a.blobs.keys(), ...b.blobs.keys()])).sort((x, y) =>
    x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }),
  );

  return keys.map((key) => {
    const ba = a.blobs.get(key);
    const bb = b.blobs.get(key);
    const { status, hint } = classify(ba, bb, dirsA, dirsB, key);
    const { decision, autoResolved } = seedDecision(status, hint);
    return {
      id: key,
      relPath: ba?.relPath ?? bb?.relPath ?? key,
      a: ba, b: bb,
      status, decision, autoResolved,
      reviewed: false,
      note: hint,
    };
  });
}